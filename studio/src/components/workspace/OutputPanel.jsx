/**
 * Output panel for the workspace (CODE-02, CODE-03) — stdout, stderr, per-check pass/fail,
 * SQL result tables and a sandboxed HTML preview.
 */
import { Badge } from '../ui/Badge.jsx';

function CheckList({ checks }) {
  if (!checks?.length) return null;
  const passed = checks.filter((c) => c.passed).length;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        Checks <span className={passed === checks.length ? 'text-green-600' : 'text-amber-600'}>{passed}/{checks.length} passed</span>
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
  if (!output) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        Press <span className="font-medium">Run</span> to execute your code, or <span className="font-medium">Check</span> to run the exercise self-checks.
        {runnerInfo?.kind === 'local' && !runnerInfo.ready && (
          <span className="mt-1 block text-amber-600 dark:text-amber-400">
            {runnerInfo.command ? `Needs the local server with \`${runnerInfo.command}\` on your PATH.` : 'Needs the local server.'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={output.runner === 'local' ? 'accent' : 'neutral'}>
          {output.runner === 'local' ? 'Local server' : 'Browser'}
        </Badge>
        {typeof output.exitCode === 'number' && (
          <Badge tone={output.exitCode === 0 ? 'success' : 'warning'}>exit {output.exitCode}</Badge>
        )}
        {typeof output.durationMs === 'number' && <span className="text-xs text-neutral-500">{output.durationMs} ms</span>}
        {output.timedOut && <Badge tone="warning">timed out</Badge>}
        {output.outputTruncated && <Badge tone="warning">output truncated</Badge>}
        {output.aborted && <Badge tone="neutral">stopped</Badge>}
      </div>

      {output.statusText && <p className="text-xs text-neutral-500">{output.statusText}</p>}

      <CheckList checks={output.checks} />

      {output.stdout ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">stdout</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-3 font-mono text-xs dark:bg-neutral-950">{output.stdout}</pre>
        </div>
      ) : null}

      {output.stderr ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">stderr</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-red-50 p-3 font-mono text-xs text-red-800 dark:bg-red-500/10 dark:text-red-200">
            {output.stderr}
          </pre>
        </div>
      ) : null}

      {output.rows?.columns?.length ? <RowsTable columns={output.rows.columns} rows={output.rows.rows || []} /> : null}

      {output.preview?.html ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Preview</p>
          <iframe
            title="Workspace preview"
            sandbox="allow-scripts"
            srcDoc={output.preview.html}
            className="h-64 w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
          />
        </div>
      ) : null}

      {!output.stdout && !output.stderr && !output.checks?.length && !output.rows?.columns?.length && !output.preview?.html && (
        <p className="text-neutral-500">No output.</p>
      )}
    </div>
  );
}
