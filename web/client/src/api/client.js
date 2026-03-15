/**
 * API client for communicating with the Express backend
 */

const API_BASE = '/api';

/**
 * Fetch list of all courses
 * @returns {Promise<Array>} Array of course objects
 */
export async function fetchCourses() {
  const response = await fetch(`${API_BASE}/courses`);
  if (!response.ok) {
    throw new Error(`Failed to fetch courses: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a specific file from a course
 * @param {string} slug - Course slug
 * @param {string} file - File name (e.g., 'COURSE.md', 'LECTURE.md')
 * @returns {Promise<string>} File content
 */
export async function fetchCourseFile(slug, file) {
  const response = await fetch(`${API_BASE}/courses/${slug}/${file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch course file: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Send a chat message and receive streaming response via SSE
 * @param {string} message - User message
 * @param {Object} options - Options for the chat
 * @param {Function} options.onChunk - Callback for each chunk received
 * @param {Function} options.onComplete - Callback when complete
 * @param {Function} options.onError - Callback on error
 * @returns {Promise<void>}
 */
export async function sendChatMessage(message, options = {}) {
  const { onChunk, onComplete, onError } = options;
  
  // Create EventSource for SSE streaming
  const url = new URL(`${API_BASE}/chat`, window.location.origin);
  url.searchParams.set('message', message);
  
  const eventSource = new EventSource(url.toString());
  
  let fullResponse = '';
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'chunk') {
      fullResponse += data.content;
      if (onChunk) {
        onChunk(data.content, fullResponse);
      }
    } else if (data.type === 'complete') {
      eventSource.close();
      if (onComplete) {
        onComplete(fullResponse);
      }
    } else if (data.type === 'error') {
      eventSource.close();
      if (onError) {
        onError(new Error(data.message));
      }
    }
  };
  
  eventSource.onerror = (error) => {
    eventSource.close();
    if (onError) {
      onError(error);
    }
  };
  
  return eventSource;
}

/**
 * Fetch all exercises for a course
 * @param {string} slug - Course slug
 * @returns {Promise<{exercises: Array, activeExercise: string|null}>}
 */
export async function fetchExercises(slug) {
  const response = await fetch(`${API_BASE}/courses/${slug}/exercises`);
  if (!response.ok) {
    throw new Error(`Failed to fetch exercises: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a specific exercise
 * @param {string} slug - Course slug
 * @param {string} filename - Exercise filename
 * @returns {Promise<{content: string, filename: string}>}
 */
export async function fetchExercise(slug, filename) {
  const response = await fetch(`${API_BASE}/courses/${slug}/exercises/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch exercise: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Save exercise content
 * @param {string} slug - Course slug
 * @param {string} filename - Exercise filename
 * @param {string} content - Exercise content
 * @returns {Promise<{success: boolean}>}
 */
export async function saveExercise(slug, filename, content) {
  const response = await fetch(`${API_BASE}/courses/${slug}/exercises/${filename}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    throw new Error(`Failed to save exercise: ${response.statusText}`);
  }
  return response.json();
}
