/**
 * Shown instead of the editor when the exercise skeleton is in a language no runner executes.
 * The learner copies the skeleton into their own terminal; nothing is seeded or run.
 */
import { useState } from 'react';
import { useT } from '../../lib/i18n/index.js';
import { Button } from '../ui/Button.jsx';

/** @param {{ info: string, content: string }} skeleton */
export function UnsupportedSkeletonNotice({ skeleton }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const label = skeleton.info ? skeleton.info.charAt(0).toUpperCase() + skeleton.info.slice(1) : skeleton.info;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(skeleton.content);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <p>{t('workspace.unsupportedNotice', { info: label })}</p>
      <pre className="max-h-80 overflow-auto rounded bg-white/70 p-2 text-xs dark:bg-neutral-900/70">
        <code>{skeleton.content}</code>
      </pre>
      <Button size="sm" variant="secondary" onClick={copy}>
        {copied ? t('workspace.unsupportedCopied') : t('workspace.unsupportedCopy')}
      </Button>
    </div>
  );
}
