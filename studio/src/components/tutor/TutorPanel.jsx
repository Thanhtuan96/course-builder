/**
 * TutorPanel — lesson-scoped Socratic tutor (TUTOR-01..04).
 *
 * - Loads the lesson's chat history from the repository and streams replies with `useStream`.
 * - Persists the learner message and the assistant reply (on completion, on Stop, and on unmount)
 *   — never once per token.
 * - Shows streaming progress, a Stop button and an actionable ErrorNotice.
 * - Auto-scrolls unless the learner has scrolled up.
 * - Quick actions plus a 3-step hint ladder held in `chat-store`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../lib/router.js';
import { appendChat, listChat, getLessonContent, onChange } from '../../lib/repo/index.js';
import { getProvider, MAX_TOKENS } from '../../lib/ai/index.js';
import { useStream } from '../../lib/ai/useStream.js';
import { buildTutorMessages, TUTOR_MODES } from '../../lib/prompts/tutor.js';
import { useHintLevel } from '../../lib/chat-store.js';
import { currentCodeBlock } from '../../lib/runner/current-code.js';
import { useSettings } from '../../lib/settings.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { ChatMessage } from './ChatMessage.jsx';
import { QuickActions } from './QuickActions.jsx';

/** True when the active provider can plausibly run without further setup. */
function providerReady(settings) {
  switch (settings.provider) {
    case 'anthropic':
      return Boolean(settings.anthropic?.apiKey);
    case 'openai':
      return Boolean(settings.openai?.apiKey);
    case 'ollama':
    case 'bridge':
      return true;
    default:
      return false;
  }
}

