export const TOOL_WORKER_MESSAGE_TYPES = {
  run: "run",
  cancel: "cancel",
  progress: "progress",
  result: "result",
  error: "error",
  cancelled: "cancelled"
};

export function makeWorkerRunMessage({ requestId, toolId, input, options = {} }) {
  if (!requestId) {
    throw new Error("Worker run message requires requestId.");
  }
  if (!toolId) {
    throw new Error("Worker run message requires toolId.");
  }
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.run,
    requestId,
    toolId,
    input: String(input ?? ""),
    options
  };
}

export function makeWorkerCancelMessage(requestId) {
  if (!requestId) {
    throw new Error("Worker cancel message requires requestId.");
  }
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.cancel,
    requestId
  };
}

export function makeWorkerProgressMessage(requestId, detail = {}) {
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.progress,
    requestId,
    ...detail
  };
}

export function makeWorkerResultMessage(requestId, result) {
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.result,
    requestId,
    result
  };
}

export function makeWorkerErrorMessage(requestId, error) {
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.error,
    requestId,
    error: error instanceof Error ? error.message : String(error ?? "Unknown worker error.")
  };
}

export function makeWorkerCancelledMessage(requestId) {
  return {
    type: TOOL_WORKER_MESSAGE_TYPES.cancelled,
    requestId
  };
}
