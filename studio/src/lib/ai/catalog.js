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

export const OPENAI_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', note: 'Direct browser access may be blocked by CORS at times.' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet', note: 'Reliable from the browser.' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', note: 'Fast; they recommend a proxy for keys.' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', note: 'Enable CORS in LM Studio; local sources work best with `npm run dev`.' },
  { id: 'custom', label: 'Custom', baseUrl: '', model: '', note: 'Any OpenAI-compatible endpoint.' },
];

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
export const BRIDGE_DEFAULT_URL = 'http://localhost:3000';
