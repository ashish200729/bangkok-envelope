import { auth } from "@envelope/auth";
import { checkDatabase, db, getPlotContext, getSiteBuildings, getSnapshotInfo } from "@envelope/db";
import { createApp } from "./app";

export type { ApiError, AppType } from "./app";

export const app = createApp({
  checkDatabase: () => checkDatabase(db),
  handleAuth: (request) => auth.handler(request),
  getSession: async (headers) => {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    return {
      userId: result.user.id,
      isAnonymous: result.user.isAnonymous === true,
      expiresAt: result.session.expiresAt.toISOString(),
    };
  },
  site: {
    getBuildings: (bbox, limit) => getSiteBuildings(db, bbox, limit),
    getPlotContext: (vertices) => getPlotContext(db, vertices),
    getSnapshotInfo: () => getSnapshotInfo(db),
  },
});
