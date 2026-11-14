-- 0007_workspace_files_imported_hash.sql — import ledger for course exercise files (RON-372).
--
-- `skillforce import` attaches `learning/<slug>/exercises/NN-*` files to a lesson's workspace files.
-- To re-import without overwriting learner edits it records the SHA-256 of the content it wrote.
-- NULL means "not written by an import": Studio seeds, learner files and rows that predate 0007.
--
-- D1-compatible: nullable ADD COLUMN with no default, no PRAGMA, no extensions. The IndexedDB and
-- memory adapters store whole objects, so neither needs a store or index for this column; only
-- src/lib/repo/schema.js mirrors it for documentation and parity.

ALTER TABLE workspace_files ADD COLUMN imported_hash TEXT;
