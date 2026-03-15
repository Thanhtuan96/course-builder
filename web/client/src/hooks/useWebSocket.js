/**
 * useWebSocket.js - WebSocket hook with exponential backoff reconnection
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for WebSocket connection with automatic reconnection
 * @param {string} url - WebSocket URL to connect to
 * @param {Object} callbacks - Event handlers for connection events
 * @param {Function} callbacks.onOpen - Called when connection opens
 * @param {Function} callbacks.onMessage - Called when message received
 * @param {Function} callbacks.onError - Called on connection error
 * @param {Function} callbacks.onClose - Called when connection closes
 */
export function useWebSocket(url, callbacks = {}) {
  const wsRef = useRef(null);
  const attemptRef = useRef(0);
  const maxAttempts = 10;
  const urlRef = useRef(url);

  // Update URL ref if it changes
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(urlRef.current);
    wsRef.current = ws;

    ws.onopen = (event) => {
      attemptRef.current = 0;
      callbacks.onOpen?.(event);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Listen for lecture-update event type
        if (data.event === 'lecture-update' || data.event === 'lecture-updated') {
          callbacks.onMessage?.(data);
        } else {
          callbacks.onMessage?.(data);
        }
      } catch {
        callbacks.onMessage?.(event.data);
      }
    };

    ws.onerror = (event) => {
      callbacks.onError?.(event);
    };

    ws.onclose = (event) => {
      callbacks.onClose?.(event);
      
      // Exponential backoff reconnection
      if (attemptRef.current < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 30000);
        attemptRef.current += 1;
        setTimeout(connect, delay);
      }
    };
  }, [callbacks]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  const disconnect = useCallback(() => {
    attemptRef.current = maxAttempts; // Prevent reconnection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  return { send, disconnect, connect };
}

export default useWebSocket;
