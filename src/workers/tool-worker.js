import { exportOrfExplorerSequences } from "../core/orf-explorer.js";
import { tools } from "../tools/registry.js";
import { createToolWorkerRunner } from "./tool-worker-runner.js";
import { prepareRetrievedWorkspaceRecords } from "../core/retrieved-workspace-records.js";

const runner = createToolWorkerRunner({
  tools: [...tools, { metadata: { id: "orf-explorer-export" }, run: (_input, options, context) => exportOrfExplorerSequences(options.data, options, context) }, {
    metadata: { id: "workspace-import-retrieval" },
    run: prepareRetrievedWorkspaceRecords
  }],
  postMessage: (message) => self.postMessage(message)
});

self.addEventListener("message", (event) => {
  runner.handleMessage(event.data);
});
