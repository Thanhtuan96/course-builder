/**
 * useSSE.js - Server-Sent Events hook for streaming chat responses
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for Server-Sent Events streaming
 * @param {string} url - URL to connect to for SSE
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoConnect - Whether to connect automatically (default: false)
 * @param {Function} options.onMessage - Called for each message event
 * @param {Function} options.onError - Called on connection error
 * @param {Function} options.onComplete - Called when stream completes
 */
export function useSSE(url, options = {}) {
  const [data, setData] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const optionsRef = useRef(options);

  // Update options ref if it changes
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback((requestUrl, body = null) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build URL with query params if body provided
    let connectionUrl = requestUrl;
    if (body) {
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // For messages array, stringify it
          params.append(key, JSON.stringify(value));
        } else if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
      connectionUrl = `${requestUrl}?${params.toString()}`;
    }

    const eventSource = new EventSource(connectionUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        
        if (parsed.type === 'text') {
          setData((prev) => prev + parsed.text);
          optionsRef.current.onMessage?.(parsed);
        } else if (parsed.type === 'done') {
          optionsRef.current.onComplete?.();
        } else if (parsed.type === 'error') {
          setError(parsed.message);
          optionsRef.current.onError?.(parsed.message);
        }
      } catch {
        // Handle raw text messages
        setData((prev) => prev + event.data);
        optionsRef.current.onMessage?.(event.data);
      }
    };

    eventSource.onerror = (err) => {
      setIsConnected(false);
      setError('Connection error');
      optionsRef.current.onError?.(err);
      eventSource.close();
    };

    return eventSource;
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
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
