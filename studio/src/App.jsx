import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useRoute } from './lib/router.js';
import { useSettings, loadSettings, saveSettings } from './lib/settings.js';
import {
  initAdapter,
  storageKindFrom,
  resolveStorageChoice,
  planStorageMove,
  performStorageMove,
  STORAGE_BROWSER,
  STORAGE_SQLITE,
} from './lib/repo/select-adapter.js';
import { seedDemoCourse } from './data/demo-course.js';
import { Layout } from './components/Layout.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { StorageMoveDialog } from './components/data/StorageMoveDialog.jsx';
import { EmptyState } from './components/ui/EmptyState.jsx';
import { Link } from './lib/router.js';
import { Button } from './components/ui/Button.jsx';
import { Card } from './components/ui/Card.jsx';
import { Spinner } from './components/ui/Spinner.jsx';

// Route pages are code-split so the first paint only ships Home + the shell (brief §10 budget:
// main chunk < 150 KB gzip). CodeMirror, the runner, markdown/katex and Settings' DataPanel all
// stay out of the entry chunk until their route is opened.
const Home = lazy(() => import('./pages/Home.jsx').then((m) => ({ default: m.Home })));
const NewCourse = lazy(() => import('./pages/NewCourse.jsx').then((m) => ({ default: m.NewCourse })));
const Course = lazy(() => import('./pages/Course.jsx').then((m) => ({ default: m.Course })));
const Lesson = lazy(() => import('./pages/Lesson.jsx').then((m) => ({ default: m.Lesson })));
const Capstone = lazy(() => import('./pages/Capstone.jsx').then((m) => ({ default: m.Capstone })));
const Review = lazy(() => import('./pages/Review.jsx').then((m) => ({ default: m.Review })));
const Settings = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.Settings })));

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That route does not exist."
      action={
        <Link to="/">
          <Button variant="secondary">Back home</Button>
        </Link>
      }
    />
  );
}

function renderRoute(route) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'new':
      return <NewCourse />;
    case 'course':
      return <Course id={route.params.id} />;
    case 'lesson':
      return <Lesson id={route.params.id} lessonId={route.params.lessonId} />;
    case 'capstone':
      return <Capstone id={route.params.id} />;
    case 'review':
      return <Review />;
    case 'settings':
      return <Settings />;
    default:
      return <NotFound />;
  }
}

/** One-time migration when two stores both hold data (STORE-01): ask which is primary. */
function StorageDecision({ decision, onPick }) {
  const sqlite = decision?.stores?.sqlite || {};
  const browser = decision?.stores?.browser || {};
  return (
    <div className="grid min-h-full place-items-center bg-neutral-50 px-4 py-10 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Card className="w-full max-w-lg space-y-4">
        <h1 className="text-lg font-semibold">Where should your learning data live?</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Your data was found in more than one place. Pick the one Studio should use from now on — nothing is deleted,
          and you can move or remove the other copy later in Settings.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onPick(STORAGE_SQLITE)}
            className="rounded-xl border border-neutral-200 p-4 text-left hover:border-indigo-400 dark:border-neutral-800"
          >
            <p className="font-medium">SQLite file</p>
            <p className="mt-1 text-xs text-neutral-500">
              {sqlite.total || 0} records{sqlite.path ? ` · ${sqlite.path}` : ''}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onPick(STORAGE_BROWSER)}
            className="rounded-xl border border-neutral-200 p-4 text-left hover:border-indigo-400 dark:border-neutral-800"
          >
            <p className="font-medium">This browser</p>
            <p className="mt-1 text-xs text-neutral-500">{browser.total || 0} records</p>
          </button>
        </div>
      </Card>
    </div>
  );
}

