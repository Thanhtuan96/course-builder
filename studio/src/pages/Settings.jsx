/**
 * Settings page (final): provider config + test connection, key management, storage choice,
 * and the DataPanel mount point (Phase 26 replaces the stub in place).
 */
import { useEffect } from 'react';
import { useSettings, clearSecrets } from '../lib/settings.js';
import { useT } from '../lib/i18n/index.js';
import { uiLanguageOptions } from '../lib/i18n/languages.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Select } from '../components/ui/Input.jsx';
import { ProviderFields } from '../components/settings/ProviderForm.jsx';
import { StorageSection } from '../components/data/StorageSection.jsx';
import { DataPanel } from '../components/data/DataPanel.jsx';

/**
 * Whether the Home nudge sent the learner here with `?report=1` (D-02).
 * `matchRoute` strips the query before matching, so the route is still `settings` — this helper only
 * decides whether to scroll. Pure: it takes the hash, never `window`.
 * @param {string} [hash]
 * @returns {boolean}
 */
export function reportRequested(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  const at = raw.indexOf('?');
  if (at === -1) return false;
  return new URLSearchParams(raw.slice(at + 1)).get('report') === '1';
}

/**
 * Scroll the export card into view (D-02).
 *
 * This is a helper, not an anchor, on purpose: the hash router owns the fragment, so an anchor whose
 * href is the bare `#beta-report` fragment would be parsed as a route and render NotFound. `doc` is
 * injectable so the Node harness can drive it without a DOM, and every lookup is optional-chained.
 * @param {Document|null} [doc]
 * @returns {boolean} true only when a scroll was actually requested
 */
export function scrollToBetaReport(doc = typeof document !== 'undefined' ? document : null) {
  const el = doc?.getElementById?.('beta-report');
  if (!el || typeof el.scrollIntoView !== 'function') return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function Settings() {
  const t = useT();
  const [settings, update] = useSettings();

  // One-shot deep-link handling: effects never run under `renderToString`, and the `window` guard keeps
  // the module importable in Node. The query is deliberately left in the URL — it is not a secret.
  useEffect(() => {
    if (typeof window !== 'undefined' && reportRequested(window.location.hash)) scrollToBetaReport();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('settings.subtitle')}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{t('settings.aiSource')}</h2>
        <ProviderFields settings={settings} update={update} />
        <div>
          <Button variant="danger" size="sm" onClick={clearSecrets}>
            {t('settings.clearKeys')}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{t('settings.learner')}</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('settings.name')}
            name="learnerName"
            value={settings.learnerName}
            onChange={(e) => update({ learnerName: e.target.value })}
            placeholder={t('settings.namePlaceholder')}
          />
          <Select
            label={t('settings.learningLanguage')}
            name="language"
            hint={t('settings.languageHint')}
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
          >
            {uiLanguageOptions().map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </Select>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{t('settings.storage')}</h2>
          <button
            type="button"
            onClick={() => scrollToBetaReport()}
            className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-white"
          >
            {t('betaReport.jump')}
          </button>
        </div>
        <StorageSection settings={settings} update={update} />
        <DataPanel />
      </section>
    </div>
  );
}
