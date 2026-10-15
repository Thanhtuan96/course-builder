/**
 * Settings page (final): provider config + test connection, key management, storage info,
 * and the DataPanel mount point (Phase 26 replaces the stub in place).
 */
import { useEffect, useState } from 'react';
import { useSettings, clearSecrets } from '../lib/settings.js';
import { getAdapterInfo } from '../lib/repo/index.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Select } from '../components/ui/Input.jsx';
import { ProviderFields } from '../components/settings/ProviderForm.jsx';
import { DataPanel } from '../components/data/DataPanel.jsx';

export function Settings() {
  const [settings, update] = useSettings();
  const [adapter, setAdapter] = useState(null);

  useEffect(() => {
    getAdapterInfo().then(setAdapter).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Keys stay in this browser and are sent only to the provider you choose.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">AI source</h2>
        <ProviderFields settings={settings} update={update} />
        <div>
          <Button variant="danger" size="sm" onClick={clearSecrets}>
            Clear keys
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Learner</h2>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Your name"
            name="learnerName"
            value={settings.learnerName}
            onChange={(e) => update({ learnerName: e.target.value })}
            placeholder="Optional — used to greet you"
          />
          <Select
            label="Tutor language"
            name="language"
            value={settings.language}
            onChange={(e) => update({ language: e.target.value })}
          >
            {['English', 'Vietnamese', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Storage</h2>
        <Card className="space-y-1 text-sm">
          {adapter ? (
            <>
              <p>
                <span className="text-neutral-500">Storage:</span>{' '}
                <span className="font-medium">
                  {adapter.kind === 'indexeddb' ? 'IndexedDB (this browser)' : adapter.kind === 'memory' ? 'In-memory (not persistent)' : 'Remote server'}
                </span>
              </p>
              <p>
                <span className="text-neutral-500">Persistent:</span>{' '}
                <span className="font-medium">{adapter.persistent ? 'granted' : 'best-effort'}</span>
              </p>
              {!adapter.persistent && (
                <p className="text-amber-700 dark:text-amber-300">
                  Your data can be cleared by the browser. Export a backup regularly.
                </p>
              )}
            </>
          ) : (
            <p className="text-neutral-500">Checking storage…</p>
          )}
        </Card>
        <DataPanel />
      </section>
    </div>
  );
}
