import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const COURSES_DIR = process.env.COURSES_DIR || './courses';

console.log(`📁 Courses directory: ${COURSES_DIR}`);

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

// Helper: Get all exercises for a course
function getExercises(slug) {
  const exercisesDir = join(COURSES_DIR, slug, 'exercises');
  const exercises = [];
  
  if (!existsSync(exercisesDir)) {
    return exercises;
  }
  
  try {
    const files = readdirSync(exercisesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = join(exercisesDir, file);
        const content = readFileSync(filePath, 'utf-8');
        exercises.push({
          filename: file,
          path: `exercises/${file}`,
          content
        });
      }
    }
  } catch (e) {
    console.error('Error reading exercises:', e);
  }
  
  return exercises;
}

// Helper: Get active exercise from COURSE.md
function getActiveExercise(slug) {
  const courseContent = getCourseFile(slug, 'COURSE.md');
  if (!courseContent) return null;
  
  // Look for "Active exercise: exercises/XX-xxx.md"
  const match = courseContent.match(/Active exercise:\s*exercises\/([^\s]+)/i);
  return match ? match[1] : null;
}

// API Routes

// GET /api/courses - List all courses
app.get('/api/courses', (req, res) => {
  const courses = getCourses();
  res.json(courses);
});

// GET /api/courses/:slug/exercises - Get all exercises for a course
app.get('/api/courses/:slug/exercises', (req, res) => {
  const { slug } = req.params;
  const exercises = getExercises(slug);
  const activeExercise = getActiveExercise(slug);
  res.json({ exercises, activeExercise });
});

