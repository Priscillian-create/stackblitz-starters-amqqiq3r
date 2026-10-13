export async function readWithTimeout<T>(
  read: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal | null,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("Download timed out. Existing records are kept; sync will retry.", "TimeoutError")), timeoutMs);
  try {
    // Includes response-body parsing, not just receipt of HTTP headers.
    return await read(controller.signal);
  } finally {
    clearTimeout(timeout);
    parent?.removeEventListener("abort", cancel);
  }
}
