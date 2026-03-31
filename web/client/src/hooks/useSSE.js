/**
 * useSSE.js - POST-based streaming hook for chat responses
 * Uses fetch() with ReadableStream instead of EventSource (which only supports GET)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for streaming chat responses via POST + SSE
 * @param {string} url - Default URL (unused, passed per-call in connect)
 * @param {Object} options - Configuration options
 * @param {Function} options.onMessage - Called for each chunk received
 * @param {Function} options.onError - Called on connection error
 * @param {Function} options.onComplete - Called when stream completes
 */
export function useSSE(url, options = {}) {
  const [data, setData] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(async (requestUrl, body = null) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setData('');
    setError(null);
    setIsConnected(true);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
        signal: abortController.signal,
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
        buffer = lines.pop(); // Keep last incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6);

          if (raw === '[DONE]') {
            setIsConnected(false);
            optionsRef.current.onComplete?.();
            return;
          }

          try {
            const parsed = JSON.parse(raw);
            if (parsed.content) {
              // Strip <file path="...">...</file> blocks from visible chat text
              const visible = parsed.content.replace(/<file path="[^"]*">[\s\S]*?<\/file>/g, '');
              if (visible) {
                setData((prev) => prev + visible);
                optionsRef.current.onMessage?.(parsed);
              }
            } else if (parsed.sessionId) {
              // Store session ID for conversation continuity
              optionsRef.current.onSessionId?.(parsed.sessionId);
            } else if (parsed.provider || parsed.model) {
              optionsRef.current.onProviderMeta?.(parsed);
            } else if (parsed.filesUpdated) {
              // Course files were saved — trigger UI refresh
              const slug = parsed.courseSlug;
              parsed.filesUpdated.forEach(file => {
                if (file === 'LECTURE.md') window.dispatchEvent(new CustomEvent('refresh-lecture', { detail: { slug } }));
                if (file === 'COURSE.md') window.dispatchEvent(new CustomEvent('refresh-syllabus', { detail: { slug } }));
              });
              // Reload course list; pass slug so App can auto-select it
              if (parsed.filesUpdated.includes('COURSE.md')) {
                window.dispatchEvent(new CustomEvent('refresh-courses', { detail: { slug } }));
              }
            } else if (parsed.error) {
              setError(parsed.error);
              optionsRef.current.onError?.(new Error(parsed.error));
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      setIsConnected(false);
      optionsRef.current.onComplete?.();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setIsConnected(false);
      setError(err.message || 'Connection error');
      optionsRef.current.onError?.(err);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reset = useCallback(() => {
    setData('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    data,
    isConnected,
    error,
    connect,
    disconnect,
    reset,
  };
}

export default useSSE;