export function TutorPanel({ lesson, course, capstone = false, capstoneBrief = null }) {
  const [settings] = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const hint = useHintLevel(lesson.id);
  const hintRef = useRef(hint.level);
  hintRef.current = hint.level;

  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [pendingMode, setPendingMode] = useState(null);
  const [dismissedError, setDismissedError] = useState(false);

  const lessonContentRef = useRef('');
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const textareaRef = useRef(null);
  const draftRef = useRef('');
  const pendingRef = useRef(null);
  const persistRef = useRef(() => {});

  const { text, status, error, start, stop } = useStream();
  const statusRef = useRef(status);
  statusRef.current = status;
  const streaming = status === 'streaming';

  const applyMessages = useCallback((rows) => {
    messagesRef.current = rows;
    setMessages(rows);
  }, []);

  // Load the transcript, and keep it in sync with repository writes.
  useEffect(() => {
    let alive = true;
    const load = () =>
      listChat(lesson.id)
        .then((rows) => {
          if (alive) applyMessages(rows);
        })
        .finally(() => {
          if (alive) setLoaded(true);
        });
    setLoaded(false);
    load();
    const off = onChange((detail) => {
      if (detail.table === 'chat_messages' || detail.table === '*') load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [lesson.id, applyMessages]);

  // Load lesson content used as reference context.
  useEffect(() => {
    let alive = true;
    getLessonContent(lesson.id)
      .then((version) => {
        if (alive) lessonContentRef.current = version?.content_md || '';
      })
      .catch(() => {
        if (alive) lessonContentRef.current = '';
      });
    return () => {
      alive = false;
    };
  }, [lesson.id]);

  // Persist any un-persisted assistant text exactly once (Stop, unmount, lesson change).
  const persistDraft = useCallback(async () => {
    const pending = pendingRef.current;
    const content = draftRef.current;
    pendingRef.current = null;
    draftRef.current = '';
    if (!pending || !content.trim()) return null;
    return appendChat(pending.lessonId, { role: 'assistant', content, mode: pending.mode });
  }, []);
  persistRef.current = persistDraft;

  useEffect(() => () => persistRef.current(), []);

  const runTurn = useCallback(
    async ({ content, mode = null }) => {
      const trimmed = String(content || '').trim();
      if (!trimmed || statusRef.current === 'streaming') return;

      const level = mode === 'hint' ? hint.advance() : undefined;

      const userRow = await appendChat(lesson.id, { role: 'user', content: trimmed, mode });
      const history = [...messagesRef.current, userRow];

      // "Check my answer" in a programming lesson: attach the learner's current code (if any) as
      // untrusted reference data. When there is none we keep today's behaviour — ask them to paste.
      let learnerCode = null;
      if (!capstone && mode === 'check_answer' && course?.kind === 'programming') {
        try {
          learnerCode = await currentCodeBlock(lesson.id);
        } catch {
          learnerCode = null;
        }
      }

      draftRef.current = '';
      pendingRef.current = { lessonId: lesson.id, mode };
      setInput('');
      setPendingMode(null);
      setDismissedError(false);

      try {
        await start(async ({ onText, signal }) => {
          const provider = await getProvider(settingsRef.current);
          const { system, messages: built } = buildTutorMessages({
            course,
            lesson,
            lessonContent: lessonContentRef.current,
            history,
            mode: mode || undefined,
            hintLevel: level,
            language: course?.language ?? settingsRef.current.language,
            learnerCode,
            capstone,
            capstoneBrief,
          });
          return provider.streamText({
            system,
            messages: built,
            signal,
            maxTokens: MAX_TOKENS.chat,
            onText: (chunk) => {
              draftRef.current += chunk;
              onText(chunk);
            },
          });
        });
      } catch {
        /* error surfaced through `error`; partial text is still persisted below */
      }

      const saved = await persistDraft();
      if (saved) applyMessages([...messagesRef.current.filter((m) => m.id !== saved.id), saved]);
    },
    [appendChat, applyMessages, capstone, capstoneBrief, course, hint, lesson, persistDraft, start]
  );

  const handleSend = useCallback(() => {
    runTurn({ content: input, mode: pendingMode });
  }, [input, pendingMode, runTurn]);

  const handleAction = useCallback(
    (modeId) => {
      if (modeId === 'check_answer') {
        setPendingMode('check_answer');
        textareaRef.current?.focus();
        return;
      }
      const def = TUTOR_MODES.find((m) => m.id === modeId);
      runTurn({ content: def?.userText || '', mode: modeId });
    },
    [runTurn]
  );

  const handleStop = useCallback(async () => {
    stop();
    await persistDraft();
  }, [stop, persistDraft]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Auto-scroll while the learner is already at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, text]);

  const showDraft = Boolean(text) && (status === 'streaming' || pendingRef.current != null);
  const showError = error && !dismissedError;
  const ready = providerReady(settings);
  const canSend = input.trim().length > 0 && !streaming;

  const draftMessage = useMemo(
    () => ({ id: '__draft', role: 'assistant', content: text, mode: pendingRef.current?.mode || null }),
    [text]
  );

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{capstone ? 'Tutor · Capstone mode' : 'Tutor'}</h2>
          <p className="text-xs text-neutral-500">
            {capstone
              ? 'Concepts only — no hints, no code, no answers. The implementation is all you.'
              : `Socratic help for “${lesson.title}”. The tutor explains ideas and guides the exercise — it never does the work for you.`}
          </p>
        </div>
        {streaming && (
          <Button variant="secondary" size="sm" onClick={handleStop}>
            Stop
          </Button>
        )}
      </div>

      {!ready && !streaming && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          No AI source is configured yet.{' '}
          <Link to="/settings" className="font-medium underline">
            Open Settings
          </Link>{' '}
          to add a key, use a local model, or run the local agent bridge.
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex max-h-[26rem] min-h-[10rem] flex-col gap-3 overflow-y-auto rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/40"
        aria-live="polite"
      >
        {!loaded && <p className="text-sm text-neutral-500">Loading history…</p>}
        {loaded && messages.length === 0 && !showDraft && (
          <EmptyState
            title={capstone ? 'Discuss the concepts' : 'Ask about this lesson'}
            description={
              capstone
                ? 'The capstone is your solo build. Use this chat to think through a concept — not for hints, steps or code.'
                : 'Stuck on the exercise? Try a hint — the tutor will nudge you one step at a time.'
            }
            className="border-0 bg-transparent"
          />
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {showDraft && <ChatMessage message={draftMessage} streaming={streaming} />}
      </div>

      {showError && <ErrorNotice error={error} onDismiss={() => setDismissedError(true)} />}

      {capstone ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Capstone mode: the tutor will only discuss concepts. It will not give hints, steps, code or
          answers — and it will refuse if you ask.
        </p>
      ) : (
        <QuickActions
          onAction={handleAction}
          disabled={streaming}
          hintLevel={hint.level}
          pendingMode={pendingMode}
        />
      )}

      <div className="space-y-2">
        <label htmlFor={`tutor-input-${lesson.id}`} className="sr-only">
          Message the tutor
        </label>
        <textarea
          id={`tutor-input-${lesson.id}`}
          ref={textareaRef}
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            capstone
              ? 'Ask about a concept… (no hints or code in capstone mode)'
              : pendingMode === 'check_answer'
                ? 'Paste your attempt here, then press Enter — I’ll point out what’s right first.'
                : 'Ask a question… (Enter to send, Shift+Enter for a new line)'
          }
          className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            {capstone
              ? 'Concepts only — the capstone is your solo build.'
              : pendingMode === 'check_answer'
                ? 'Paste your attempt and send it.'
                : 'You do the work; the tutor guides.'}
          </p>
          <div className="flex gap-2">
            {streaming ? (
              <Button variant="secondary" size="sm" onClick={handleStop}>
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={handleSend} disabled={!canSend}>
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
