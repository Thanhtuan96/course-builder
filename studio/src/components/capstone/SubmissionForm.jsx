/**
 * SubmissionForm (CAP-03) — text/markdown write-up, an optional repo URL, and (for programming
 * courses with saved Workspace files) a "Use my Workspace files" snapshot. Unlimited attempts;
 * the parent appends a new submission row each time, never overwriting.
 *
 * In external mode (`external`) the Workspace snapshot is replaced by the spec code the learner ran
 * in their own project. The spec path/source are controlled by the page (`spec` + `onSpecChange`) so
 * the page derives ONE `submittedFiles` object for both the evidence form's mismatch warnings and the
 * review facts (A3). Studio only reads that code — it never executes it.
 */
import { useState } from 'react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/Input.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';
import { useT } from '../../lib/i18n/index.js';

/**
 * Turn the learner's spec path + source into the files map a submission carries.
 *
 * Pure and defensive: both parts must be non-empty (after trimming the path, and the source must not
 * be whitespace-only), otherwise there is no file to submit.
 *
 * @param {{ path?: string, code?: string }} [spec]
 * @returns {Record<string, string>|null} `{ [path]: code }` or null
 */
export function specFilesFrom({ path = '', code = '' } = {}) {
  const cleanPath = typeof path === 'string' ? path.trim() : '';
  const source = typeof code === 'string' ? code : String(code ?? '');
  if (!cleanPath || !source.trim()) return null;
  return { [cleanPath]: source };
}

export function SubmissionForm({
  programming = false,
  workspaceFiles = [],
  onSubmit,
  busy = false,
  error = null,
  onDismissError,
  external = false,
  spec = { path: '', code: '' },
  onSpecChange = null,
  onDraftChange = null,
  evidenceReady = false,
  evidenceLabel = '',
}) {
  const t = useT();
  const [content, setContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [useFiles, setUseFiles] = useState(false);

  const hasFiles = Array.isArray(workspaceFiles) && workspaceFiles.length > 0;
  const specFiles = external ? specFilesFrom(spec) : null;
  const canSubmit = external
    ? !busy && evidenceReady && (Boolean(specFiles) || content.trim().length > 0)
    : !busy && (content.trim().length > 0 || repoUrl.trim().length > 0 || (useFiles && hasFiles));

  const changeContent = (value) => {
    setContent(value);
    onDraftChange?.(value);
  };

  const submit = () => {
    if (!canSubmit) return;
    const files = external
      ? specFiles
      : useFiles && hasFiles
        ? Object.fromEntries(workspaceFiles.map((f) => [f.path, String(f.content ?? '')]))
        : null;
    onSubmit({ content_md: content.trim(), repo_url: repoUrl.trim() || null, files });
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{t('capstone.submit')}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t('capstone.submitIntro')}</p>
      </div>

      {external && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div>
            <p className="text-sm font-medium">{t('externalEvidence.specCodeTitle')}</p>
            <p className="mt-1 text-xs text-neutral-500">{t('externalEvidence.specCodeHint')}</p>
          </div>
          <Input
            label={t('externalEvidence.specPathLabel')}
            name="capstone-spec-path"
            value={spec.path}
            placeholder="tests/checkout.spec.js"
            onChange={(e) => onSpecChange?.({ ...spec, path: e.target.value })}
          />
          <Textarea
            label={t('externalEvidence.specCodeLabel')}
            name="capstone-spec-code"
            rows={10}
            value={spec.code}
            onChange={(e) => onSpecChange?.({ ...spec, code: e.target.value })}
          />
        </div>
      )}

      <Textarea
        label={t('capstone.submissionLabel')}
        name="capstone-submission"
        rows={6}
        value={content}
        onChange={(e) => changeContent(e.target.value)}
        placeholder={t('capstone.submissionPlaceholder')}
      />

      <Input
        label={t('capstone.repoLabel')}
        name="capstone-repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/you/project"
      />

      {!external && programming && hasFiles && (
        <label className="flex items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <input type="checkbox" className="mt-0.5" checked={useFiles} onChange={(e) => setUseFiles(e.target.checked)} />
          <span>
            {t('capstone.useFiles')}
            <span className="block text-xs text-neutral-500">
              {t('capstone.useFilesHint', {
                count: workspaceFiles.length,
                fileWord: workspaceFiles.length === 1 ? '' : 's',
              })}
            </span>
          </span>
        </label>
      )}

      {external &&
        (evidenceReady ? (
          <p className="text-xs text-neutral-500">{evidenceLabel}</p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t('externalEvidence.submitRequiresEvidence')}
          </p>
        ))}

      {error && <ErrorNotice error={error} onDismiss={onDismissError} />}

      <div className="flex items-center justify-end">
        <Button onClick={submit} disabled={!canSubmit}>
          {busy ? t('capstone.reviewing') : t('capstone.submit')}
        </Button>
      </div>
    </Card>
  );
}
