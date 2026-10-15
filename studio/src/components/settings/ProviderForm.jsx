/**
 * Provider configuration, shared by Settings and Onboarding (reuse, no duplication).
 *   <ProviderPicker />  — the 4 provider cards with pros/cons
 *   <ProviderFields />  — per-provider fields + model select + "Test connection"
 */
import { useState } from 'react';
import {
  PROVIDERS,
  getProvider,
  testConnection,
  ANTHROPIC_MODELS,
  OPENAI_PRESETS,
  BRIDGE_AGENTS,
  DEFAULT_BRIDGE_AGENT,
} from '../../lib/ai/index.js';
import { recordProviderTest } from '../../lib/ai/status.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Input, Select } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

export function ProviderPicker({ provider, onPick }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROVIDERS.map((p) => {
        const active = p.id === provider;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              active
                ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10'
                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.label}</span>
              {active && <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Selected</span>}
            </div>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{p.tagline}</p>
            <p className="mt-2 text-xs text-green-700 dark:text-green-400">+ {p.pros}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">− {p.cons}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ProviderFields({ settings, update, compact = false }) {
  const [testing, setTesting] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [models, setModels] = useState(null);
  const [agentModels, setAgentModels] = useState(null);
  const [loadingAgentModels, setLoadingAgentModels] = useState(false);
  const provider = settings.provider;

  // Any config edit invalidates the last successful test for this provider.
  const set = (patch) => {
    recordProviderTest(provider, false);
    update(patch);
  };

  const setProvider = (id) => {
    update({ provider: id });
    setOutput('');
    setError(null);
  };

  const bridgeAgent = settings.bridge?.agent || DEFAULT_BRIDGE_AGENT;
  const bridgeAgentMeta = BRIDGE_AGENTS.find((a) => a.id === bridgeAgent) || BRIDGE_AGENTS[0];
  const storedAgentModel = settings.bridge?.models?.[bridgeAgent] || '';
  const knownModel = agentModels ? agentModels.some((m) => m.id === storedAgentModel) : false;
  const selectedAgentModel = knownModel ? storedAgentModel : '';
  const customAgentModel = selectedAgentModel ? '' : storedAgentModel;

  const setAgentModel = (value) => set({ bridge: { models: { [bridgeAgent]: value } } });

  const loadAgentModels = async () => {
    setLoadingAgentModels(true);
    setError(null);
    try {
      const bridge = await getProvider({ ...settings, provider: 'bridge' });
      const res = await bridge.listModels(bridgeAgent);
      setAgentModels(res.models || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingAgentModels(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setOutput('');
    setError(null);
    try {
      const text = await testConnection(settings, { onText: (t) => setOutput((prev) => prev + t) });
      setOutput(text);
      recordProviderTest(provider, true);
    } catch (err) {
      setError(err);
      recordProviderTest(provider, false);
      if (!output) setOutput('');
    } finally {
      setTesting(false);
    }
  };

  const loadOllamaModels = async () => {
    setError(null);
    try {
      const ollama = await getProvider({ ...settings, provider: 'ollama' });
      const list = await ollama.listModels();
      setModels(list);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Card className="space-y-4">
      {!compact && <ProviderPicker provider={provider} onPick={setProvider} />}

      <div className="space-y-3">
        {provider === 'anthropic' && (
          <>
            <Input
              label="Anthropic API key"
              name="anthropicKey"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={settings.anthropic.apiKey}
              onChange={(e) => set({ anthropic: { apiKey: e.target.value } })}
            />
            <Select
              label="Model"
              name="anthropicModel"
              value={settings.anthropic.model}
              onChange={(e) => set({ anthropic: { model: e.target.value } })}
            >
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </>
        )}

        {provider === 'openai' && (
          <>
            <Select
              label="Preset"
              name="openaiPreset"
              value={settings.openai.preset || 'openai'}
              onChange={(e) => {
                const preset = OPENAI_PRESETS.find((p) => p.id === e.target.value);
                set({
                  openai: {
                    preset: e.target.value,
                    baseUrl: preset.baseUrl || settings.openai.baseUrl,
                    model: preset.model || settings.openai.model,
                  },
                });
              }}
            >
              {OPENAI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Input
              label="Base URL"
              name="openaiBaseUrl"
              placeholder="https://api.openai.com/v1"
              value={settings.openai.baseUrl}
              onChange={(e) => set({ openai: { baseUrl: e.target.value } })}
            />
            <Input
              label="API key"
              name="openaiKey"
              type="password"
              autoComplete="off"
              placeholder={provider === 'openai' ? 'sk-…' : 'optional for local servers'}
              value={settings.openai.apiKey}
              onChange={(e) => set({ openai: { apiKey: e.target.value } })}
            />
            <Input
              label="Model"
              name="openaiModel"
              value={settings.openai.model}
              onChange={(e) => set({ openai: { model: e.target.value } })}
            />
          </>
        )}

        {provider === 'ollama' && (
          <>
            <Input
              label="Ollama base URL"
              name="ollamaBaseUrl"
              value={settings.ollama.baseUrl}
              onChange={(e) => set({ ollama: { baseUrl: e.target.value } })}
            />
            <div className="flex items-end gap-2">
              <Select
                label="Model"
                name="ollamaModel"
                className="flex-1"
                value={settings.ollama.model}
                onChange={(e) => set({ ollama: { model: e.target.value } })}
              >
                {models ? (
                  models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                ) : (
                  <option value={settings.ollama.model}>{settings.ollama.model}</option>
                )}
              </Select>
              <Button variant="secondary" onClick={loadOllamaModels}>
                Load installed
              </Button>
            </div>
          </>
        )}

        {provider === 'bridge' && (
          <>
            <Input
              label="Bridge URL"
              name="bridgeUrl"
              value={settings.bridge.bridgeUrl}
              onChange={(e) => set({ bridge: { bridgeUrl: e.target.value } })}
            />
            <Input
              label="Pairing token"
              name="bridgeToken"
              type="password"
              autoComplete="off"
              hint="Printed by the local server when it starts."
              value={settings.bridge.bridgeToken}
              onChange={(e) => set({ bridge: { bridgeToken: e.target.value } })}
            />
            <div>
              <Select
                label="Agent"
                name="bridgeAgent"
                value={bridgeAgent}
                onChange={(e) => {
                  set({ bridge: { agent: e.target.value } });
                  setAgentModels(null);
                }}
              >
                {BRIDGE_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-neutral-500">{bridgeAgentMeta.tagline}</p>
            </div>

            {bridgeAgentMeta.supportsModelSelection ? (
              <>
                <div className="flex items-end gap-2">
                  <Select
                    label="Model"
                    name="bridgeAgentModel"
                    className="flex-1"
                    value={selectedAgentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                  >
                    <option value="">Default (let the agent choose)</option>
                    {storedAgentModel && !selectedAgentModel && (
                      <option value={storedAgentModel}>{storedAgentModel}</option>
                    )}
                    {(agentModels || []).map((m) =>
                      m.id ? (
                        <option key={m.id} value={m.id}>
                          {m.label || m.id}
                        </option>
                      ) : null
                    )}
                  </Select>
                  <Button variant="secondary" onClick={loadAgentModels} disabled={loadingAgentModels}>
                    {loadingAgentModels && <Spinner />}
                    Load models
                  </Button>
                </div>
                <Input
                  label="Custom model (optional)"
                  name="bridgeAgentModelCustom"
                  value={customAgentModel}
                  onChange={(e) => setAgentModel(e.target.value)}
                  placeholder={bridgeAgentMeta.dynamicModels ? 'provider/model' : 'model-id'}
                  hint="Overrides the dropdown. Leave empty to use “Default”."
                />
              </>
            ) : (
              <p className="text-xs text-neutral-500">
                {bridgeAgentMeta.label} doesn’t accept a model flag here — it uses your signed-in default.
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Using a local agent or Ollama works best when Studio itself runs locally (`npm run dev`).
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={runTest} disabled={testing}>
          {testing && <Spinner />}
          Test connection
        </Button>
        {(output || testing) && (
          <span className="text-xs text-neutral-500">{testing ? 'Streaming…' : 'Response'}</span>
        )}
      </div>

      {(output || testing) && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {output || '…'}
        </pre>
      )}

      {provider === 'ollama' && (error?.code === 'cors' || error?.code === 'local_network_blocked') && (
        <Button
          variant="secondary"
          onClick={() => {
            update({ provider: 'bridge', bridge: { agent: 'ollama' } });
            setError(null);
          }}
        >
          Use Ollama through the local server
        </Button>
      )}

      <ErrorNotice error={error} onDismiss={() => setError(null)} />
    </Card>
  );
}
