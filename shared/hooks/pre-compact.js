/**
 * PreCompact Hook for Course Learning Plugin
 * 
 * This hook runs before Claude's context is compressed. It:
 * 1. Displays a token warning when approaching the compression threshold
 * 2. Auto-saves session state to COURSE.md so users can resume where they left off
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TOKEN_WARNING_THRESHOLD = 0.8; // 80% of token limit
const MAX_TOKENS = 200000; // Claude's typical context limit

// Fun break messages to display with the warning
const BREAK_MESSAGES = [
  "Time for a coffee break? ☕ Your brain will thank you!",
  "Stretch break! Your posture (and neurons) will appreciate it. 🧘",
  "Have you hydrated today? 💧 Smart learners stay hydrated!",
  "Maybe take a walk? Fresh air + learning = brain magic! 🚶",
  "Your eyes need a rest from screens. Look at something far away! 👀",
  "Pro tip: Teaching someone else what you just learned = double retention!",
  "Fun fact: Sleep consolidates memory. Just saying... 😴"
];

/**
 * Get a random break message
 */
function getRandomBreakMessage() {
  const index = Math.floor(Math.random() * BREAK_MESSAGES.length);
  return BREAK_MESSAGES[index];
}

/**
 * Display token warning with fun break message
 */
function displayTokenWarning(tokenCount) {
  const percentage = Math.round((tokenCount / MAX_TOKENS) * 100);
  const breakMessage = getRandomBreakMessage();
  
  console.warn(`
╔════════════════════════════════════════════════════════════╗
║  TOKEN WARNING: Context approaching compression threshold  ║
║  Current: ${percentage}% of token limit                              ║
║                                                             ║
║  💡 ${breakMessage}                                   ║
║                                                             ║
║  Your course progress will be auto-saved to COURSE.md       ║
╚════════════════════════════════════════════════════════════╝
  `.trim());
}

/**
 * Find the most recently modified COURSE.md file
 */
function findMostRecentCourse() {
  const coursesDir = path.join(process.cwd(), 'courses');
  
  // Check if courses directory exists
  if (!fs.existsSync(coursesDir)) {
    console.warn('PreCompact: No courses directory found. Skipping session save.');
    return null;
  }
  
  let mostRecentFile = null;
  let mostRecentTime = 0;
  
  // Scan for COURSE.md files in subdirectories
  const entries = fs.readdirSync(coursesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const coursePath = path.join(coursesDir, entry.name, 'COURSE.md');
      if (fs.existsSync(coursePath)) {
        const stats = fs.statSync(coursePath);
        if (stats.mtimeMs > mostRecentTime) {
          mostRecentTime = stats.mtimeMs;
          mostRecentFile = coursePath;
        }
      }
    }
  }
  
  return mostRecentFile;
}

/**
 * Extract session state from COURSE.md
 */
function extractSessionState(coursePath, courseContent) {
  const state = {
    lastActiveSection: null,
    lectureSummary: null
  };
  
  // Look for current section marker
  const currentSectionMatch = courseContent.match(/Current Section:\s*\*\*(.+?)\*\*/);
  if (currentSectionMatch) {
    state.lastActiveSection = currentSectionMatch[1].trim();
  }
  
  // Look for last active lecture content in LECTURE.md
  // This would be done by reading LECTURE.md if it exists
  const coursesDir = path.dirname(coursePath);
  const lecturePath = path.join(coursesDir, 'LECTURE.md');
  
  if (fs.existsSync(lecturePath)) {
    const lectureContent = fs.readFileSync(lecturePath, 'utf-8');
    
    // Extract first few lines as summary
    const lines = lectureContent.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      // Get title (first heading)
      const titleMatch = lectureContent.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        state.lectureSummary = titleMatch[1].trim();
      }
    }
  }
  
  return state;
}

/**
 * Update COURSE.md with session state
 */
function updateCourseWithSession(coursePath, sessionState) {
  const content = fs.readFileSync(coursePath, 'utf-8');
  const timestamp = new Date().toISOString();
  
  // Check if session_state section already exists
  const hasSessionState = content.includes('session_state:');
  
  let newContent;
  if (hasSessionState) {
    // Update existing session state
    newContent = content.replace(
      /last_active_section:.*$/m,
      `last_active_section: "${sessionState.lastActiveSection || ''}"`
    ).replace(
      /last_updated:.*$/m,
      `last_updated: "${timestamp}"`
    ).replace(
      /lecture_summary:.*$/m,
      `lecture_summary: "${sessionState.lectureSummary || ''}"`
    );
  } else {
    // Add session state section at the top (after frontmatter if exists)
    const sessionStateBlock = `---
session_state:
  last_active_section: "${sessionState.lastActiveSection || ''}"
  last_updated: "${timestamp}"
  lecture_summary: "${sessionState.lectureSummary || ''}"
---

`;
    
    if (content.startsWith('---')) {
      // Find end of frontmatter
      const frontmatterEnd = content.indexOf('---', 3);
      if (frontmatterEnd !== -1) {
        newContent = content.slice(0, frontmatterEnd + 3) + '\n' + sessionStateBlock + content.slice(frontmatterEnd + 3);
      } else {
        newContent = sessionStateBlock + content;
      }
    } else {
      newContent = sessionStateBlock + content;
    }
  }
  
  fs.writeFileSync(coursePath, newContent, 'utf-8');
  console.warn(`PreCompact: Session state saved to ${coursePath}`);
}

/**
 * Auto-save session state to COURSE.md
 */
function autoSaveSession() {
  try {
    const coursePath = findMostRecentCourse();
    
    if (!coursePath) {
      console.warn('PreCompact: No active course found. Skipping session save.');
      return;
    }
    
    const courseContent = fs.readFileSync(coursePath, 'utf-8');
    const sessionState = extractSessionState(coursePath, courseContent);
    
    updateCourseWithSession(coursePath, sessionState);
  } catch (error) {
    console.warn(`PreCompact: Error saving session state: ${error.message}`);
  }
}

/**
 * Main PreCompact handler
 * @param {Object} context - The PreCompact event context
 * @param {number} context.tokenCount - Current token count
 */
module.exports = function(context) {
  // Handle both direct invocation and event-based invocation
  const tokenCount = context?.tokenCount || context?.tokens || 0;
  
  // Check if we're approaching the threshold
  if (tokenCount >= MAX_TOKENS * TOKEN_WARNING_THRESHOLD) {
    displayTokenWarning(tokenCount);
    autoSaveSession();
  } else {
    console.warn(`PreCompact: Token count (${tokenCount}) below threshold (${Math.round(TOKEN_WARNING_THRESHOLD * 100)}%). No action needed.`);
  }
};
