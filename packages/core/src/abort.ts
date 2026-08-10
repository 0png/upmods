const CANCELLED_MESSAGE = 'Operation cancelled. No pending changes were applied.';

export class OperationCancelledError extends Error {
  readonly code = 'UPMODS_CANCELLED';

  constructor(message = CANCELLED_MESSAGE, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AbortError';
  }
}

export function isOperationCancelledError(error: unknown): boolean {
  if (error instanceof OperationCancelledError) return true;
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown };
  return value.name === 'AbortError'
    || value.code === 'ABORT_ERR'
    || value.code === 'UND_ERR_ABORTED'
    || value.code === 'UPMODS_CANCELLED';
}

export function cancelledError(cause?: unknown): OperationCancelledError {
  return cause === undefined
    ? new OperationCancelledError()
    : new OperationCancelledError(CANCELLED_MESSAGE, { cause });
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError(signal.reason);
}

export async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(cancelledError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function normalizeCancellation(error: unknown, signal?: AbortSignal): unknown {
  return signal?.aborted || isOperationCancelledError(error) ? cancelledError(error) : error;
}
