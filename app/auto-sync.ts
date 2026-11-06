// Coalesce requests without dropping changes received during an active sync.
export function createAutoSync(run: () => Promise<void>, onError: (error: unknown) => void, delay = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let requested = false;
  let stopped = false;
  const request = () => {
    if (stopped) return;
    requested = true;
    if (running || timer) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;
      requested = false;
      running = true;
      try { await run(); }
      catch (error) { onError(error); }
      finally {
        running = false;
        if (requested && !stopped) request();
      }
    }, delay);
  };
  return {
    request,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
