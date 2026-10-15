/**
 * CodeWorkspace (CODE-01, CODE-05) — the Workspace tab of a programming lesson.
 *
 * A lightweight multi-file editor (CodeMirror, lazy-loaded) preloaded with the exercise skeleton.
 * Run executes in the browser where possible (JS/TS, Python, SQL, HTML/CSS) and otherwise through
 * the learner's local server; Check surfaces the exercise's self-checks as pass/fail (CODE-03).
 * Edits autosave (debounced), every run stores a code snapshot + result, and the tutor can read
 * the current buffer through `lib/runner/current-code.js`.
 *
 * Props are fixed by Lesson.jsx: `{ lesson, course }`.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { listWorkspaceFiles, saveWorkspaceFile, saveRunResult, listRunResults } from '../../lib/repo/index.js';
import { useSettings } from '../../lib/settings.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';
import { Badge } from '../ui/Badge.jsx';
import { FileTabs } from './FileTabs.jsx';
import { OutputPanel } from './OutputPanel.jsx';
import { HistoryDrawer } from './HistoryDrawer.jsx';
import {
  seedFiles,
  filesFromRows,
  DELETED_MARKER,
} from '../../lib/runner/skeleton.js';
import { guessCourseLanguage, getLanguage, languageForPath, normalizeLanguage } from '../../lib/runner/languages.js';
import { run as runCode, describeRunner, checkToolchains } from '../../lib/runner/index.js';
import { encodeRunPayload, decodeRunResult } from '../../lib/runner/history.js';
import { setCurrentCode, clearCurrentCode } from '../../lib/runner/current-code.js';
import { isSafeRelPath, slugify } from '../../lib/runner/path.js';

const Editor = lazy(() => import('./Editor.jsx'));

const EMPTY_OUTPUT = {
  stdout: '',
  stderr: '',
  checks: [],
  rows: null,
  preview: null,
  exitCode: null,
  durationMs: null,
  runner: null,
  statusText: '',
  timedOut: false,
  aborted: false,
  outputTruncated: false,
};

/** @returns {boolean} */
function usePrefersDark() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return dark;
}

/** @param {Array<{path:string,content:string}>} files */
function toMap(files) {
  return Object.fromEntries(files.map((f) => [f.path, f.content]));
}

/** @param {string} path */
function ensureExt(path) {
  return /\.[a-z0-9]+$/i.test(path) ? path : `${path}.js`;
}

