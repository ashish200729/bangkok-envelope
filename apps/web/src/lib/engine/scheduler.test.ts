import { describe, expect, it } from "vitest";
import { createLatestWins, type Delivery } from "./scheduler";

function deferredRunner() {
  const calls: { input: number; resolve: (value: string) => void }[] = [];
  const run = (input: number) =>
    new Promise<string>((resolve) => {
      calls.push({ input, resolve });
    });
  return { run, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLatestWins", () => {
  it("runs one evaluation at a time and keeps only the newest waiting input", async () => {
    const { run, calls } = deferredRunner();
    const delivered: Delivery<string>[] = [];
    const scheduler = createLatestWins(run, (d) => delivered.push(d));

    scheduler.submit(1);
    scheduler.submit(2);
    scheduler.submit(3);
    expect(calls.map((c) => c.input)).toEqual([1]);

    calls[0]?.resolve("r1");
    await flush();
    expect(calls.map((c) => c.input)).toEqual([1, 3]);
    expect(delivered).toEqual([{ tag: 1, value: "r1", latest: false }]);

    calls[1]?.resolve("r3");
    await flush();
    expect(delivered.at(-1)).toEqual({ tag: 3, value: "r3", latest: true });
    expect(calls).toHaveLength(2);
  });

  it("marks a result latest when nothing newer is waiting", async () => {
    const { run, calls } = deferredRunner();
    const delivered: Delivery<string>[] = [];
    const scheduler = createLatestWins(run, (d) => delivered.push(d));
    scheduler.submit(7);
    calls[0]?.resolve("r7");
    await flush();
    expect(delivered).toEqual([{ tag: 1, value: "r7", latest: true }]);
  });

  it("drops results in flight after cancel, then accepts new input", async () => {
    const { run, calls } = deferredRunner();
    const delivered: Delivery<string>[] = [];
    const scheduler = createLatestWins(run, (d) => delivered.push(d));
    scheduler.submit(1);
    scheduler.submit(2);
    scheduler.cancel();
    calls[0]?.resolve("stale");
    await flush();
    expect(delivered).toEqual([]);
    expect(calls).toHaveLength(1);

    scheduler.submit(4);
    calls[1]?.resolve("r4");
    await flush();
    expect(delivered).toEqual([{ tag: 3, value: "r4", latest: true }]);
  });

  it("delivers nothing after dispose", async () => {
    const { run, calls } = deferredRunner();
    const delivered: Delivery<string>[] = [];
    const scheduler = createLatestWins(run, (d) => delivered.push(d));
    scheduler.submit(1);
    scheduler.dispose();
    calls[0]?.resolve("late");
    await flush();
    expect(delivered).toEqual([]);
  });
});
