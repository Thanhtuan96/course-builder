/**
 * BlockedAdapter — installed when the learner chose SQLite but the local server is unreachable
 * (STORE-02). Every operation rejects, so Studio can never silently fall back to IndexedDB in that
 * state: no reads, no writes, no toggling stores behind the learner's back.
 *
 * The repository (`repo/index.js`) treats this like any other StorageAdapter; pages see a rejected
 * promise rather than a different store.
 */

/** Error raised by every BlockedAdapter operation. */
export class StorageUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {{ kind?: string, code?: string, path?: string, cause?: Error }} [info]
   */
  constructor(message, { kind = 'sqlite', code = 'storage_unavailable', path = '', cause } = {}) {
    super(message);
    this.name = 'StorageUnavailableError';
    this.kind = kind;
    this.code = code;
    this.path = path;
    if (cause) this.cause = cause;
  }
}

/**
 * @param {{ kind?: string, reason?: string, path?: string, cause?: Error }} [opts]
 * @returns {import('./remote-adapter.js').StorageAdapter & { label: string }}
 */
export function createBlockedAdapter({ kind = 'sqlite', reason = '', path = '', cause } = {}) {
  const message =
    reason ||
    (kind === 'sqlite'
      ? 'SQLite storage is unavailable — the local server is not running.'
      : 'Storage is unavailable.');
  const fail = () => {
    throw new StorageUnavailableError(message, { kind, path, cause });
  };
  return {
    label: 'blocked',
    async get() {
      fail();
    },
    async put() {
      fail();
    },
    async putMany() {
      fail();
    },
    async list() {
      fail();
    },
    async softDelete() {
      fail();
    },
    async exportAll() {
      fail();
    },
    async importAll() {
      fail();
    },
    async clearAll() {
      fail();
    },
    async info() {
      return { kind: 'blocked', persistent: false, blockedKind: kind, reason: message, path };
    },
  };
}
