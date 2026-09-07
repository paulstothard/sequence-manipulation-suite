import {
  TOOL_WORKER_MESSAGE_TYPES,
  makeWorkerRunMessage
} from "../core/tool-worker-protocol.js";

let nextRequestId = 1;

function configuredToolWorkerPath() {
  return globalThis.document
    ?.querySelector('meta[name="sms3-tool-worker"]')
    ?.getAttribute("content")
    ?.trim() ?? "";
}

export function makeToolWorkerUrl(
  pageUrl = globalThis.location?.href,
  moduleUrl = import.meta.url,
  configuredPath = configuredToolWorkerPath()
) {
  const workerUrl = configuredPath
    ? new URL(configuredPath, pageUrl || moduleUrl)
    : new URL("../workers/tool-worker.js", moduleUrl);
  if (pageUrl) {
    const build = new URL(pageUrl).searchParams.get("build");
    if (build) workerUrl.searchParams.set("build", build);
  }
  return workerUrl;
}

export class ToolWorkerClient {
  constructor({ workerFactory } = {}) {
    this.workerFactory =
      workerFactory ??
      (() => new Worker(makeToolWorkerUrl(), { type: "module" }));
    this.worker = null;
    this.pending = new Map();
  }

  getWorker() {
    if (!this.worker) {
      const worker = this.workerFactory();
      this.worker = worker;
      worker.addEventListener("message", event => {
        if (this.worker === worker) this.handleMessage(event.data, worker);
      });
      const failed = event => {
        event.preventDefault?.();
        this.retireWorker(worker, new Error(event.message || "Tool worker transport failed; retry the run."));
      };
      worker.addEventListener("error", failed);
      worker.addEventListener("messageerror", failed);
    }
    return this.worker;
  }

  retireWorker(worker, error) {
    if (this.worker !== worker) return;
    this.worker = null;
    worker.terminate();
    for (const [id, pending] of this.pending) {
      if (pending.worker !== worker) continue;
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  runTool({ toolId, input, options = {}, onProgress = () => {} }) {
    const requestId = `tool-${nextRequestId++}`;
    const worker = this.getWorker();
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress, worker });
      try {
        worker.postMessage(makeWorkerRunMessage({ requestId, toolId, input, options }));
      } catch (error) {
        this.retireWorker(worker, error);
      }
    });
    return {
      requestId,
      promise,
      cancel: () => {
        if (!this.pending.has(requestId)) return;
        // Cancellation retires this shared worker and settles every run it owns;
        // it cannot depend on an acknowledgement from a stalled/failed runtime.
        const error = new Error("Tool run was cancelled.");
        error.name = "AbortError";
        this.retireWorker(worker, error);
      }
    };
  }

  handleMessage(message, worker = this.worker) {
    const pending = this.pending.get(message?.requestId);
    if (!pending || pending.worker !== worker) return;
    if (message.type === TOOL_WORKER_MESSAGE_TYPES.progress) {
      pending.onProgress(message);
      return;
    }
    if (![TOOL_WORKER_MESSAGE_TYPES.result, TOOL_WORKER_MESSAGE_TYPES.cancelled, TOOL_WORKER_MESSAGE_TYPES.error].includes(message.type)) return;
    this.pending.delete(message.requestId);
    if (message.type === TOOL_WORKER_MESSAGE_TYPES.result) pending.resolve(message.result);
    else if (message.type === TOOL_WORKER_MESSAGE_TYPES.cancelled) {
      const error = new Error("Tool run was cancelled."); error.name = "AbortError"; pending.reject(error);
    } else pending.reject(new Error(message.error));
  }

  terminate() {
    if (this.worker) this.retireWorker(this.worker, new Error("Tool worker was terminated."));
  }
}
