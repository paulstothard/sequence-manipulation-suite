import {
  TOOL_WORKER_MESSAGE_TYPES,
  makeWorkerCancelledMessage,
  makeWorkerErrorMessage,
  makeWorkerProgressMessage,
  makeWorkerResultMessage
} from "../core/tool-worker-protocol.js";

export function createToolWorkerRunner({ tools, postMessage }) {
  const cancelledRequests = new Set();

  function makeCancellationError() {
    const error = new Error("Tool run was cancelled.");
    error.name = "AbortError";
    return error;
  }

  function throwIfCancelled(requestId) {
    if (cancelledRequests.has(requestId)) {
      throw makeCancellationError();
    }
  }

  function assertNotCancelled(requestId) {
    if (cancelledRequests.has(requestId)) {
      cancelledRequests.delete(requestId);
      postMessage(makeWorkerCancelledMessage(requestId));
      return true;
    }
    return false;
  }

  return {
    async handleMessage(message) {
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === TOOL_WORKER_MESSAGE_TYPES.cancel) {
        cancelledRequests.add(message.requestId);
        return;
      }

      if (message.type !== TOOL_WORKER_MESSAGE_TYPES.run) {
        return;
      }

      const { requestId, toolId, input, options } = message;
      const tool = tools.find((item) => item.metadata.id === toolId);
      if (!tool) {
        postMessage(makeWorkerErrorMessage(requestId, `Unknown tool "${toolId}".`));
        return;
      }

      if (assertNotCancelled(requestId)) {
        return;
      }

      try {
        postMessage(makeWorkerProgressMessage(requestId, { phase: "started", progress: 0 }));
        let runTool = tool.run;
        if (tool.metadata.runInWorker && tool.metadata.workerModule) {
          const module = await import(tool.metadata.workerModule);
          runTool = module[tool.metadata.workerExport ?? "run"];
          if (typeof runTool !== "function") {
            throw new Error(`Worker module for "${toolId}" does not export a runnable function.`);
          }
        }
        const toolContext = {
          requestId,
          isCancelled: () => cancelledRequests.has(requestId),
          throwIfCancelled: () => throwIfCancelled(requestId),
          reportProgress: (detail = {}) => {
            postMessage(makeWorkerProgressMessage(requestId, detail));
          },
          yieldIfNeeded: async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            throwIfCancelled(requestId);
          }
        };
        const result = await runTool(input, options ?? {}, toolContext);
        if (assertNotCancelled(requestId)) {
          return;
        }
        postMessage(makeWorkerProgressMessage(requestId, { phase: "finished", progress: 1 }));
        postMessage(makeWorkerResultMessage(requestId, result));
      } catch (error) {
        if (error?.name === "AbortError") {
          cancelledRequests.delete(requestId);
          postMessage(makeWorkerCancelledMessage(requestId));
          return;
        }
        cancelledRequests.delete(requestId);
        postMessage(makeWorkerErrorMessage(requestId, error));
      }
    }
  };
}
