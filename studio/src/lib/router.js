/**
 * Tiny hash router (SHELL-02, no router dependency).
 *
 * The fragment is never sent to the server, so deep links and refresh work on any static host.
 * Routes:
 *   #/                              Home
 *   #/new                           NewCourse
 *   #/course/:id                    Course
 *   #/course/:id/lesson/:lessonId   Lesson
 *   #/review                        Review
 *   #/settings                      Settings
 */
import { useEffect, useState, createElement } from 'react';

const ROUTES = [
  { name: 'home', pattern: /^\/?$/ },
  { name: 'new', pattern: /^\/new\/?$/ },
  { name: 'lesson', pattern: /^\/course\/([^/]+)\/lesson\/([^/]+)\/?$/, keys: ['id', 'lessonId'] },
  { name: 'course', pattern: /^\/course\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'review', pattern: /^\/review\/?$/ },
  { name: 'settings', pattern: /^\/settings\/?$/ },
];

/**
 * @param {string} [hash]
 * @returns {{ name: string, path: string, params: Record<string,string> }}
 */
export function matchRoute(hash = '') {
  const path = String(hash || '').replace(/^#/, '').split('?')[0] || '/';
  for (const route of ROUTES) {
    const m = path.match(route.pattern);
    if (m) {
      const params = {};
      (route.keys || []).forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1]);
      });
      return { name: route.name, path, params };
    }
  }
  return { name: 'notfound', path, params: {} };
}

export function currentRoute() {
  if (typeof window === 'undefined') return matchRoute('/');
  return matchRoute(window.location.hash);
}

/** Navigate programmatically. */
export function navigate(to) {
  const target = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  if (typeof window !== 'undefined') window.location.hash = target;
}

/** Reactive route hook — re-renders on hashchange. */
export function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '#/';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Anchor that keeps normal link semantics (middle-click, copy link) with hash routing. */
export function Link({ to, children, ...rest }) {
  return createElement('a', { href: `#${to.startsWith('/') ? to : `/${to}`}`, ...rest }, children);
}
