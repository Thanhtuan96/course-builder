/**
 * DeprecationBanner.jsx - persistent warning above the legacy app shell.
 */

export default function DeprecationBanner() {
  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-700/60 bg-amber-950/80 px-3 py-2 text-center text-xs leading-5 text-amber-100 md:px-5 md:text-sm"
    >
      This legacy web UI is deprecated. Use{' '}
      <a
        href="http://localhost:5180"
        className="font-semibold text-amber-200 underline underline-offset-2 hover:text-white"
      >
        Professor Studio
      </a>{' '}
      instead.
    </div>
  );
}
