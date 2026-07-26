/** Resolves after `ms`, rejecting with an `AbortError` if `signal` aborts first. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Throws the signal's abort reason if it has aborted. */
export function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}
