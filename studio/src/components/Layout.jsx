import { useState } from 'react';
import { Link, useRoute } from '../lib/router.js';
import { useSettings, STORAGE_BROWSER } from '../lib/settings.js';
import { PROVIDERS } from '../lib/ai/index.js';
import { useProviderStatus, providerReadiness } from '../lib/ai/status.js';
import { DueBadge } from './practice/DueBadge.jsx';

// The "only in this browser" banner is dismissed per session (STORE-04) — a new tab/session shows it
// again so a browser-only learner is never left thinking their data is safely stored elsewhere.
const DISMISS_KEY = 'professor-studio:durability-dismissed';

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white'
          : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

export function Layout({ children }) {
  const route = useRoute();
  const [settings] = useSettings();
  const providerStatus = useProviderStatus();
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DISMISS_KEY) === '1' : false
  );

  const provider = PROVIDERS.find((p) => p.id === settings.provider);
  const readiness = providerReadiness(settings, providerStatus);
  // STORE-04: the banner is about browser-only storage, so it shows only when the learner chose the
  // browser — never when data lives in the SQLite file.
  const showDurability = settings.storage === STORAGE_BROWSER && !dismissed;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">P</span>
            <span className="text-base font-semibold tracking-tight">Professor Studio</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink to="/" active={route.name === 'home'}>
              Home
            </NavLink>
            <span className="flex items-center gap-1">
              <NavLink to="/review" active={route.name === 'review'}>
                Review
              </NavLink>
              <DueBadge />
            </span>
            <NavLink to="/settings" active={route.name === 'settings'}>
              Settings
            </NavLink>
          </nav>

          <Link
            to="/settings"
            title={provider ? `${provider.label} — ${readiness.label}` : 'No AI source selected'}
            className="flex items-center gap-2 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            <span className={`h-2 w-2 rounded-full ${readiness.dot}`} aria-hidden="true" />
            <span className="hidden sm:inline">{provider ? provider.label : 'No provider'}</span>
            <span className={readiness.state === 'ready' ? 'text-green-600 dark:text-green-400' : 'text-neutral-500'}>
              {readiness.label}
            </span>
          </Link>
        </div>
      </header>

      {showDurability && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span>
              Your data is only in this browser — export a backup in{' '}
              <Link to="/settings" className="underline">
                Settings
              </Link>
              .
            </span>
            <button type="button" onClick={dismiss} className="shrink-0 text-xs opacity-70 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-neutral-200 bg-white sm:hidden dark:border-neutral-800 dark:bg-neutral-950">
        {[
          { to: '/', label: 'Home', name: 'home' },
          { to: '/review', label: 'Review', name: 'review' },
          { to: '/settings', label: 'Settings', name: 'settings' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-1 items-center justify-center gap-1 py-3 text-xs font-medium ${
              route.name === item.name ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
