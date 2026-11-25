/// <reference lib="webworker" />

import { runHashJob } from "./hash-engine";
import type { HashWorkerRequest, HashWorkerResponse } from "./protocol";

const activeControllers = new Map<string, AbortController>();

function postResponse(msg: HashWorkerResponse): void {
  self.postMessage(msg);
}

self.addEventListener("message", (event: MessageEvent<HashWorkerRequest>) => {
  const cmd = event.data;

  if (cmd.type === "cancel") {
    activeControllers.get(cmd.fileId)?.abort();
    activeControllers.delete(cmd.fileId);
    return;
  }

  if (cmd.type === "hash") {
    activeControllers.get(cmd.fileId)?.abort();
    const controller = new AbortController();
    activeControllers.set(cmd.fileId, controller);

    void runHashJob(cmd, controller.signal, postResponse).finally(() => {
      if (activeControllers.get(cmd.fileId) === controller) {
        activeControllers.delete(cmd.fileId);
      }
    });
  }
});
