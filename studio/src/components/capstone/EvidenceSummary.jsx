/**
 * EvidenceSummary (PW-03, phase 9) — the facts block that always travels with the literal
 * "self-reported evidence" label.
 *
 * Presentational only: it renders the normalized payload from `lib/capstone-evidence.js`
 * (`stats`, `specs`, `warnings`) and nothing else. Every parsed value — including spec paths, test
 * titles and warning details — is rendered as a React **text child**. There is deliberately no raw
 * markup escape hatch and no Markdown path here: pasted evidence is untrusted data (T-09-24), and
 * the Studio origin holds the BYOK key and the pairing token.
 *
 * The label is the product's honesty guarantee (T-09-18): a green pasted report is never shown as
 * "verified", only as what the learner says they ran.
 */
import { Badge } from '../ui/Badge.jsx';
import { useT } from '../../lib/i18n/index.js';

/** Stat fields shown in the counts row, in report order. */
const COUNT_FIELDS = ['total', 'passed', 'failed', 'skipped', 'flaky'];

/** Most spec files whose test titles are listed; later specs only show their count. */
const MAX_LISTED_SPECS = 10;

/**
 * Localised label for one stat field.
 *
 * The map holds one literal translation call per field so `test/i18n-keys.test.js` sees every key;
 * the field name is never interpolated into a key string.
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string} field
 * @returns {string}
 */
function countLabel(t, field) {
  const labels = {
    total: t('externalEvidence.total'),
    passed: t('externalEvidence.passed'),
    failed: t('externalEvidence.failed'),
    skipped: t('externalEvidence.skipped'),
    flaky: t('externalEvidence.flaky'),
  };
  return labels[field] || field;
}

/**
 * Localised label for one closed-set warning code (literal keys, same reason as `countLabel`).
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string} code
 * @returns {string|null} null for an unknown code — the caller shows the raw code instead
 */
function warningLabel(t, code) {
  const labels = {
    no_tests: t('externalEvidence.warning.no_tests'),
    count_mismatch: t('externalEvidence.warning.count_mismatch'),
    unknown_spec_files: t('externalEvidence.warning.unknown_spec_files'),
    claimed_pass_with_failures: t('externalEvidence.warning.claimed_pass_with_failures'),
    unrecognized_format: t('externalEvidence.warning.unrecognized_format'),
    truncated: t('externalEvidence.warning.truncated'),
  };
  return labels[code] || null;
}

/**
 * Localised Chromium state (D-20): `assumed` is a single unnamed default project, whose default
 * browser is Chromium — shown as "Chromium (assumed)", never as a confirmed run.
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string} chromium 'confirmed' | 'assumed' | 'none'
 * @returns {string}
 */
function chromiumLabel(t, chromium) {
  const labels = {
    confirmed: t('externalEvidence.chromiumConfirmed'),
    assumed: t('externalEvidence.chromiumAssumed'),
    none: t('externalEvidence.chromiumNone'),
  };
  return labels[chromium] || labels.none;
}

/**
 * Human-readable duration: whole milliseconds below one second, one decimal above.
 *
 * @param {unknown} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${value} ms`;
}

/** Tailwind tone for the Chromium badge — never "success": a pasted run is never verified. */
const CHROMIUM_TONE = { confirmed: 'accent', assumed: 'warning', none: 'neutral' };

/**
 * Render the self-reported evidence facts.
 *
 * @param {object} props
 * @param {object|null} props.evidence the normalized payload from `parseEvidence`
 * @param {object|null} [props.facts] deterministic spec-code facts (reserved for the review panel;
 *   not rendered here)
 * @param {boolean} [props.compact] when true, drops the hint, the spec list and the test titles
 *   (used by attempt history)
 * @returns {import('react').ReactElement|null} null when there is no evidence
 */
export function EvidenceSummary({ evidence, compact = false }) {
  const t = useT();
  if (!evidence || typeof evidence !== 'object') return null;

  const stats = evidence.stats && typeof evidence.stats === 'object' ? evidence.stats : {};
  const specs = Array.isArray(evidence.specs) ? evidence.specs : [];
  const warnings = Array.isArray(evidence.warnings) ? evidence.warnings : [];
  const failed = Number(stats.failed) || 0;
  const projects = Array.isArray(stats.projects) ? stats.projects.filter(Boolean) : [];
  const chromium = stats.chromium || 'none';

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{t('externalEvidence.selfReported')}</Badge>
        {!compact && (
          <p className="text-xs text-neutral-500">{t('externalEvidence.selfReportedHint')}</p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">{t('externalEvidence.factsTitle')}</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
          {COUNT_FIELDS.map((field) => (
            <div key={field}>
              <dt className="text-xs text-neutral-500">{countLabel(t, field)}</dt>
              <dd
                className={
                  field === 'failed' && failed > 0
                    ? 'font-semibold text-amber-700 dark:text-amber-300'
                    : 'font-medium'
                }
              >
                {Number(stats[field]) || 0}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
        <p>{t('externalEvidence.durationLabel', { ms: formatDuration(stats.durationMs) })}</p>
        <p>
          {stats.playwrightVersion
            ? t('externalEvidence.versionLabel', { version: stats.playwrightVersion })
            : t('externalEvidence.versionUnknown')}
        </p>
        <p>
          {t('externalEvidence.projectsLabel')}:{' '}
          {projects.length ? projects.join(' · ') : t('externalEvidence.noProjects')}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span>{t('externalEvidence.chromiumLabel')}:</span>
          <Badge tone={CHROMIUM_TONE[chromium] || 'neutral'}>{chromiumLabel(t, chromium)}</Badge>
        </p>
      </div>

      {!compact && (
        <div>
          <p className="text-sm font-medium">{t('externalEvidence.specsTitle')}</p>
          {specs.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">{t('externalEvidence.noSpecs')}</p>
          ) : (
            <ul className="mt-1 space-y-2 text-sm">
              {specs.map((spec, index) => {
                const tests = Array.isArray(spec?.tests) ? spec.tests : [];
                return (
                  <li key={`${String(spec?.file ?? '')}-${index}`}>
                    <p className="font-mono text-xs">{String(spec?.file ?? '')}</p>
                    <p className="text-xs text-neutral-500">
                      {t('externalEvidence.testCount', { count: tests.length })}
                    </p>
                    {index < MAX_LISTED_SPECS && tests.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-600 dark:text-neutral-300">
                        {tests.map((test, testIndex) => (
                          <li key={testIndex}>{String(test?.title ?? '')}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            {t('externalEvidence.formatValue', { format: String(evidence.format || 'unknown') })}
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium">{t('externalEvidence.warningsTitle')}</p>
        {warnings.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">{t('externalEvidence.warningNone')}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning, index) => (
              <li key={`${String(warning?.code ?? '')}-${index}`}>
                <span className="font-medium">
                  {warningLabel(t, warning?.code) || String(warning?.code ?? '')}
                </span>
                {warning?.detail ? (
                  <span className="block text-xs text-neutral-500">{String(warning.detail)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
