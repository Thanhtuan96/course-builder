/**
 * SubmissionForm (CAP-03) — text/markdown write-up, an optional repo URL, and (for programming
 * courses with saved Workspace files) a "Use my Workspace files" snapshot. Unlimited attempts;
 * the parent appends a new submission row each time, never overwriting.
 */
import { useState } from 'react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/Input.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

export function SubmissionForm({
  copy = {},
  programming = false,
  workspaceFiles = [],
  onSubmit,
  busy = false,
  error = null,
  onDismissError,
}) {
  const [content, setContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [useFiles, setUseFiles] = useState(false);

  const hasFiles = Array.isArray(workspaceFiles) && workspaceFiles.length > 0;
  const canSubmit = !busy && (content.trim().length > 0 || repoUrl.trim().length > 0 || (useFiles && hasFiles));

  const submit = () => {
    if (!canSubmit) return;
    const files = useFiles && hasFiles
      ? Object.fromEntries(workspaceFiles.map((f) => [f.path, String(f.content ?? '')]))
      : null;
    onSubmit({ content_md: content.trim(), repo_url: repoUrl.trim() || null, files });
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{copy.submit || 'Submit for review'}</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Share what you built. Submit as many times as you like — every attempt and its review is kept.
        </p>
      </div>

      <Textarea
        label="Your submission"
        name="capstone-submission"
        rows={6}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Describe what you shipped, paste key excerpts, or link to your write-up…"
      />

      <Input
        label="Repo or artifact link (optional)"
        name="capstone-repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/you/project"
      />

      {programming && hasFiles && (
        <label className="flex items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <input type="checkbox" className="mt-0.5" checked={useFiles} onChange={(e) => setUseFiles(e.target.checked)} />
          <span>
            Use my Workspace files
            <span className="block text-xs text-neutral-500">
              Attaches {workspaceFiles.length} saved file{workspaceFiles.length === 1 ? '' : 's'} so the capstone tests run against your code.
            </span>
          </span>
        </label>
      )}

      {error && <ErrorNotice error={error} onDismiss={onDismissError} />}

      <div className="flex items-center justify-end">
        <Button onClick={submit} disabled={!canSubmit}>
          {busy ? 'Reviewing…' : copy.submit || 'Submit for review'}
        </Button>
      </div>
    </Card>
  );
}
