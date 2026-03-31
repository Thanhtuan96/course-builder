import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Button } from './ui/button.jsx';

function ToolbarButton({ onClick, active = false, children, title }) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      className="h-8 px-2 text-xs"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

/**
 * Tiptap-based markdown editor for exercises.
 * Edits markdown directly and emits markdown text on change.
 */
export default function ExerciseEditor({ value = '', onChange, className = '' }) {
  const lastMarkdownRef = useRef(value || '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: true,
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
    ],
    content: value || '',
    contentType: 'markdown',
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class:
          'h-full min-h-[320px] w-full overflow-y-auto p-5 text-sm leading-7 text-slate-100 outline-none ' +
          '[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-white ' +
          '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-100 ' +
          '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-200 ' +
          '[&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 ' +
          '[&_li]:my-1.5 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-300 ' +
          '[&_a]:text-indigo-300 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs ' +
          '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-slate-700 [&_pre]:bg-slate-900 [&_pre]:p-4',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const markdown = instance.getMarkdown();
      lastMarkdownRef.current = markdown;
      onChange?.(markdown);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = value || '';
    if (incoming !== lastMarkdownRef.current) {
      editor.commands.setContent(incoming, { contentType: 'markdown' });
      lastMarkdownRef.current = incoming;
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Loading editor...
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex flex-wrap gap-1 border-b border-slate-800 bg-slate-900/60 p-2">
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          Code
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          List
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          Block
        </ToolbarButton>
        <ToolbarButton
          title="Horizontal rule"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          ---
        </ToolbarButton>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-slate-950">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

