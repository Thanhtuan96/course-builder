import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const COURSES_DIR = process.env.COURSES_DIR || './courses';

// Initialize Express
const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure courses directory exists
if (!existsSync(COURSES_DIR)) {
  mkdirSync(COURSES_DIR, { recursive: true });
}

// Helper: Get all courses
function getCourses() {
  const courses = [];
  
  if (!existsSync(COURSES_DIR)) {
    return courses;
  }
  
  const entries = readdirSync(COURSES_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const courseDir = join(COURSES_DIR, entry.name);
      const courseFile = join(courseDir, 'COURSE.md');
      
      let metadata = { name: entry.name, slug: entry.name, description: '' };
      
      if (existsSync(courseFile)) {
        try {
          const content = readFileSync(courseFile, 'utf-8');
          // Parse title from first heading
          const titleMatch = content.match(/^#\s+(.+)$/m);
          if (titleMatch) {
            metadata.name = titleMatch[1];
          }
          // Get description from first paragraph after title
          const descMatch = content.match(/^#\s+.+\n\n(.+?)(?:\n\n#|\n$)/m);
          if (descMatch) {
            metadata.description = descMatch[1].substring(0, 200);
          }
        } catch (e) {
          // Ignore read errors
        }
      }
      
      courses.push(metadata);
    }
  }
  
  return courses;
}

// Helper: Get course file content
function getCourseFile(slug, file) {
  const validFiles = ['COURSE.md', 'LECTURE.md', 'NOTES.md', 'CAPSTONE.md'];
  
  // Sanitize filename
  const sanitizedFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!validFiles.includes(sanitizedFile)) {
    return null;
  }
  
  const filePath = join(COURSES_DIR, slug, sanitizedFile);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
}

// Helper: Save course file
function saveCourseFile(slug, file, content) {
  const validFiles = ['COURSE.md', 'LECTURE.md', 'NOTES.md', 'CAPSTONE.md'];
  
  // Sanitize filename
  const sanitizedFile = file.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!validFiles.includes(sanitizedFile)) {
    return { success: false, error: 'Invalid file' };
  }
  
  const courseDir = join(COURSES_DIR, slug);
  const filePath = join(courseDir, sanitizedFile);
  
  // Ensure course directory exists
  if (!existsSync(courseDir)) {
    mkdirSync(courseDir, { recursive: true });
  }
  
  try {
    writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// API Routes

// GET /api/courses - List all courses
app.get('/api/courses', (req, res) => {
  const courses = getCourses();
  res.json(courses);
});

// GET /api/courses/:slug/:file - Get course file content
app.get('/api/courses/:slug/:file', (req, res) => {
  const { slug, file } = req.params;
  const content = getCourseFile(slug, file);
  
  if (content === null) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json({ content });
});

// POST /api/courses/:slug/:file - Save course file content
app.post('/api/courses/:slug/:file', (req, res) => {
  const { slug, file } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  const result = saveCourseFile(slug, file, content);
  
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }
  
  res.json({ success: true });
});

// POST /api/chat - Stream Claude responses via SSE
app.post('/api/chat', (req, res) => {
  const { messages, courseSlug } = req.body;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  // Get API key
  const apiKey = process.env.ANTHROPIC_API_KEY 
    || process.env.CLAUDE_API_KEY 
    || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ error: 'No API key configured' })}\n\n`);
    res.end();
    return;
  }
  
  // Build messages for API
  const apiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));
  
  // Determine API provider
  let apiUrl = 'https://api.anthropic.com/v1/messages';
  let headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };
  
  // Check for OpenAI
  if (process.env.OPENAI_API_KEY) {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    apiMessages.unshift({
      role: 'system',
      content: 'You are a Socratic tutor. Teach by asking questions, never give direct answers. Guide students to discover concepts themselves through thoughtful questioning.'
    });
  }
  
  // Make API request
  fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(process.env.OPENAI_API_KEY ? {
        model: 'gpt-4o',
        messages: apiMessages,
        stream: true
      } : {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: apiMessages,
        stream: true
      })
    })
  }).then(response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            
            try {
              if (process.env.OPENAI_API_KEY) {
                // OpenAI format
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  res.write(`data: ${JSON.stringify({ content: parsed.choices[0].delta.content })}\n\n`);
                }
              } else {
                // Anthropic format
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  res.write(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`);
                }
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
        
        read();
      });
    }
    
    read();
  }).catch(error => {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  });
});

// POST /api/notify - Trigger broadcast (placeholder for WebSocket)
app.post('/api/notify', (req, res) => {
  const { courseSlug, lectureSlug } = req.body;
  // WebSocket broadcast would go here in full implementation
  res.json({ success: true, message: 'Notification sent' });
});

// Development: Start Vite dev server
if (NODE_ENV !== 'production') {
  const { spawn } = await import('child_process');
  
  console.log(`🔧 Starting Vite dev server...`);
  const vite = spawn('npm', ['run', 'dev'], {
    cwd: join(__dirname, 'client'),
    stdio: 'inherit',
    shell: true
  });
  
  vite.on('error', (err) => {
    console.error('Failed to start Vite:', err);
  });
}

// Production: Serve static files
if (NODE_ENV === 'production') {
  const distPath = join(__dirname, 'client', 'dist');
  
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    
    // Handle SPA - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
    
    console.log(`📦 Serving static files from ${distPath}`);
  } else {
    console.warn(`⚠️  Production build not found at ${distPath}`);
    console.warn(`   Run 'npm run build' first`);
  }
}

// Start server
server.listen(PORT, () => {
  const url = NODE_ENV === 'production' 
    ? `http://localhost:${PORT}`
    : `http://localhost:${PORT} (with Vite dev server)`;
    
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           📚 Professor Web UI - Running                       ║
║                                                               ║
║   URL: ${url}
║   Mode: ${NODE_ENV}
║   Courses: ${COURSES_DIR}
╚══════════════════════════════════════════════════════════════╝
  `.trim());
});

export { app, server };
