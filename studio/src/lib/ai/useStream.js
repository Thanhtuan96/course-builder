/**
 * useStream — reusable React streaming state (AI-04).
 *
 * Tokens accumulate in a ref and flush to state at most once per animation frame; starting a new
 * request aborts the previous one; late chunks from a stale request are ignored (request id).
 * Phases 23–25 consume this hook.
 *
 *   const { text, status, error, start, stop } = useStream();
 *   start(({ onText, signal }) => provider.streamText({ system, messages, onText, signal }));
 *
 * status: 'idle' | 'streaming' | 'done' | 'stopped' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from './errors.js';

export function useStream() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const bufferRef = useRef('');
  const frameRef = useRef(null);
  const controllerRef = useRef(null);
  const idRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const flush = useCallback(() => {
    frameRef.current = null;
    setText(bufferRef.current);
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    idRef.current += 1;
    cancelFrame();
    if (mountedRef.current) {
      setText(bufferRef.current);
      setStatus('stopped');
      setError(null);
    }
  }, [cancelFrame]);

  const start = useCallback(
    async (run) => {
      controllerRef.current?.abort();
      cancelFrame();
      const id = idRef.current + 1;
      idRef.current = id;
      const controller = new AbortController();
      controllerRef.current = controller;
      bufferRef.current = '';

      if (mountedRef.current) {
        setText('');
        setError(null);
        setStatus('streaming');
      }

      const onText = (chunk) => {
        if (id !== idRef.current) return;
        bufferRef.current += chunk;
        if (frameRef.current == null) frameRef.current = requestAnimationFrame(flush);
      };

      try {
        const result = await run({ onText, signal: controller.signal });
        if (id !== idRef.current) return result;
        cancelFrame();
        if (typeof result === 'string' && !bufferRef.current) bufferRef.current = result;
        if (mountedRef.current) {
          setText(bufferRef.current);
          setStatus('done');
        }
        return result;
      } catch (err) {
        if (id !== idRef.current) return undefined;
        cancelFrame();
        if (isAbortError(err) || err?.code === 'aborted') {
          if (mountedRef.current) setStatus('stopped');
          return undefined;
        }
        if (mountedRef.current) {
          setError(err);
          setStatus('error');
        }
        throw err;
      }
    },
    [cancelFrame, flush]
  );

  return { text, status, error, start, stop };
}
