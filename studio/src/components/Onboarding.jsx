/**
 * First-run onboarding (SHELL-05) — skippable at every step.
 * 1) Welcome + privacy  2) Where data is saved  3) Pick AI source  4) Configure + test  5) Done.
 */
import { useEffect, useRef, useState } from 'react';
import { useSettings, STORAGE_KINDS } from '../lib/settings.js';
import { navigate } from '../lib/router.js';
import { useT } from '../lib/i18n/index.js';
import { languageFromNavigator, uiLanguageOptions } from '../lib/i18n/languages.js';
import { DEMO_COURSE_ID } from '../data/demo-course.js';
import { probeSqlite, defaultStorageKind } from '../lib/repo/select-adapter.js';
import { createIdbAdapter } from '../lib/repo/idb-adapter.js';
import { Card } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import { Select } from './ui/Input.jsx';
import { StorageChoice } from './data/StorageChoice.jsx';
import { ProviderPicker, ProviderFields } from './settings/ProviderForm.jsx';

const STEP_KEYS = ['welcome', 'storage', 'source', 'connect', 'ready'];
const LAST_STEP = STEP_KEYS.length - 1;

export function Onboarding() {
  const t = useT();
  const [settings, update] = useSettings();
  const [step, setStep] = useState(0);
  const [sqliteStatus, setSqliteStatus] = useState(null);
  const [browserStatus, setBrowserStatus] = useState(null);
  const preselectedRef = useRef(false);

  // LANG-01: preselect the learning language from the browser once, on first run.
  useEffect(() => {
    if (preselectedRef.current) return;
    preselectedRef.current = true;
    const suggested = languageFromNavigator(typeof navigator !== 'undefined' ? navigator.language : '');
    if (suggested !== settings.language) update({ language: suggested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <span className="font-semibold">{t('nav.brand')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>
              {t('onboarding.step', {
                n: step + 1,
                total: STEP_KEYS.length,
                name: t(`onboarding.steps.${STEP_KEYS[step]}`),
              })}
            </span>
            <button type="button" onClick={() => finish('/')} className="underline">
              {t('onboarding.skip')}
            </button>
          </div>
        </div>

        <Card className="space-y-5">
          {step === 0 && (
            <div className="space-y-3">
              <h1 className="text-xl font-semibold">{t('onboarding.welcome.title')}</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('onboarding.welcome.body')}</p>
              <Select
                label={t('onboarding.welcome.language')}
                name="onboardingLanguage"
                value={settings.language}
                onChange={(e) => update({ language: e.target.value })}
              >
                {uiLanguageOptions().map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <p className="rounded-lg bg-neutral-100 p-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                {t('onboarding.welcome.privacy')}
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('onboarding.storage.title')}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('onboarding.storage.body')}</p>
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
              <h2 className="font-semibold">{t('onboarding.source.title')}</h2>
              <ProviderPicker provider={settings.provider} onPick={(id) => update({ provider: id })} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('onboarding.connect.title')}</h2>
              <ProviderFields settings={settings} update={update} compact />
            </div>
          )}

          {step === LAST_STEP && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('onboarding.ready.title')}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('onboarding.ready.body')}</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button variant="ghost" onClick={step === 0 ? () => finish('/') : back}>
              {step === 0 ? t('onboarding.skip') : t('onboarding.back')}
            </Button>
            <div className="flex gap-2">
              {step === LAST_STEP ? (
                <>
                  <Button variant="secondary" onClick={() => finish(`/course/${DEMO_COURSE_ID}`)}>
                    {t('onboarding.tryDemo')}
                  </Button>
                  <Button onClick={() => finish('/new')}>{t('onboarding.createFirst')}</Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => finish(`/course/${DEMO_COURSE_ID}`)}>
                    {t('onboarding.tryDemo')}
                  </Button>
                  <Button onClick={next}>{t('onboarding.next')}</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
