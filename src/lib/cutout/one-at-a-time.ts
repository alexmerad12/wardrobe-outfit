// A queue that runs its tasks one after another, in arrival order. A task
// that throws doesn't stop the ones behind it. Each task is told how long it
// waited for its turn, so the logs can tell queueing from real work.
export function oneAtATime() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: (waitedMs: number) => Promise<T>): Promise<T> {
    const queuedAt = performance.now();
    const run = () => task(Math.round(performance.now() - queuedAt));
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };
}
