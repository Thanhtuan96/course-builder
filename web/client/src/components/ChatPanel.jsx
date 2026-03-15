/**
 * ChatPanel.jsx - Streaming chat interface
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import CommandPills from './CommandPills.jsx';
import { useSSE } from '../hooks/useSSE.js';
import './ChatPanel.css';

/**
 * ChatPanel component - displays chat messages with SSE streaming
 * @param {Object} props
 * @param {string|null} props.courseSlug - Current course slug
 * @param {string} props.currentPhase - Current learning phase for command pills
 * @param {Function} props.onSendMessage - Callback when message is sent (optional, for external handling)
 */
export default function ChatPanel({ courseSlug, currentPhase = 'idle', onSendMessage }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content: courseSlug
        ? 'Course loaded. How can I help you learn today?'
        : 'Welcome to Professor! Select a course and type `professor:new-topic` to start your first course.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [phase, setPhase] = useState(currentPhase);
  const messagesEndRef = useRef(null);

  // Update phase when prop changes
  useEffect(() => {
    setPhase(currentPhase);
  }, [currentPhase]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // SSE hook for streaming responses
  const { data: streamedData, error: streamError, connect: startStream, disconnect: stopStream, reset: resetStream } = useSSE('/api/chat', {
    onSessionId: (id) => setSessionId(id),
    onMessage: (data) => {
      // Accumulated in the data state
    },
    onComplete: () => {
      setIsStreaming(false);
      // If professor:next was called, trigger lecture refresh
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg?.content?.includes('professor:next')) {
        window.dispatchEvent(new CustomEvent('refresh-lecture'));
        setPhase('lecture');
      } else if (lastUserMsg?.content?.includes('professor:review')) {
        setPhase('review');
      } else if (lastUserMsg?.content?.includes('professor:done')) {
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
  }, [messages, isStreaming, courseSlug, onSendMessage, startStream, resetStream]);

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
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-content">
              {renderContent(msg.content)}
            </div>
          </div>
        ))}
        
        {streamError && (
          <div className="chat-message chat-message-assistant chat-message-error">
            <div className="chat-message-content">
              <p>Error: {streamError}</p>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <CommandPills phase={phase} onCommandClick={handleCommandClick} disabled={isStreaming} />

      <div className="chat-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or command... (Enter to send)"
          disabled={isStreaming}
          rows={2}
          className="chat-input"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isStreaming || !input.trim()}
          className="chat-send-button"
          title="Send message"
        >
          {isStreaming ? '...' : '▶'}
        </button>
      </div>
    </div>
  );
}