export function CodeWorkspace({ lesson, course }) {
  const [settings] = useSettings();
  const dark = usePrefersDark();
  const courseId = course?.id || null;
  const courseSlug = slugify(course?.title || courseId || 'workspace');

  const [files, setFiles] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(null);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [toolchains, setToolchains] = useState(null);

  const abortRef = useRef(null);
  const outRef = useRef({ ...EMPTY_OUTPUT });
  const rafRef = useRef(null);
  const filesRef = useRef(files);
  const dirtyRef = useRef(new Set());
  const saveTimerRef = useRef(null);
  const idByPathRef = useRef(new Map());

  filesRef.current = files;

  const scheduleRender = useCallback(() => {
    if (typeof requestAnimationFrame === 'undefined') {
      setOutput({ ...outRef.current });
      return;
    }
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setOutput({ ...outRef.current });
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const rows = await listRunResults(lesson.id);
      setHistory(rows.map(decodeRunResult));
    } catch {
      setHistory([]);
    }
  }, [lesson?.id]);

  /* --------------------------------------------------------------- load + seed */
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    idByPathRef.current = new Map();
    dirtyRef.current = new Set();
    (async () => {
      let seed = [];
      try {
        const rows = await listWorkspaceFiles(lesson.id);
        if (rows.length) {
          seed = filesFromRows(rows);
          for (const row of rows) if (row.content !== DELETED_MARKER) idByPathRef.current.set(row.path, row.id);
        }
      } catch {
        seed = [];
      }
      if (!seed.length) {
        seed = seedFiles(lesson, course);
        for (const file of seed) {
          try {
            const row = await saveWorkspaceFile({
              courseId,
              lessonId: lesson.id,
              path: file.path,
              language: file.language,
              content: file.content,
            });
            idByPathRef.current.set(file.path, row.id);
          } catch {
            /* keep the seed in memory even if storage is unavailable */
          }
        }
      }
      if (!alive) return;
      setFiles(seed);
      setActivePath(seed[0]?.path || null);
      setLoaded(true);
      setCurrentCode(lesson.id, {
        language: seed[0]?.language || null,
        entry: seed[0]?.path || null,
        files: toMap(seed),
      });
    })();
    refreshHistory();
    return () => {
      alive = false;
      if (rafRef.current && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafRef.current);
      clearCurrentCode(lesson.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  /* --------------------------------------------------------------- toolchains probe (local langs only) */
  const activeLanguage = getLanguage(activePath ? languageForPath(activePath) : null);
  useEffect(() => {
    if (!activeLanguage || activeLanguage.backend !== 'local' || toolchains) return undefined;
    let alive = true;
    checkToolchains(settings)
      .then((result) => alive && setToolchains(result))
      .catch(() => alive && setToolchains(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, activeLanguage?.id, toolchains]);

  /* --------------------------------------------------------------- autosave */
  const flushSave = useCallback(async () => {
    const paths = [...dirtyRef.current];
    dirtyRef.current.clear();
    for (const path of paths) {
      const file = filesRef.current.find((f) => f.path === path);
      if (!file) continue;
      try {
        const row = await saveWorkspaceFile({
          courseId,
          lessonId: lesson.id,
          path,
          language: file.language,
          content: file.content,
        });
        idByPathRef.current.set(path, row.id);
      } catch {
        /* storage full / unavailable — keep editing */
      }
    }
  }, [courseId, lesson?.id]);

  const scheduleSave = useCallback(
    (path) => {
      dirtyRef.current.add(path);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, 1000);
    },
    [flushSave]
  );

  const updateFile = useCallback(
    (path, content, { persist = true } = {}) => {
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
      if (persist) scheduleSave(path);
    },
    [scheduleSave]
  );

  useEffect(() => {
    if (!activePath) return;
    const active = filesRef.current.find((f) => f.path === activePath);
    setCurrentCode(lesson.id, {
      language: active?.language || null,
      entry: activePath,
      files: toMap(filesRef.current),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, JSON.stringify(files)]);

  /* --------------------------------------------------------------- run */
  const pushChunk = useCallback(
    (chunk) => {
      const out = outRef.current;
      if (chunk.stream === 'stdout') out.stdout += chunk.text;
      else if (chunk.stream === 'stderr') out.stderr += chunk.text;
      else if (chunk.stream === 'status') out.statusText = chunk.text;
      scheduleRender();
    },
    [scheduleRender]
  );

  const start = useCallback(
    async (kind) => {
      if (running || !filesRef.current.length) return;
      setError(null);
      setRunning(kind);
      abortRef.current = new AbortController();
      outRef.current = { ...EMPTY_OUTPUT };
      setOutput({ ...outRef.current });

      const current = filesRef.current;
      const active = current.find((f) => f.path === activePath) || current[0];
      const language = normalizeLanguage(active?.language) || guessCourseLanguage(course) || languageForPath(active?.path) || 'javascript';

      try {
        const result = await runCode({
          language,
          files: toMap(current),
          entry: active?.path,
          courseSlug,
          settings,
          signal: abortRef.current.signal,
          onOutput: pushChunk,
        });
        outRef.current = { ...outRef.current, ...result };
        setOutput({ ...outRef.current });

        if (!result.aborted) {
          const payload = encodeRunPayload({
            checks: result.checks,
            files: toMap(current),
            entry: active?.path,
            language,
          });
          await saveRunResult({
            lessonId: lesson.id,
            fileId: idByPathRef.current.get(active?.path) || null,
            runner: result.runner,
            language,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            checks: payload,
            durationMs: result.durationMs,
          });
          await refreshHistory();
        }
      } catch (err) {
        if (err?.code === 'aborted' || err?.name === 'AbortError') {
          outRef.current.aborted = true;
          setOutput({ ...outRef.current });
        } else {
          setError(err);
        }
      } finally {
        setRunning(null);
        abortRef.current = null;
      }
    },
    [activePath, course, courseSlug, lesson?.id, pushChunk, refreshHistory, running, settings]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* --------------------------------------------------------------- file actions */
  const addFile = useCallback(async () => {
    const name = window.prompt('New file name (e.g. util.js)');
    if (!name) return;
    const path = ensureExt(name.trim());
    if (!isSafeRelPath(path)) {
      setError(Object.assign(new Error('Invalid file name.'), { hint: 'Use a simple relative name like util.js — no slashes at the start or "..".' }));
      return;
    }
    if (filesRef.current.some((f) => f.path === path)) {
      setActivePath(path);
      return;
    }
    const language = languageForPath(path);
    const next = [...filesRef.current, { path, content: '', language }];
    setFiles(next);
    setActivePath(path);
    try {
      const row = await saveWorkspaceFile({ courseId, lessonId: lesson.id, path, language, content: '' });
      idByPathRef.current.set(path, row.id);
    } catch {
      /* ignore */
    }
  }, [courseId, lesson?.id]);

  const renameFile = useCallback(
    async (from) => {
      const name = window.prompt('Rename file to', from);
      if (!name || name.trim() === from) return;
      const to = name.trim();
      if (!isSafeRelPath(to) || filesRef.current.some((f) => f.path === to)) {
        setError(Object.assign(new Error('Invalid or duplicate file name.'), { hint: 'Pick a unique relative name without "..".' }));
        return;
      }
      const target = filesRef.current.find((f) => f.path === from);
      if (!target) return;
      const language = languageForPath(to) || target.language;
      setFiles((prev) => prev.map((f) => (f.path === from ? { ...f, path: to, language } : f)));
      if (activePath === from) setActivePath(to);
      try {
        await saveWorkspaceFile({ courseId, lessonId: lesson.id, path: to, language, content: target.content });
        await saveWorkspaceFile({ courseId, lessonId: lesson.id, path: from, language: null, content: DELETED_MARKER });
      } catch {
        /* ignore */
      }
    },
    [activePath, courseId, lesson?.id]
  );

  const deleteFile = useCallback(
    async (path) => {
      if (filesRef.current.length <= 1) return;
      if (!window.confirm(`Delete ${path}? The run history is kept.`)) return;
      const remaining = filesRef.current.filter((f) => f.path !== path);
      setFiles(remaining);
      if (activePath === path) setActivePath(remaining[0]?.path || null);
      try {
        await saveWorkspaceFile({ courseId, lessonId: lesson.id, path, language: null, content: DELETED_MARKER });
      } catch {
        /* ignore */
      }
    },
    [activePath, courseId, lesson?.id]
  );

  const resetToSkeleton = useCallback(async () => {
    if (!window.confirm('Reset the workspace to the exercise skeleton? Your run history is kept, but current edits will be replaced.')) return;
    const seed = seedFiles(lesson, course);
    setFiles(seed);
    setActivePath(seed[0]?.path || null);
    for (const file of seed) {
      try {
        const row = await saveWorkspaceFile({ courseId, lessonId: lesson.id, path: file.path, language: file.language, content: file.content });
        idByPathRef.current.set(file.path, row.id);
      } catch {
        /* ignore */
      }
    }
  }, [course, courseId, lesson]);

  const restoreSnapshot = useCallback(
    async (run) => {
      const snapshot = run.snapshot?.files;
      if (!snapshot) return;
      const restored = Object.entries(snapshot).map(([path, content]) => ({
        path,
        content: String(content ?? ''),
        language: languageForPath(path),
      }));
      setFiles(restored);
      setActivePath(restored[0]?.path || null);
      setShowHistory(false);
      for (const file of restored) {
        try {
          const row = await saveWorkspaceFile({ courseId, lessonId: lesson.id, path: file.path, language: file.language, content: file.content });
          idByPathRef.current.set(file.path, row.id);
        } catch {
          /* ignore */
        }
      }
    },
    [courseId, lesson?.id]
  );

  const activeFile = files.find((f) => f.path === activePath) || files[0] || null;
  const runnerInfo = describeRunner(activeFile?.language, { toolchains });

  if (!loaded) {
    return (
      <Card className="flex items-center gap-2 text-sm text-neutral-500">
        <Spinner /> Loading workspace…
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Workspace</h2>
          <Badge tone={runnerInfo.kind === 'local' ? 'accent' : 'neutral'}>
            {runnerInfo.kind === 'local' ? 'Local server' : 'Browser'}
          </Badge>
          {runnerInfo.kind === 'local' && !runnerInfo.ready && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {runnerInfo.command ? `needs \`${runnerInfo.command}\`` : 'needs the local server'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => start('run')} disabled={Boolean(running)}>
            {running === 'run' ? 'Running…' : 'Run'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => start('check')} disabled={Boolean(running)}>
            {running === 'check' ? 'Checking…' : 'Check'}
          </Button>
          {running && (
            <Button size="sm" variant="ghost" onClick={stop}>
              Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            History{history.length ? ` (${history.length})` : ''}
          </Button>
          <Button size="sm" variant="ghost" onClick={resetToSkeleton}>
            Reset
          </Button>
        </div>
      </div>

      <FileTabs
        files={files}
        activePath={activeFile?.path}
        onSelect={setActivePath}
        onAdd={addFile}
        onRename={renameFile}
        onDelete={deleteFile}
      />

      {activeFile ? (
        <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-neutral-500"><Spinner /> Loading editor…</div>}>
          <Editor
            value={activeFile.content}
            language={activeFile.language}
            dark={dark}
            onChange={(next) => updateFile(activeFile.path, next)}
          />
        </Suspense>
      ) : null}

      {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}

      <OutputPanel output={output} runnerInfo={runnerInfo} />

      {showHistory ? (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <HistoryDrawer runs={history} onRestore={restoreSnapshot} onClose={() => setShowHistory(false)} />
        </div>
      ) : null}
    </Card>
  );
}
