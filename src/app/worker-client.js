import {
  TOOL_WORKER_MESSAGE_TYPES,
  makeWorkerCancelMessage,
  makeWorkerRunMessage
} from "../core/tool-worker-protocol.js";

let nextRequestId = 1;

export class ToolWorkerClient {
  constructor({ workerFactory } = {}) {
    this.workerFactory =
      workerFactory ??
      (() => new Worker(new URL("../workers/tool-worker.js", import.meta.url), { type: "module" }));
    this.worker = null;
    this.pending = new Map();
  }

  getWorker() {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });
    }
    return this.worker;
  }

  runTool({ toolId, input, options = {}, onProgress = () => {} }) {
    const requestId = `tool-${nextRequestId}`;
    nextRequestId += 1;

    const worker = this.getWorker();
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
    });

    worker.postMessage(makeWorkerRunMessage({ requestId, toolId, input, options }));

    return {
      requestId,
      promise,
      cancel: () => {
        worker.postMessage(makeWorkerCancelMessage(requestId));
      }
    };
  }

  handleMessage(message) {
    const pending = this.pending.get(message?.requestId);
    if (!pending) {
      return;
    }

    if (message.type === TOOL_WORKER_MESSAGE_TYPES.progress) {
      pending.onProgress(message);
      return;
    }

    this.pending.delete(message.requestId);

    if (message.type === TOOL_WORKER_MESSAGE_TYPES.result) {
      pending.resolve(message.result);
    } else if (message.type === TOOL_WORKER_MESSAGE_TYPES.cancelled) {
      pending.reject(new Error("Tool run was cancelled."));
    } else if (message.type === TOOL_WORKER_MESSAGE_TYPES.error) {
      pending.reject(new Error(message.error));
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const { reject } of this.pending.values()) {
      reject(new Error("Tool worker was terminated."));
    }
    this.pending.clear();
  }
}
