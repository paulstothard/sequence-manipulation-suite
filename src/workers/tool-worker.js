import { tools } from "../tools/registry.js";
import { createToolWorkerRunner } from "./tool-worker-runner.js";

const runner = createToolWorkerRunner({
  tools,
  postMessage: (message) => self.postMessage(message)
});

self.addEventListener("message", (event) => {
  runner.handleMessage(event.data);
});
