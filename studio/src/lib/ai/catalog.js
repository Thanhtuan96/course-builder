/**
 * Lightweight provider metadata: model lists and endpoint presets with NO heavy dependencies.
 * Keeping this separate from the adapter modules is what lets `getProvider()` load the
 * Anthropic SDK via dynamic import instead of pulling it into the main bundle.
 */

/** @type {{ id: string, label: string, advanced?: boolean }[]} */
export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (advanced, premium)', advanced: true },
];

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

/** True when `id` is a model the Anthropic SDK accepts (curated ids or a `claude-` prefix). */
export function isAnthropicModelId(id) {
  const value = typeof id === 'string' ? id.trim() : '';
  if (!value) return false;
  if (ANTHROPIC_MODELS.some((m) => m.id === value)) return true;
  return /^claude-/.test(value);
}

export const OPENAI_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', note: 'Direct browser access may be blocked by CORS at times.' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', note: 'Reliable from the browser.' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', note: 'Fast; they recommend a proxy for keys.' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', note: 'Enable CORS in LM Studio; local sources work best with `npm run dev`.' },
  { id: 'custom', label: 'Custom', baseUrl: '', model: '', note: 'Any OpenAI-compatible endpoint.' },
];

/** Identifies the OpenRouter preset from its base URL (used for its extra headers). */
export function presetForBaseUrl(baseUrl = '') {
  const url = String(baseUrl).toLowerCase();
  if (url.includes('openrouter.ai')) return 'openrouter';
  return OPENAI_PRESETS.find((p) => p.baseUrl && p.baseUrl.toLowerCase() === url)?.id || '';
}

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
export const BRIDGE_DEFAULT_URL = 'http://localhost:3000';
export const DEFAULT_BRIDGE_AGENT = 'claude';

/**
 * The six local agent CLIs the bridge can drive. `binaries` lists every executable name accepted
 * for the agent (Cursor renamed `cursor-agent` to `agent`). `models` is a curated fallback used
 * when the CLI cannot enumerate its own list; `dynamicModels` marks agents whose list is probed at
 * runtime (opencode/cursor/ollama). An empty model id `''` means "Default" — omit `--model`.
 *
 * @type {{ id:string, label:string, tagline:string, binaries:string[], supportsModelSelection:boolean,
 *          models:{id:string,label:string}[], dynamicModels?:boolean }[]}
 */
export const BRIDGE_AGENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    tagline: 'Anthropic’s CLI, using your existing subscription.',
    binaries: ['claude'],
    supportsModelSelection: false,
    models: [],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    tagline: 'Open-source coding agent with many providers.',
    binaries: ['opencode'],
    supportsModelSelection: true,
    dynamicModels: true,
    models: [],
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    tagline: 'Cursor’s `agent` / `cursor-agent` binary.',
    binaries: ['agent', 'cursor-agent'],
    supportsModelSelection: true,
    dynamicModels: true,
    models: [
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
      { id: 'sonnet-4', label: 'sonnet-4' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    tagline: 'Google’s Gemini CLI (read-only plan mode).',
    binaries: ['gemini'],
    supportsModelSelection: true,
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    tagline: 'Google Antigravity CLI (`agy`), read-only plan mode.',
    binaries: ['agy'],
    supportsModelSelection: true,
    models: [
      { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
      { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
      { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
      { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
      { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
      { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (via server)',
    tagline: 'Local models routed through the Studio server.',
    binaries: ['ollama'],
    supportsModelSelection: true,
    dynamicModels: true,
    models: [],
  },
];

export const BRIDGE_AGENT_IDS = BRIDGE_AGENTS.map((a) => a.id);

/** Look up one bridge agent's metadata. @param {string} id */
export function bridgeAgent(id) {
  return BRIDGE_AGENTS.find((a) => a.id === id) || null;
}

/**
 * Whether `model` is plausible for `agent` (used by the legacy-settings migration to avoid leaking
 * an Anthropic model into the bridge). An empty model always means "Default" and is valid.
 * @param {string} agent
 * @param {string} model
 */
export function isValidAgentModel(agent, model) {
  const value = typeof model === 'string' ? model.trim() : '';
  if (!value) return true;
  switch (agent) {
    case 'opencode':
      // OpenCode expects `provider/model`.
      return value.includes('/');
    case 'cursor':
      return true; // cursor accepts many ids/parameterised forms
    case 'gemini':
      return /^gemini-/.test(value);
    case 'antigravity':
      return bridgeAgent('antigravity').models.some((m) => m.id === value) || /^(gemini|claude|gpt)-/.test(value);
    case 'claude':
      return false; // Claude Code has no --model in this bridge
    case 'ollama':
      return true;
    default:
      return false;
  }
}
