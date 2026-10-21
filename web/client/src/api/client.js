/**
 * API client for the legacy Express backend.
 *
 * The pairing token reaches this app only through the URL fragment (`#token=…`), is kept in
 * `sessionStorage` (never persistent storage or a query string), and is sent as `X-Studio-Token`
 * on every request. A `#bridge=` fragment may point the API at another loopback port; non-loopback
 * bridges are rejected before the token is ever attached.
 */

const TOKEN_STORAGE_KEY = 'professor.bridgeToken';
const BRIDGE_STORAGE_KEY = 'professor.bridgeBase';
export const BRIDGE_LOOPBACK_ERROR = 'Bridge URL must be loopback';

let initialized = false;
let pairingFailure = null;

function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}

function browserStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return browserStorage()?.getItem(key) || null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    browserStorage()?.setItem(key, value);
  } catch {
    /* storage can be unavailable in private mode; the pairing stays in-memory only */
  }
}

function removeStorage(key) {
  try {
    browserStorage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Accept only loopback `http:`/`https:` bridge URLs and normalize them to their origin.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function validateBridgeUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const hostname = String(url.hostname || '').toLowerCase();
  const loopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.startsWith('127.');
  if (!loopback) return null;
  return url.origin;
}

/**
 * Read the `#token=`/`#bridge=` fragment once, persist the token in `sessionStorage`, scrub the
 * fragment, and record a visible error for an invalid bridge.
 * @returns {{ token: string|null, bridge: string|null, error: string|null }}
 */
export function initPairing() {
  const win = browserWindow();
  if (!win || initialized) return pairingState();
  initialized = true;

  const hash = typeof win.location?.hash === 'string' ? win.location.hash : '';
  if (!hash) return pairingState();

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('token');
  const bridge = params.get('bridge');
  let shouldScrub = false;

  if (token) {
    writeStorage(TOKEN_STORAGE_KEY, token);
    shouldScrub = true;
  }

  if (bridge) {
    const normalized = validateBridgeUrl(bridge);
    if (normalized) {
      writeStorage(BRIDGE_STORAGE_KEY, normalized);
    } else {
      removeStorage(BRIDGE_STORAGE_KEY);
      pairingFailure = BRIDGE_LOOPBACK_ERROR;
    }
    shouldScrub = true;
  }

  if (shouldScrub) {
    try {
      win.history?.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
    } catch {
      /* ignore */
    }
  }

  return pairingState();
}

/** @returns {{ token: string|null, bridge: string|null, error: string|null }} */
export function pairingState() {
  return {
    token: readStorage(TOKEN_STORAGE_KEY),
    bridge: readStorage(BRIDGE_STORAGE_KEY),
    error: pairingFailure,
  };
}

/** @returns {string|null} */
export function pairingError() {
  return pairingFailure;
}

/** @returns {boolean} */
export function hasToken() {
  return Boolean(readStorage(TOKEN_STORAGE_KEY)) && !pairingFailure;
}

/** @returns {boolean} */
export function pairingRequired() {
  return !hasToken();
}

/** Test-only reset so unit tests can exercise multiple fragments in one process. */
export function resetPairing() {
  initialized = false;
  pairingFailure = null;
  removeStorage(TOKEN_STORAGE_KEY);
  removeStorage(BRIDGE_STORAGE_KEY);
}

/**
 * API prefix for every legacy call. A paired bridge returns `<origin>/api`; otherwise same-origin.
 * @returns {string}
 */
export function apiBase() {
  return apiBaseFrom(readStorage(BRIDGE_STORAGE_KEY));
}

/** @param {string|null} bridge @returns {string} */
export function apiBaseFrom(bridge) {
  return bridge ? `${bridge}/api` : '/api';
}

/**
 * Resolve a legacy API path (`/api/...`) through the same base used by every fetch.
 * @param {string} path
 * @returns {string}
 */
export function resolveApiUrl(path) {
  if (typeof path === 'string' && path.startsWith('/api')) {
    return `${apiBase()}${path.slice('/api'.length)}`;
  }
  return path;
}

/** @returns {Record<string,string>} */
export function authHeaders() {
  const token = readStorage(TOKEN_STORAGE_KEY);
  if (!token || pairingFailure) return {};
  return { 'X-Studio-Token': token };
}

function requestHeaders(extra = {}) {
  return { ...authHeaders(), ...extra };
}

function pairingRequiredError() {
  const err = new Error('Pair this browser to use the legacy UI.');
  err.code = 'pairing_required';
  return err;
}

/**
 * Fetch list of all courses.
 * @returns {Promise<Array>}
 */
export async function fetchCourses() {
  if (!hasToken()) return [];
  const response = await fetch(`${apiBase()}/courses`, { headers: requestHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to fetch courses: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a specific file from a course.
 * @param {string} slug
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function fetchCourseFile(slug, file) {
  if (!hasToken()) throw pairingRequiredError();
  const response = await fetch(`${apiBase()}/courses/${slug}/${file}`, {
    headers: requestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch course file: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Send a chat message over a fetch POST SSE stream (a native event source cannot set headers).
 * @param {string} message
 * @param {{ messages?: Array<{role:string,content:string}>, courseSlug?: string,
 *           sessionId?: string|null, provider?: string, model?: string,
 *           onChunk?: Function, onComplete?: Function, onError?: Function }} [options]
 * @returns {Promise<{ abort: () => void }>}
 */
export async function sendChatMessage(message, options = {}) {
  if (!hasToken()) throw pairingRequiredError();

  const { onChunk, onComplete, onError } = options;
  const controller = new AbortController();
  const body = {
    messages: options.messages || [{ role: 'user', content: message }],
    courseSlug: options.courseSlug,
    sessionId: options.sessionId,
    provider: options.provider || 'auto',
    model: options.model || undefined,
  };

  let fullResponse = '';

  try {
    const response = await fetch(`${apiBase()}/chat`, {
      method: 'POST',
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') {
          onComplete?.(fullResponse);
          return { abort: () => controller.abort() };
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }
        if (data.type === 'chunk' || typeof data.content === 'string') {
          fullResponse += data.content || '';
          onChunk?.(data.content || '', fullResponse);
        } else if (data.type === 'complete') {
          onComplete?.(fullResponse);
          return { abort: () => controller.abort() };
        } else if (data.type === 'error' || data.error) {
          onError?.(new Error(data.message || data.error || 'Chat failed'));
          return { abort: () => controller.abort() };
        }
      }
    }

    onComplete?.(fullResponse);
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err);
  }

  return { abort: () => controller.abort() };
}

/**
 * Fetch all exercises for a course.
 * @param {string} slug
 * @returns {Promise<{exercises: Array, activeExercise: string|null}>}
 */
export async function fetchExercises(slug) {
  if (!hasToken()) throw pairingRequiredError();
  const response = await fetch(`${apiBase()}/courses/${slug}/exercises`, {
    headers: requestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch exercises: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a specific exercise.
 * @param {string} slug
 * @param {string} filename
 * @returns {Promise<{content: string, filename: string}>}
 */
export async function fetchExercise(slug, filename) {
  if (!hasToken()) throw pairingRequiredError();
  const response = await fetch(`${apiBase()}/courses/${slug}/exercises/${filename}`, {
    headers: requestHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch exercise: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Save exercise content.
 * @param {string} slug
 * @param {string} filename
 * @param {string} content
 * @returns {Promise<{success: boolean}>}
 */
export async function saveExercise(slug, filename, content) {
  if (!hasToken()) throw pairingRequiredError();
  const response = await fetch(`${apiBase()}/courses/${slug}/exercises/${filename}`, {
    method: 'POST',
    headers: requestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save exercise: ${response.statusText}`);
  }
  return response.json();
}
