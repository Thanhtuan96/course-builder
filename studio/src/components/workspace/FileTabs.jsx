/**
 * File tab strip for the workspace (CODE-01) — horizontally scrollable on phones.
 * Double-click a tab to rename it.
 */
import { useT } from '../../lib/i18n/index.js';

export function FileTabs({ files, activePath, onSelect, onAdd, onRename, onDelete }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1 overflow-x-auto pb-1" role="tablist" aria-label={t('workspace.title')}>
        {files.map((file) => {
          const active = file.path === activePath;
          return (
            <div
              key={file.path}
              className={`group flex shrink-0 items-center gap-1 rounded-t-lg border-b-2 px-2.5 py-1.5 text-sm ${
                active
                  ? 'border-indigo-500 bg-white font-medium text-indigo-700 dark:bg-neutral-900 dark:text-indigo-300'
                  : 'border-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(file.path)}
                onDoubleClick={() => onRename(file.path)}
                title={`${file.path} — double-click to rename`}
                className="whitespace-nowrap"
              >
                {file.path}
              </button>
              {files.length > 1 && (
                <button
                  type="button"
                  aria-label={t('workspace.deleteFile', { path: file.path })}
                  onClick={() => onDelete(file.path)}
                  className="rounded px-1 text-xs text-neutral-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          aria-label={t('workspace.addFile')}
        >
          {t('workspace.addFile')}
        </button>
      </div>
    </div>
  );
}
