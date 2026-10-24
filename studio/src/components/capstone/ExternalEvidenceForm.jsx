/**
 * ExternalEvidenceForm (PW-03, phase 9) — "Verify externally".
 *
 * The learner runs Playwright in **their own** terminal and brings the result back. Studio never
 * runs `npm`, `npx` or Playwright (PW-05): the commands below are text to copy, and the paste/upload
 * is data to read — nothing here executes, evaluates, imports or fetches evidence.
 *
 * The component is controlled and stateless about evidence: it re-derives the parsed payload from
 * `result.text` on every render through `evaluateEvidenceInput()`, so the parent and the form can
 * never disagree about what the paste says. `onChange` is the only way evidence moves upward, and a
 * submission is only valid when `result.confirmed === true`.
 *
 * Contract handed to the Capstone page (09-06):
 *   result = { text: string, evidence: object|null, confirmed: boolean }
 *   onChange(nextResult)
 *   submittedFiles: Record<path, content>|null   writeup: string
 */
import { useEffect, useRef, useState } from 'react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Textarea } from '../ui/Input.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';
import { useT } from '../../lib/i18n/index.js';
import {
  evidenceWarnings,
  parseEvidence,
  summarizeEvidenceFacts,
} from '../../lib/capstone-evidence.js';
import { EvidenceSummary } from './EvidenceSummary.jsx';

/** Largest file the form will read; bigger uploads are rejected before `FileReader` runs (T-09-25). */
export const MAX_UPLOAD_BYTES = 1_000_000;

/** How long the copy confirmation stays on screen (ms). */
const COPIED_MS = 2_000;

/**
 * The commands the learner copies into their own terminal.
 *
 * Deliberately closed and frozen: `--reporter=html`, blob reports, `--trace` and screenshots are
 * never suggested (Out of Scope, and they can carry app secrets), and `list,json` on stdout is not
 * offered because the two reporters interleave and a naive extraction then fails.
 */
export const EVIDENCE_COMMANDS = Object.freeze([
  Object.freeze({
    id: 'json_file',
    label: 'JSON report to a file',
    command:
      'PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=json --project=chromium',
  }),
  Object.freeze({
    id: 'json_stdout',
    label: 'JSON report on stdout',
    command: 'npx playwright test --reporter=json --project=chromium',
  }),
  Object.freeze({
    id: 'list',
    label: 'List reporter output',
    command: 'npx playwright test --reporter=list --project=chromium',
  }),
]);

/**
 * Pure parse decision for a paste — unit-testable without a DOM.
 *
 * @param {{ text?: string, submittedFiles?: Record<string, string>|null, writeup?: string }} [input]
 * @returns {{ evidence: object|null, summary: object|null }} both null for empty/whitespace text
 */
export function evaluateEvidenceInput({ text = '', submittedFiles = null, writeup = '' } = {}) {
  const body = typeof text === 'string' ? text : String(text ?? '');
  if (!body.trim()) return { evidence: null, summary: null };
  const parsed = parseEvidence(body);
  const evidence = {
    ...parsed,
    warnings: evidenceWarnings(parsed, { files: submittedFiles, contentMd: writeup }),
  };
  return { evidence, summary: summarizeEvidenceFacts(evidence, null) };
}

/**
 * Pure upload-size guard (T-09-25).
 *
 * @param {{ size?: number|string, maxBytes?: number }} [input]
 * @returns {'uploadTooLarge'|null} null when the file may be read (the boundary is `>`, not `>=`)
 */
export function uploadRejection({ size = 0, maxBytes = MAX_UPLOAD_BYTES } = {}) {
  return Number(size) > Number(maxBytes) ? 'uploadTooLarge' : null;
}

/**
 * Localised command caption (literal keys so the i18n key scanner sees every one).
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string} id
 * @returns {string}
 */
function commandLabel(t, id) {
  const labels = {
    json_file: t('externalEvidence.command.json_file'),
    json_stdout: t('externalEvidence.command.json_stdout'),
    list: t('externalEvidence.command.list'),
  };
  return labels[id] || id;
}

/**
 * Localised upload-error caption.
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string|null} code
 * @returns {string|null}
 */
function uploadErrorLabel(t, code) {
  const labels = {
    uploadTooLarge: t('externalEvidence.uploadTooLarge'),
    uploadUnreadable: t('externalEvidence.uploadUnreadable'),
  };
  return labels[code] || null;
}

/**
 * Clipboard fallback for browsers without `navigator.clipboard` (or without permission).
 *
 * @param {string} text
 * @returns {boolean} whether the copy succeeded
 */
function legacyCopy(text) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  let area = null;
  try {
    area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    return Boolean(ok);
  } catch {
    return false;
  } finally {
    if (area && area.parentNode) area.parentNode.removeChild(area);
  }
}

/**
 * The evidence capture surface: copyable command, paste or upload, live facts, confirmation gate.
 *
 * @param {object} props
 * @param {{ text?: string, evidence?: object|null, confirmed?: boolean }} [props.result]
 * @param {(next: { text: string, evidence: object|null, confirmed: boolean }) => void} [props.onChange]
 * @param {Record<string, string>|null} [props.submittedFiles] code the learner submitted (for
 *   `unknown_spec_files`)
 * @param {string} [props.writeup] the current write-up (for `claimed_pass_with_failures`)
 * @param {boolean} [props.busy]
 * @param {object|null} [props.error]
 * @param {() => void} [props.onDismissError]
 * @returns {import('react').ReactElement}
 */
