/**
 * CodeMirror 6 editor (CODE-01) — loaded lazily by CodeWorkspace so the editor + language
 * grammars stay out of the main bundle. Default export is what `React.lazy` expects.
 */
import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';

const EXTENSIONS = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  python: () => python(),
  sql: () => sql(),
  html: () => html(),
  css: () => css(),
  go: () => go(),
  java: () => java(),
  rust: () => rust(),
};

export default function Editor({ value, language, onChange, dark = false, readOnly = false }) {
  const extensions = useMemo(() => {
    const build = EXTENSIONS[language];
    return build ? [build()] : [];
  }, [language]);

  return (
    <CodeMirror
      value={value}
      theme={dark ? 'dark' : 'light'}
      height="22rem"
      readOnly={readOnly}
      extensions={extensions}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
      onChange={(next) => onChange?.(next)}
      className="overflow-hidden rounded-lg border border-neutral-200 text-sm dark:border-neutral-800"
    />
  );
}
