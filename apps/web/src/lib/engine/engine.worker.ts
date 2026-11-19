import { handleRequest } from "./handle";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  const response: WorkerResponse = { id, reply: handleRequest(request) };
  scope.postMessage(response);
};
