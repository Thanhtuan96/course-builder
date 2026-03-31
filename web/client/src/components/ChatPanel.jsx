/**
 * ChatPanel.jsx - Streaming chat interface
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import CommandPills from './CommandPills.jsx';
import { useSSE } from '../hooks/useSSE.js';
import { Badge } from './ui/badge.jsx';
import { Alert, AlertTitle, AlertDescription } from './ui/alert.jsx';
import { Button } from './ui/button.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';

/**
 * ChatPanel component - displays chat messages with SSE streaming
 * @param {Object} props
 * @param {string|null} props.courseSlug - Current course slug
 * @param {string} props.currentPhase - Current learning phase for command pills
 * @param {Function} props.onSendMessage - Callback when message is sent (optional, for external handling)
 */
export default function ChatPanel({ courseSlug, currentPhase = 'idle', onSendMessage }) {
  const getWelcomeMessage = useCallback(
    (hasCourse) =>
      hasCourse
        ? 'Course loaded. You can continue with `professor:next`, `professor:review`, or `professor:discuss`.'
        : 'Welcome to Professor! Select a course and type `professor:new-topic` to start your first course.',
    []
  );

  const [provider, setProvider] = useState(() => localStorage.getItem('professor.provider') || 'auto');
  const [model, setModel] = useState(() => localStorage.getItem('professor.model') || '');
  const [capabilities, setCapabilities] = useState(null);
  const [providerModels, setProviderModels] = useState([]);
  const [allowCustomModel, setAllowCustomModel] = useState(false);
  const [resolvedProvider, setResolvedProvider] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content: getWelcomeMessage(!!courseSlug),
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [phase, setPhase] = useState(currentPhase);
  const messagesEndRef = useRef(null);
  const lastCommandRef = useRef('');

  // Update phase when prop changes
  useEffect(() => {
    setPhase(currentPhase);
  }, [currentPhase]);

  // Keep chat UX aligned with selected course:
  // - no course => idle/new-topic
  // - selected course => lecture/review commands
  useEffect(() => {
    setPhase(courseSlug ? 'lecture' : 'idle');
    setSessionId(null);

    setMessages((prev) => {
      const hasOnlyBootstrapMessage =
        prev.length === 1 &&
        prev[0]?.role === 'assistant' &&
        (prev[0]?.content?.includes('Welcome to Professor!') ||
          prev[0]?.content?.includes('Course loaded.'));

      if (hasOnlyBootstrapMessage) {
        return [{ role: 'assistant', content: getWelcomeMessage(!!courseSlug) }];
      }
      return prev;
    });
  }, [courseSlug, getWelcomeMessage]);

  useEffect(() => {
    localStorage.setItem('professor.provider', provider);
  }, [provider]);

  useEffect(() => {
    if (model) {
      localStorage.setItem('professor.model', model);
    }
  }, [model]);

  useEffect(() => {
    async function loadCapabilities() {
      try {
        const res = await fetch('/api/agents/capabilities');
        if (!res.ok) return;
        const json = await res.json();
        setCapabilities(json.capabilities || null);
      } catch {
        // optional UI metadata only
      }
    }
    loadCapabilities();
  }, []);

  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch(`/api/agents/models?provider=${encodeURIComponent(provider)}`);
        if (!res.ok) return;
        const json = await res.json();
        setResolvedProvider(json.provider || provider);
        setProviderModels(json.models || []);
        setAllowCustomModel(!!json.allowCustomModel);
        if ((json.models || []).length > 0 && !model) {
          setModel(json.models[0]);
        }
      } catch {
        setProviderModels([]);
        setAllowCustomModel(false);
      }
    }
    loadModels();
  }, [provider]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // SSE hook for streaming responses
  const { data: streamedData, error: streamError, connect: startStream, disconnect: stopStream, reset: resetStream } = useSSE('/api/chat', {
    onSessionId: (id) => setSessionId(id),
    onProviderMeta: (meta) => {
      if (meta.provider) setResolvedProvider(meta.provider);
      if (meta.model && !model) setModel(meta.model);
    },
    onMessage: (data) => {
      // Accumulated in the data state
    },
    onComplete: () => {
      setIsStreaming(false);
      // Use the explicit last command text instead of message array timing.
      const lastCommand = (lastCommandRef.current || '').toLowerCase();
      if (lastCommand.includes('professor:next')) {
        window.dispatchEvent(new CustomEvent('refresh-lecture'));
        setPhase('lecture');
      } else if (lastCommand.includes('professor:review')) {
        setPhase('review');
      } else if (lastCommand.includes('professor:done')) {
        setPhase('lecture');
      }
    },
    onError: (err) => {
      console.error('Stream error:', err);
      setIsStreaming(false);
      // Replace the empty assistant bubble with the error message
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && updated[lastIndex].role === 'assistant' && !updated[lastIndex].content) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: `⚠️ ${err.message || 'Connection failed'}`,
          };
        }
        return updated;
      });
    },
  });

  // Update messages with streamed content
  // streamedData is the accumulated total, so we SET not append
  useEffect(() => {
    if (streamedData && isStreaming) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: streamedData,
          };
        }
        return updated;
      });
    }
  }, [streamedData, isStreaming]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return;
    lastCommandRef.current = text.trim();

    const userMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    // If external handler provided, use it
    if (onSendMessage) {
      try {
        await onSendMessage(text, courseSlug, updatedMessages);
        setIsStreaming(false);
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { 
            role: 'assistant', 
            content: `Error: ${err.message}` 
          };
          return updated;
        });
        setIsStreaming(false);
      }
      return;
    }

    // Default: use SSE streaming
    try {
      resetStream();
      startStream('/api/chat', {
        messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        courseSlug,
        sessionId,
        provider,
        model: model || undefined,
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { 
          role: 'assistant', 
          content: `Error: ${err.message}` 
        };
        return updated;
      });
      setIsStreaming(false);
    }
  }, [
    messages,
    isStreaming,
    courseSlug,
    onSendMessage,
    startStream,
    resetStream,
    sessionId,
    provider,
    model,
  ]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleCommandClick(command) {
    sendMessage(command);
  }

  // Render message content with basic markdown-like formatting
  function renderContent(content) {
    if (!content) return '▌';
    
    // Simple markdown-like rendering
    return content
      .split('\n\n')
      .map((para, i) => {
        // Handle code blocks
        if (para.startsWith('```')) {
          return <pre key={i}><code>{para.slice(3, -3)}</code></pre>;
        }
        // Handle inline code
        para = para.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Handle bold
        para = para.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return <p key={i} dangerouslySetInnerHTML={{ __html: para }} />;
      });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-slate-800 bg-slate-900/70 px-3 py-3 md:px-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Provider</span>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value)}
            disabled={isStreaming}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">auto</SelectItem>
              <SelectItem value="claude">claude</SelectItem>
              <SelectItem value="cursor">cursor-agent</SelectItem>
              <SelectItem value="opencode">opencode</SelectItem>
              <SelectItem value="ollama">ollama</SelectItem>
              <SelectItem value="cloud">cloud</SelectItem>
            </SelectContent>
          </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Model</span>
            {providerModels.length > 0 ? (
              <Select
                value={model || providerModels[0]}
                onValueChange={(value) => setModel(value)}
                disabled={isStreaming}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={allowCustomModel ? 'enter model name' : 'auto/default'}
                disabled={isStreaming || !allowCustomModel}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              />
            )}
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300 md:px-4">
        <span>Resolved: {resolvedProvider || provider}</span>
        <Badge variant="secondary">
          Model: {model || 'default'}
        </Badge>
        {capabilities && (
          <Badge variant="secondary">
            Local: {Object.entries(capabilities)
              .filter(([key, value]) => key !== 'cloud' && value?.installed)
              .map(([key]) => key)
              .join(', ') || 'none'}
          </Badge>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-6 ${
              msg.role === 'user'
                ? 'self-end rounded-br-sm bg-indigo-600 text-white'
                : 'self-start rounded-bl-sm border border-slate-700 bg-slate-900 text-slate-200'
            }`}
          >
            <div className="wrap-break-word [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-950 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-slate-950 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_strong]:font-semibold">
              {renderContent(msg.content)}
            </div>
          </div>
        ))}
        
        {streamError && (
          <Alert variant="destructive" className="max-w-[90%]">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{streamError}</AlertDescription>
          </Alert>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <CommandPills phase={phase} onCommandClick={handleCommandClick} disabled={isStreaming} />

      <div className="flex gap-2 border-t border-slate-800 bg-slate-900 px-3 py-2 md:px-4 md:py-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or command... (Enter to send)"
          disabled={isStreaming}
          rows={2}
          className="min-h-[44px] flex-1 resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={isStreaming || !input.trim()}
          className="h-auto min-w-11 px-3"
          title="Send message"
        >
          {isStreaming ? '...' : '▶'}
        </Button>
      </div>
    </div>
  );
}
