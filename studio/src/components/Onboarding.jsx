/**
 * First-run onboarding (SHELL-05) — skippable at every step.
 * 1) Welcome + privacy  2) Where data is saved  3) Pick AI source  4) Configure + test  5) Done.
 */
import { useEffect, useState } from 'react';
import { useSettings, STORAGE_KINDS } from '../lib/settings.js';
import { navigate } from '../lib/router.js';
import { DEMO_COURSE_ID } from '../data/demo-course.js';
import { probeSqlite, defaultStorageKind } from '../lib/repo/select-adapter.js';
import { createIdbAdapter } from '../lib/repo/idb-adapter.js';
import { Card } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import { StorageChoice } from './data/StorageChoice.jsx';
import { ProviderPicker, ProviderFields } from './settings/ProviderForm.jsx';

const STEP_TITLES = ['Welcome', 'Where data is saved', 'Choose an AI source', 'Connect', 'You are ready'];
const LAST_STEP = STEP_TITLES.length - 1;

export function Onboarding() {
  const [settings, update] = useSettings();
  const [step, setStep] = useState(0);
  const [sqliteStatus, setSqliteStatus] = useState(null);
  const [browserStatus, setBrowserStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sqlite, browser] = await Promise.all([
        probeSqlite(settings),
        createIdbAdapter().info().catch(() => null),
      ]);
      if (!alive) return;
      setSqliteStatus(sqlite);
      setBrowserStatus(browser);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.bridge?.bridgeUrl, settings.bridge?.bridgeToken]);

  // Pre-save the default (SQLite when the CLI paired a bridge, else browser) so the app installs the
  // right adapter even if the learner skips the storage step.
  const storageValue = STORAGE_KINDS.includes(settings.storage) ? settings.storage : defaultStorageKind(settings);

  const finish = (to) => {
    update({ onboardingDone: true, storage: storageValue });
    navigate(to);
  };

  const next = () => setStep((s) => Math.min(LAST_STEP, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="grid min-h-full place-items-center bg-neutral-50 px-4 py-10 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">P</span>
            <span className="font-semibold">Professor Studio</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>
              Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}
            </span>
            <button type="button" onClick={() => finish('/')} className="underline">
              Skip
            </button>
          </div>
        </div>

        <Card className="space-y-5">
          {step === 0 && (
            <div className="space-y-3">
              <h1 className="text-xl font-semibold">Learn anything with a Socratic professor</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Create a course, study generated lessons, practise with quizzes and flashcards, and ask a tutor
                that guides you instead of doing the work for you.
              </p>
              <p className="rounded-lg bg-neutral-100 p-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                Everything stays on your device. Your API keys are never uploaded or included in backups.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Where should your learning data be saved?</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                You can change this later in Settings — Studio will offer to move your data for you.
              </p>
              <StorageChoice
                value={storageValue}
                onSelect={(storage) => update({ storage })}
                sqliteStatus={sqliteStatus}
                browserStatus={browserStatus}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Where should lessons come from?</h2>
              <ProviderPicker provider={settings.provider} onPick={(id) => update({ provider: id })} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Connect and test</h2>
              <ProviderFields settings={settings} update={update} compact />
            </div>
          )}

          {step === LAST_STEP && (
            <div className="space-y-3">
              <h2 className="font-semibold">You are all set</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Create your first course, or explore the bundled demo course — it works with no provider at all.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button variant="ghost" onClick={step === 0 ? () => finish('/') : back}>
              {step === 0 ? 'Skip' : 'Back'}
            </Button>
            <div className="flex gap-2">
              {step === LAST_STEP ? (
                <>
                  <Button variant="secondary" onClick={() => finish(`/course/${DEMO_COURSE_ID}`)}>
                    Try the demo course
                  </Button>
                  <Button onClick={() => finish('/new')}>Create your first course</Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => finish(`/course/${DEMO_COURSE_ID}`)}>
                    Try the demo course
                  </Button>
                  <Button onClick={next}>Next</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
