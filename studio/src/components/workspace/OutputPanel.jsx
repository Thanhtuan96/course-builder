/**
 * Output panel for the workspace (CODE-02, CODE-03) — stdout, stderr, per-check pass/fail,
 * SQL result tables and a sandboxed HTML preview.
 */
import { useEffect, useRef } from 'react';
import { Badge } from '../ui/Badge.jsx';
import { useT } from '../../lib/i18n/index.js';

function CheckList({ checks }) {
  const t = useT();
  if (!checks?.length) return null;
  const passed = checks.filter((c) => c.passed).length;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {t('workspace.checks')}{' '}
        <span className={passed === checks.length ? 'text-green-600' : 'text-amber-600'}>
          {t('workspace.passedOf', { passed, total: checks.length })}
        </span>
      </p>
      <ul className="space-y-1">
        {checks.map((check, i) => (
          <li key={`${check.name}-${i}`} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={check.passed ? 'text-green-600' : 'text-red-600'}>
              {check.passed ? '✓' : '✗'}
            </span>
            <span className={check.passed ? 'text-neutral-700 dark:text-neutral-200' : 'text-red-700 dark:text-red-300'}>
              {check.name}
              {!check.passed && check.message ? <span className="block text-xs opacity-80">{check.message}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HtmlPreview({ html }) {
  const t = useT();
  const frameRef = useRef(null);

  const post = () => {
    frameRef.current?.contentWindow?.postMessage({ type: 'preview-html', html }, '*');
  };

  useEffect(() => {
    post();
  }, [html]);

  return (
    <iframe
      key={html}
      ref={frameRef}
      title={t('workspace.preview')}
      sandbox="allow-scripts"
      src="./preview.html"
      onLoad={post}
      className="h-64 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
    />
  );
}

function RowsTable({ columns, rows }) {
  if (!columns?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left dark:border-neutral-800 dark:bg-neutral-800">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  {row[c] === null || row[c] === undefined ? 'NULL' : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * @param {{ output: object|null, runnerInfo?: object|null }} props
 */
export function OutputPanel({ output, runnerInfo = null }) {
  const t = useT();
  if (!output) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        {t('workspace.pressRun')} <span className="font-medium">{t('workspace.run')}</span> {t('workspace.pressRunMid')}{' '}
        <span className="font-medium">{t('workspace.checkButton')}</span> {t('workspace.pressRunMid2')}
        {runnerInfo?.kind === 'local' && !runnerInfo.ready && (
          <span className="mt-1 block text-amber-600 dark:text-amber-400">
            {runnerInfo.command ? t('workspace.needsCommand', { command: runnerInfo.command }) : t('workspace.needsServer')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={output.runner === 'local' ? 'accent' : 'neutral'}>
          {output.runner === 'local' ? t('workspace.localServer') : t('workspace.browser')}
        </Badge>
        {typeof output.exitCode === 'number' && (
          <Badge tone={output.exitCode === 0 ? 'success' : 'warning'}>{t('workspace.exit', { code: output.exitCode })}</Badge>
        )}
        {typeof output.durationMs === 'number' && <span className="text-xs text-neutral-500">{output.durationMs} ms</span>}
        {output.timedOut && <Badge tone="warning">{t('workspace.timedOut')}</Badge>}
        {output.outputTruncated && <Badge tone="warning">{t('workspace.outputTruncated')}</Badge>}
        {output.aborted && <Badge tone="neutral">{t('workspace.stopped')}</Badge>}
      </div>

      {output.statusText && <p className="text-xs text-neutral-500">{output.statusText}</p>}

      <CheckList checks={output.checks} />

      {output.stdout ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{t('workspace.stdout')}</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-3 font-mono text-xs dark:bg-neutral-950">{output.stdout}</pre>
        </div>
      ) : null}

      {output.stderr ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{t('workspace.stderr')}</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-red-50 p-3 font-mono text-xs text-red-800 dark:bg-red-500/10 dark:text-red-200">
            {output.stderr}
          </pre>
        </div>
      ) : null}

      {output.rows?.columns?.length ? <RowsTable columns={output.rows.columns} rows={output.rows.rows || []} /> : null}

      {output.preview?.html ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{t('workspace.preview')}</p>
          <HtmlPreview html={output.preview.html} />
        </div>
      ) : null}

      {!output.stdout && !output.stderr && !output.checks?.length && !output.rows?.columns?.length && !output.preview?.html && (
        <p className="text-neutral-500">{t('workspace.noOutput')}</p>
      )}
    </div>
  );
}