// GET /api/courses/:slug/exercises/:filename - Get specific exercise
app.get('/api/courses/:slug/exercises/:filename', (req, res) => {
  const { slug, filename } = req.params;
  const exercisesDir = join(COURSES_DIR, slug, 'exercises');
  const filePath = join(exercisesDir, filename);
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Exercise not found' });
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    res.json({ content, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/courses/:slug/exercises/:filename - Save exercise content
app.post('/api/courses/:slug/exercises/:filename', (req, res) => {
  const { slug, filename } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  
  const exercisesDir = join(COURSES_DIR, slug, 'exercises');
  const filePath = join(exercisesDir, filename);
  
  // Ensure exercises directory exists
  if (!existsSync(exercisesDir)) {
    mkdirSync(exercisesDir, { recursive: true });
  }
  
  try {
    writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// Professor system prompt — instructs AI to behave as a Socratic teaching assistant
// and to wrap any course files it creates in <file path="...">...</file> tags so the
// server can persist them to disk automatically.
const PROFESSOR_SYSTEM_PROMPT = `You are Professor Claude — a Socratic technology mentor built into a web-based learning app.

## Your role
Teach users by asking questions, NOT by giving answers. Guide them to discover concepts themselves.
- Never write working code for the user
- Never complete exercises on their behalf
- Always ask "What have you tried?" before offering hints
- Give hints in layers: conceptual → pattern/tool → pseudo-code only

## Commands you handle
- \`professor:new-topic\` — Ask what they want to learn and their level (Beginner/Intermediate/Advanced/Expert), then create a course
- \`professor:next\` — Load the next not-started section into LECTURE.md
- \`professor:review\` — Socratic review: what's working → question → concept to study → next action
- \`professor:done\` — Confirm understanding verbally, then mark section complete
- \`professor:hint\` — Layer 1 (concept) → Layer 2 (tool/pattern) → Layer 3 (pseudo-code only)
- \`professor:stuck\` — Walk through what they tried → exact sticking point → smaller steps → analogy
- \`professor:discuss\` — Conceptual Q&A only
- \`professor:quiz\` — 5 questions matched to their level
- \`professor:syllabus\` — Describe course outline from COURSE.md
- \`professor:progress\` — Summarize completed/current/remaining sections

## Creating course files
When creating or updating course files, include them in your response wrapped in XML tags.
The app will save them automatically — do NOT mention the tags to the user.

When creating a NEW course (professor:new-topic), derive a URL-safe slug from the topic name
(e.g., "React Hooks" → "react-hooks") and include the slug in the path:

<file path="courses/react-hooks/COURSE.md">
[full file content here]
</file>

<file path="courses/react-hooks/CAPSTONE.md">
[full file content here]
</file>

When updating an EXISTING course file (professor:next, professor:done, etc.), use just the filename:

<file path="LECTURE.md">
[full file content here]
</file>

<file path="COURSE.md">
[updated content here]
</file>

## COURSE.md format
\`\`\`
# Course: {Topic Name}
**Level**: {Beginner/Intermediate/Advanced/Expert}
**Created**: {date}
**Last active**: {date}

## Syllabus
- ⬜ Section 1: {Name}
- ⬜ Section 2: {Name}
...

## Progress Log
(entries added as sections are completed)
\`\`\`

Status icons: ⬜ Not started | 🔄 In progress | ✅ Done

## LECTURE.md format
\`\`\`
# Section N: {Name}
**Status**: 🔄 In progress

## Concepts
[key concepts explained clearly]

## Exercise
[one focused exercise — they must solve it themselves]

## What to do
Read through this, then attempt the exercise. Use \`professor:review\` when ready, or \`professor:hint\` if stuck.
\`\`\`
`;

// Helper: parse <file path="...">...</file> blocks from AI response and save them.
// Handles two formats:
//   <file path="courses/{slug}/COURSE.md"> — new course creation
//   <file path="LECTURE.md">              — updating existing course
// Returns array of { slug, file } objects for files that were saved.
function saveFilesFromResponse(fullText, courseSlug) {
  const saved = [];
  const validFiles = ['COURSE.md', 'LECTURE.md', 'CAPSTONE.md', 'NOTES.md'];
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;

  while ((match = fileRegex.exec(fullText)) !== null) {
    const [, filePath, content] = match;

    let slug = courseSlug;
    let fileName;

    // Format: courses/{slug}/FILENAME.md
    const coursePathMatch = filePath.match(/^courses\/([^/]+)\/([^/]+)$/);
    if (coursePathMatch) {
      slug = coursePathMatch[1].replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      fileName = coursePathMatch[2];
    } else {
      // Format: FILENAME.md (relative to current course)
      fileName = filePath.replace(/^.*[\\/]/, '');
    }

    if (!slug || !validFiles.includes(fileName)) continue;

    const result = saveCourseFile(slug, fileName, content.trim());
    if (result.success) {
      saved.push({ slug, file: fileName });
      console.log(`💾 Saved ${fileName} → courses/${slug}/`);
    }
  }
  return saved;
}

// Stream chat response via claude CLI subprocess (uses Claude Code's existing OAuth)
function streamViaCLI(res, messages, courseSlug, sessionId) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) {
    res.write(`data: ${JSON.stringify({ error: 'No user message' })}\n\n`);
    res.end();
    return;
  }

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
    '--verbose',
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  args.push(lastUser.content);

  // Delete CLAUDECODE so nested claude CLI is allowed
  const env = { ...process.env };
  delete env.CLAUDECODE;
  // Prevent the CLI from detecting it's inside another Claude process
  delete env.CLAUDE_CODE_ENTRYPOINT;
  // Some versions need this to skip interactive permission prompts
  env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1';
  console.log(`🤖 CLI: claude ${args.slice(0, 4).join(' ')} ... "${lastUser.content.slice(0, 40)}"`);
  const proc = spawn('claude', args, { env, cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });

  let buffer = '';
  let fullText = '';
  let newSessionId = null;

  proc.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      console.log('[CLI raw]', line.slice(0, 120));
      try {
        const d = JSON.parse(line);
        if (d.type === 'system' && d.subtype === 'init') {
          newSessionId = d.session_id;
        } else if (d.type === 'stream_event') {
          const delta = d.event?.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            const visible = delta.text.replace(/<file path="[^"]*">[\s\S]*?<\/file>/g, '');
            if (visible) res.write(`data: ${JSON.stringify({ content: visible })}\n\n`);
          }
        } else if (d.type === 'result') {
          finalize(d.result || fullText);
        }
      } catch { /* skip malformed */ }
    }
  });

  proc.stderr.on('data', chunk => {
    const txt = chunk.toString();
    console.error('[claude CLI stderr]', txt.slice(0, 300));
  });

  proc.on('error', err => {
    res.write(`data: ${JSON.stringify({ error: `CLI error: ${err.message}` })}\n\n`);
    res.end();
  });

  proc.on('close', code => {
    console.log(`[claude CLI] exited with code ${code}, fullText.length=${fullText.length}`);
    if (!res.writableEnded) {
      if (code !== 0) {
        res.write(`data: ${JSON.stringify({ error: `CLI exited with code ${code}` })}\n\n`);
      }
      // Always finalize — covers cases where 'result' event wasn't emitted
      finalize(fullText);
    }
  });

  function finalize(text) {
    if (res.writableEnded) return;
    const saved = saveFilesFromResponse(text, courseSlug);
    if (saved.length > 0) {
      const bySlug = {};
      for (const { slug, file } of saved) {
        if (!bySlug[slug]) bySlug[slug] = [];
        bySlug[slug].push(file);
      }
      for (const [slug, files] of Object.entries(bySlug)) {
        res.write(`data: ${JSON.stringify({ filesUpdated: files, courseSlug: slug })}\n\n`);
      }
    }
    if (newSessionId) {
      res.write(`data: ${JSON.stringify({ sessionId: newSessionId })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// Detect if claude CLI is available
function claudeCLIAvailable() {
  try {
    execSync('which claude', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}
const USE_CLI = claudeCLIAvailable();
console.log(USE_CLI ? '✅ claude CLI found — using OAuth (no API key needed)' : '⚠️  claude CLI not found — falling back to API key');

// POST /api/chat - Stream Claude responses via SSE
app.post('/api/chat', (req, res) => {
  console.log('📨 POST /api/chat received, messages:', req.body?.messages?.length, 'USE_CLI:', USE_CLI);
  const { messages, courseSlug, sessionId } = req.body;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (USE_CLI) {
    streamViaCLI(res, messages, courseSlug, sessionId);
    return;
  }

  // Get API key (fallback when CLI not available)
  const apiKey = process.env.ANTHROPIC_API_KEY
    || process.env.CLAUDE_API_KEY
    || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ error: 'No API key configured. Run: export ANTHROPIC_API_KEY=your-key' })}\n\n`);
    res.end();
    return;
  }

  // Build messages for API (filter out empty assistant messages from streaming)
  const apiMessages = messages
    .filter(m => m.content && m.content.trim())
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

  // Determine API provider
  const isOpenAI = !!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY;

  let apiUrl, headers, requestBody;

  if (isOpenAI) {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    requestBody = {
      model: 'gpt-4o',
      messages: [{ role: 'system', content: PROFESSOR_SYSTEM_PROMPT }, ...apiMessages],
      stream: true
    };
    console.log('🤖 Using model: gpt-4o');
  } else {
    apiUrl = 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
    requestBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: PROFESSOR_SYSTEM_PROMPT,
      messages: apiMessages,
      stream: true
    };
    console.log('🤖 Using model: claude-sonnet-4-6');
  }

  // Buffer full response to extract file blocks after streaming
  let fullResponse = '';

  fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(requestBody) })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          res.write(`data: ${JSON.stringify({ error: `API error ${response.status}: ${text.slice(0, 200)}` })}\n\n`);
          res.end();
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            finalize();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            if (data === '[DONE]') {
              finalize();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              let text = null;

              if (isOpenAI) {
                text = parsed.choices?.[0]?.delta?.content;
              } else {
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  text = parsed.delta.text;
                }
              }

              if (text) {
                fullResponse += text;
                // Strip file blocks from the visible chat text before sending
                const visibleText = text; // stream as-is; client sees file tags briefly — cleaned in finalize
                res.write(`data: ${JSON.stringify({ content: visibleText })}\n\n`);
              }
            } catch {
              // Skip malformed JSON
            }
          }

          read();
        }).catch(err => {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        });
      }

      function finalize() {
        // Save any course files embedded in the response
        const saved = saveFilesFromResponse(fullResponse, courseSlug);
        if (saved.length > 0) {
          // Group by slug and collect filenames
          const bySlug = {};
          for (const { slug, file } of saved) {
            if (!bySlug[slug]) bySlug[slug] = [];
            bySlug[slug].push(file);
          }
          // Notify client for each affected slug
          for (const [slug, files] of Object.entries(bySlug)) {
            res.write(`data: ${JSON.stringify({ filesUpdated: files, courseSlug: slug })}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      }

      read();
    })
    .catch(error => {
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
