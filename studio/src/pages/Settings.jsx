/**
 * Settings page (final): provider config + test connection, key management, storage choice,
 * and the DataPanel mount point (Phase 26 replaces the stub in place).
 */
import { useSettings, clearSecrets } from '../lib/settings.js';
import { useT } from '../lib/i18n/index.js';
import { uiLanguageOptions } from '../lib/i18n/languages.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Select } from '../components/ui/Input.jsx';
import { ProviderFields } from '../components/settings/ProviderForm.jsx';
import { StorageSection } from '../components/data/StorageSection.jsx';
import { DataPanel } from '../components/data/DataPanel.jsx';

export function Settings() {
  const t = useT();
  const [settings, update] = useSettings();

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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{t('settings.storage')}</h2>
        <StorageSection settings={settings} update={update} />
        <DataPanel />
      </section>
    </div>
  );
}