export function ExternalEvidenceForm({
  result = { text: '', evidence: null, confirmed: false },
  onChange,
  submittedFiles = null,
  writeup = '',
  busy = false,
  error = null,
  onDismissError,
}) {
  const t = useT();
  const [copiedId, setCopiedId] = useState(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const text = typeof result?.text === 'string' ? result.text : '';
  const confirmed = result?.confirmed === true;
  const parsed = evaluateEvidenceInput({ text, submittedFiles, writeup });
  const evidence = text.trim() ? parsed.evidence : null;
  const unrecognized = Boolean(evidence && evidence.format === 'unknown');

  /**
   * Emit the next controlled result. `confirmed` resets on every text change: the learner confirms
   * the facts they actually saw, never a parse that replaced them.
   *
   * @param {string} nextText
   * @param {boolean} nextConfirmed
   */
  const emit = (nextText, nextConfirmed) => {
    const next = evaluateEvidenceInput({ text: nextText, submittedFiles, writeup });
    onChange?.({
      text: nextText,
      evidence: nextText.trim() ? next.evidence : null,
      confirmed: nextText.trim() ? nextConfirmed === true : false,
    });
  };

  const copy = async (entry) => {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(entry.command);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(entry.command);
    if (!ok) {
      setCopyFailed(true);
      setCopiedId(null);
      return;
    }
    setCopyFailed(false);
    setCopiedId(entry.id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedId(null), COPIED_MS);
  };

  const clear = () => {
    setUploadName('');
    setUploadError(null);
    setCopyFailed(false);
    if (fileRef.current) fileRef.current.value = '';
    onChange?.({ text: '', evidence: null, confirmed: false });
  };

  const onFile = (event) => {
    const file = event.target?.files?.[0] || null;
    setUploadError(null);
    if (!file) {
      setUploadName('');
      return;
    }
    setUploadName(String(file.name ?? ''));
    const rejection = uploadRejection({ size: file.size });
    if (rejection) {
      setUploadError(rejection);
      return;
    }
    if (typeof FileReader === 'undefined') {
      setUploadError('uploadUnreadable');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadError(null);
      emit(String(reader.result ?? ''), false);
    };
    reader.onerror = () => setUploadError('uploadUnreadable');
    reader.readAsText(file);
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t('externalEvidence.title')}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t('externalEvidence.intro')}</p>
      </div>

      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm font-medium">{t('externalEvidence.commandTitle')}</p>
        <ul className="mt-2 space-y-2">
          {EVIDENCE_COMMANDS.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  {commandLabel(t, entry.id)}
                </p>
                <code className="mt-1 block overflow-x-auto rounded bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-800">
                  {entry.command}
                </code>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => copy(entry)}
                aria-label={`${t('externalEvidence.copy')}: ${entry.command}`}
              >
                {copiedId === entry.id ? t('externalEvidence.copied') : t('externalEvidence.copy')}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">{t('externalEvidence.commandWhyChromium')}</p>
        {copyFailed && <p className="mt-1 text-xs text-red-600">{t('externalEvidence.copyFailed')}</p>}
      </div>

      <Textarea
        label={t('externalEvidence.pasteLabel')}
        name="external-evidence-paste"
        rows={6}
        value={text}
        placeholder={t('externalEvidence.pastePlaceholder')}
        onChange={(event) => {
          setUploadName('');
          emit(event.target.value, false);
        }}
      />

      <div>
        <label
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          htmlFor="external-evidence-file"
        >
          {t('externalEvidence.uploadLabel')}
        </label>
        <input
          id="external-evidence-file"
          ref={fileRef}
          type="file"
          accept=".json,.txt"
          disabled={busy}
          onChange={onFile}
          className="mt-1 block w-full text-sm text-neutral-700 dark:text-neutral-300"
        />
        <span className="mt-1 block text-xs text-neutral-500">{t('externalEvidence.uploadHint')}</span>
        {uploadName && (
          <p className="mt-1 text-xs text-neutral-500">{uploadName}</p>
        )}
        {uploadError && (
          <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {uploadErrorLabel(t, uploadError)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" disabled={busy} onClick={clear}>
          {t('externalEvidence.clear')}
        </Button>
      </div>

      {text.trim() ? (
        <div className="space-y-2">
          <EvidenceSummary evidence={evidence} />
          {unrecognized && (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
              {t('externalEvidence.unrecognized')}
            </p>
          )}
        </div>
      ) : null}

      <label className="flex items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          disabled={busy || !evidence}
          onChange={(event) => emit(text, event.target.checked)}
        />
        <span>
          {t('externalEvidence.confirmLabel')}
          <span className="block text-xs text-neutral-500">{t('externalEvidence.confirmHint')}</span>
        </span>
      </label>
      {evidence && !confirmed && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('externalEvidence.confirmRequired')}
        </p>
      )}

      {error && <ErrorNotice error={error} onDismiss={onDismissError} />}
    </Card>
  );
}