/** Blocking state when SQLite is chosen but the local server is down (STORE-02). */
function StorageBlocked({ error, onRetry, onSwitch, busy, switchError }) {
  return (
    <div className="grid min-h-full place-items-center bg-neutral-50 px-4 py-10 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Card className="w-full max-w-lg space-y-4">
        <h1 className="text-lg font-semibold">Local server isn’t running</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          You chose to save your learning data in the SQLite file, so Studio won’t touch browser storage. Start the
          local server, then retry.
        </p>
        <pre className="overflow-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">course-professor studio</pre>
        {error && <p className="text-xs text-amber-700 dark:text-amber-300">{error}</p>}
        {switchError && <p className="text-xs text-red-600 dark:text-red-400">{switchError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry} disabled={busy}>
            {busy && <Spinner />}
            Retry
          </Button>
          <Button variant="secondary" onClick={onSwitch} disabled={busy}>
            Switch to browser storage…
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [settings] = useSettings();
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [switchPlan, setSwitchPlan] = useState(null);
  const [switchError, setSwitchError] = useState('');

  // Resolve (and install) the storage adapter for the chosen store. Re-runs when the choice changes
  // (onboarding, one-time migration, or the Settings switch), and never auto-falls back (STORE-02).
  useEffect(() => {
    let alive = true;
    (async () => {
      const current = loadSettings();
      if (!storageKindFrom(current)) {
        try {
          const resolved = await resolveStorageChoice(current);
          if (!alive) return;
          if (resolved.needsDecision) {
            setDecision(resolved);
            setReady(true);
            return;
          }
          saveSettings({ storage: resolved.storage });
          return; // the storage change re-runs this effect
        } catch {
          if (alive) setReady(true);
          return;
        }
      }

      const info = await initAdapter({ settings: current });
      if (!alive) return;
      if (info.blocked) {
        setBlocked({ error: info.error });
        setReady(true);
        return;
      }
      setBlocked(null);
      try {
        await seedDemoCourse();
      } catch {
        /* ignore seeding failures — the app still loads */
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [settings.storage]);

  const onDecide = useCallback((kind) => {
    setDecision(null);
    saveSettings({ storage: kind });
  }, []);

  const onRetry = useCallback(async () => {
    setBusy(true);
    try {
      const info = await initAdapter({ settings: loadSettings() });
      if (info.blocked) setBlocked({ error: info.error });
      else setBlocked(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const onStartSwitch = useCallback(async () => {
    setSwitchError('');
    setBusy(true);
    try {
      setSwitchPlan(await planStorageMove(STORAGE_BROWSER, { settings: loadSettings() }));
    } finally {
      setBusy(false);
    }
  }, []);

  const onConfirmSwitch = useCallback(async () => {
    if (!switchPlan) return;
    setBusy(true);
    setSwitchError('');
    try {
      if (switchPlan.sourceUnavailable) {
        // The old store can't be read; switch without copying and leave it untouched.
        saveSettings({ storage: STORAGE_BROWSER });
      } else {
        const result = await performStorageMove(STORAGE_BROWSER, { settings: loadSettings(), dump: switchPlan.dump });
        if (!result.switched) {
          setSwitchError(`Counts didn’t match, so nothing was switched (${result.mismatches.join(', ')}).`);
          return;
        }
      }
      setSwitchPlan(null);
    } catch (err) {
      setSwitchError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [switchPlan]);

  if (!ready) {
    return <div className="grid min-h-full place-items-center text-sm text-neutral-500">Loading Professor Studio…</div>;
  }

  if (decision) return <StorageDecision decision={decision} onPick={onDecide} />;

  if (blocked) {
    return (
      <>
        <StorageBlocked
          error={blocked.error}
          onRetry={onRetry}
          onSwitch={onStartSwitch}
          busy={busy}
          switchError={switchError}
        />
        <StorageMoveDialog
          plan={switchPlan}
          busy={busy}
          error={switchError}
          allowWithoutCopy
          onConfirm={onConfirmSwitch}
          onCancel={() => setSwitchPlan(null)}
        />
      </>
    );
  }

  if (!settings.onboardingDone) return <Onboarding />;

  return (
    <Layout>
      <Suspense
        fallback={<div className="grid min-h-full place-items-center text-sm text-neutral-500">Loading…</div>}
      >
        {renderRoute(route)}
      </Suspense>
    </Layout>
  );
}
