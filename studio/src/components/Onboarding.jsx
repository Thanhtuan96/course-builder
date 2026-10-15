/**
 * First-run onboarding (SHELL-05) — skippable at every step.
 * 1) Welcome + privacy  2) Pick AI source  3) Configure + test  4) Done / try the demo.
 */
import { useState } from 'react';
import { useSettings } from '../lib/settings.js';
import { navigate } from '../lib/router.js';
import { DEMO_COURSE_ID } from '../data/demo-course.js';
import { Card } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import { ProviderPicker, ProviderFields } from './settings/ProviderForm.jsx';

const STEP_TITLES = ['Welcome', 'Choose an AI source', 'Connect', 'You are ready'];

export function Onboarding() {
  const [settings, update] = useSettings();
  const [step, setStep] = useState(0);

  const finish = (to) => {
    update({ onboardingDone: true });
    navigate(to);
  };

  const next = () => setStep((s) => Math.min(3, s + 1));
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
              Step {step + 1} of 4 · {STEP_TITLES[step]}
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
              <h2 className="font-semibold">Where should lessons come from?</h2>
              <ProviderPicker provider={settings.provider} onPick={(id) => update({ provider: id, model: settings[id]?.model || '' })} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Connect and test</h2>
              <ProviderFields settings={settings} update={update} compact />
            </div>
          )}

          {step === 3 && (
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
              {step === 3 ? (
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
