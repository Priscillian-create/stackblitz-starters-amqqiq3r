export class DatabaseConnectionError extends Error {
  constructor() {
    super('Database connection interrupted. Changes remain queued; automatic sync will retry.');
    this.name = 'DatabaseConnectionError';
  }
}

// Shared by uploads and downloads so no request source bypasses the cooldown.
export class SyncBackoff {
  private failures = 0;
  private retryAt = 0;
  fail(now = Date.now()) {
    if (now < this.retryAt) return;
    this.failures = Math.min(this.failures + 1, 5);
    this.retryAt = now + Math.min(5000 * 2 ** (this.failures - 1), 60000);
  }
  remaining(now = Date.now()) { return Math.max(0, this.retryAt - now); }
  reset() { this.failures = 0; this.retryAt = 0; }
}
