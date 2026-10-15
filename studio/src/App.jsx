import { useEffect, useState } from 'react';
import { useRoute } from './lib/router.js';
import { useSettings } from './lib/settings.js';
import { initAdapter } from './lib/repo/select-adapter.js';
import { seedDemoCourse } from './data/demo-course.js';
import { Layout } from './components/Layout.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { Home } from './pages/Home.jsx';
import { NewCourse } from './pages/NewCourse.jsx';
import { Course } from './pages/Course.jsx';
import { Lesson } from './pages/Lesson.jsx';
import { Review } from './pages/Review.jsx';
import { Settings } from './pages/Settings.jsx';
import { EmptyState } from './components/ui/EmptyState.jsx';
import { Link } from './lib/router.js';
import { Button } from './components/ui/Button.jsx';

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
    case 'review':
      return <Review />;
    case 'settings':
      return <Settings />;
    default:
      return <NotFound />;
  }
}

export default function App() {
  const route = useRoute();
  const [settings] = useSettings();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // Probe the local bridge once at startup so Studio uses SQLite when it is configured;
    // `initAdapter` falls back to IndexedDB on its own when the probe fails (HANDOFF-26 §1).
    (async () => {
      try {
        await initAdapter();
      } catch {
        /* falls back to IndexedDB */
      }
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
  }, []);

  if (!ready) {
    return <div className="grid min-h-full place-items-center text-sm text-neutral-500">Loading Professor Studio…</div>;
  }

  if (!settings.onboardingDone) return <Onboarding />;

  return <Layout>{renderRoute(route)}</Layout>;
}
