import type { CustomDesignId, DesignSpec, EngineInput } from "@envelope/engine";
import type { CustomReply } from "./protocol";
import { createLatestWins, type LatestWins } from "./scheduler";

export type CustomJob = { id: CustomDesignId; input: EngineInput; spec: DesignSpec };
export type CustomDelivery = {
  job: CustomJob;
  reply: CustomReply;
  /** False when a newer edit of the same design is already waiting. */
  latest: boolean;
};

export type CustomBuilds = {
  submit: (job: CustomJob) => void;
  /** Drops a design's waiting edit and results in flight (the design was deleted). */
  forget: (id: CustomDesignId) => void;
  dispose: () => void;
};

/**
 * One latest-wins lane per edited design: a slider drag on one design never queues behind or
 * cancels another design's build, and each design's results never go backwards.
 */
export function createCustomBuilds(
  build: (job: CustomJob) => Promise<CustomReply>,
  deliver: (delivery: CustomDelivery) => void,
): CustomBuilds {
  const lanes = new Map<CustomDesignId, LatestWins<CustomJob>>();
  return {
    submit(job) {
      let lane = lanes.get(job.id);
      if (!lane) {
        lane = createLatestWins<CustomJob, { job: CustomJob; reply: CustomReply }>(
          async (j) => ({ job: j, reply: await build(j) }),
          ({ value, latest }) => deliver({ ...value, latest }),
        );
        lanes.set(job.id, lane);
      }
      lane.submit(job);
    },
    forget(id) {
      lanes.get(id)?.dispose();
      lanes.delete(id);
    },
    dispose() {
      for (const lane of lanes.values()) lane.dispose();
      lanes.clear();
    },
  };
}
