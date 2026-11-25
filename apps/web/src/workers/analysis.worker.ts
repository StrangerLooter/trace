/// <reference lib="webworker" />

import { registerCustomSignatures } from "@trace/file-signatures";
import { createDefaultParserRegistry } from "@trace/parsers";
import { runAnalysisJob, runHexWindowRead } from "./analysis-engine";
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from "./protocol";

const registry = createDefaultParserRegistry();
const activeControllers = new Map<string, AbortController>();

function postResponse(msg: AnalysisWorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

self.addEventListener("message", (event: MessageEvent<AnalysisWorkerRequest>) => {
  const cmd = event.data;

  if (cmd.type === "cancel") {
    const controller = activeControllers.get(cmd.fileId);
    controller?.abort();
    activeControllers.delete(cmd.fileId);
    return;
  }

  if (cmd.type === "register_custom_signatures") {
    registerCustomSignatures(cmd.rules);
    return;
  }

  if (cmd.type === "analyze") {
    activeControllers.get(cmd.fileId)?.abort();
    const controller = new AbortController();
    activeControllers.set(cmd.fileId, controller);

    void runAnalysisJob(cmd, registry, controller.signal, postResponse).finally(() => {
      if (activeControllers.get(cmd.fileId) === controller) {
        activeControllers.delete(cmd.fileId);
      }
    });
    return;
  }

  if (cmd.type === "read_hex_window") {
    const controller = new AbortController();
    void runHexWindowRead(cmd, controller.signal, postResponse);
  }
});
