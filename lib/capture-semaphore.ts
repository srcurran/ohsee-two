/**
 * Process-wide cap on concurrent page captures.
 *
 * Each prod/dev × breakpoint context is one authenticated page-load against
 * the target backend. Without a ceiling, a single multi-page run already fires
 * 6 concurrent loads per page (prod+dev × 3 breakpoints, all sharing one
 * session token), and running several tests in parallel multiplies that — a
 * burst that trips backend rate limits and makes the app render its own
 * "requires internet access" state mid-capture.
 *
 * This counting semaphore bounds how many capture blocks run at once across
 * the whole process (every run shares this one instance), smoothing the burst.
 * Tune MAX_CONCURRENT_CAPTURES if the target backend is more/less tolerant.
 */
const MAX_CONCURRENT_CAPTURES = 4;

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_CAPTURES) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  // Hand the freed slot straight to the next waiter (active count unchanged),
  // or give it back to the pool when nobody is queued.
  if (next) next();
  else active--;
}

/** Run `fn` while holding one capture slot, waiting for a free slot first. */
export async function withCaptureSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
