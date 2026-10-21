/**
 * Ask the OS for an unused loopback port. The socket is closed before returning, so a test can bind
 * it immediately; the small race is acceptable for entry-point smoke tests.
 */
import { createServer } from 'net';

/**
 * @returns {Promise<number>}
 */
export function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}
