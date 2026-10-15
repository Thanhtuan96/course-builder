import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  baseRemarkPlugins,
  baseRehypePlugins,
  isMermaidClassName,
  hasMath,
  loadMathPlugins,
} from '../../lib/markdown.js';

/**
 * Lazy Mermaid renderer: `mermaid` is only imported when a ```mermaid block is actually present,
 * so the main bundle stays small (Vite keeps it in a separate chunk). Render failures fall back
 * to showing the raw code block. `securityLevel: 'strict'` sanitises labels.
 */
function MermaidDiagram({ code }) {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (alive) setSvg(rendered);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed || !svg) {
    return (
      <pre>
        <code className="language-mermaid">{code}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function CodeRenderer({ className, children, ...props }) {
  if (isMermaidClassName(className)) return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function PreRenderer({ children }) {
  const child = Array.isArray(children) ? children[0] : children;
  if (child?.props?.className && isMermaidClassName(child.props.className)) return child;
  return <pre>{children}</pre>;
}

/**
 * Safe Markdown (LESSON-03): no rehype-raw, so raw HTML is escaped and `javascript:` URLs are
 * dropped by the default url transform. External links open in a new tab. Math plugins + katex
 * CSS are loaded on demand only when the source contains math.
 */
export function Markdown({ children, className = '' }) {
  const source = String(children || '');
  const needsMath = useMemo(() => hasMath(source), [source]);
  const [mathPlugins, setMathPlugins] = useState(null);

  useEffect(() => {
    if (!needsMath) {
      setMathPlugins(null);
      return undefined;
    }
    let alive = true;
    loadMathPlugins()
      .then((plugins) => alive && setMathPlugins(plugins))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needsMath]);

  const remarkPlugins = useMemo(
    () => [...baseRemarkPlugins, ...(mathPlugins?.remarkPlugins || [])],
    [mathPlugins]
  );
  const rehypePlugins = useMemo(
    () => [...baseRehypePlugins, ...(mathPlugins?.rehypePlugins || [])],
    [mathPlugins]
  );

  return (
    <div className={`prose-lesson ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          code: CodeRenderer,
          pre: PreRenderer,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
