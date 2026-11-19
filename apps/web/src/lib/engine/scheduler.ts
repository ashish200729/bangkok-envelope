export type Delivery<R> = {
  tag: number;
  value: R;
  /** False when a newer input is already waiting, so this result is about to be replaced. */
  latest: boolean;
};

export type LatestWins<I> = {
  /** Queues an input; returns its tag. Inputs waiting behind the one in flight are replaced. */
  submit: (input: I) => number;
  /** Drops the waiting input and every result still in flight. */
  cancel: () => void;
  dispose: () => void;
};

type Job<I> = { tag: number; input: I };

/**
 * Runs at most one evaluation at a time and keeps only the newest input waiting behind it.
 * Results never go backwards: one older than a result already delivered is dropped.
 * `run` must not reject.
 */
export function createLatestWins<I, R>(
  run: (input: I) => Promise<R>,
  deliver: (delivery: Delivery<R>) => void,
): LatestWins<I> {
  let nextTag = 0;
  let inFlight = false;
  let pending: Job<I> | null = null;
  let floor = 0;
  let disposed = false;

  function start(job: Job<I>) {
    inFlight = true;
    void run(job.input).then((value) => finish(job.tag, value));
  }

  function finish(tag: number, value: R) {
    inFlight = false;
    if (disposed) return;
    const next = pending;
    pending = null;
    if (tag > floor) {
      floor = tag;
      deliver({ tag, value, latest: next === null });
    }
    if (next) start(next);
  }

  return {
    submit(input) {
      nextTag += 1;
      const job = { tag: nextTag, input };
      if (inFlight) pending = job;
      else start(job);
      return job.tag;
    },
    cancel() {
      pending = null;
      floor = nextTag;
    },
    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
