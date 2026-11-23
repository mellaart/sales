// Serialize saves so a slower request cannot overwrite a newer edit.
export function createSaveQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(save: () => Promise<T>): Promise<T> {
    const next = pending.then(save);
    pending = next.catch(() => undefined);
    return next;
  };
}
