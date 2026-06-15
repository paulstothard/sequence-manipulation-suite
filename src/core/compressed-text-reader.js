function makeAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Text file reading was cancelled.", "AbortError");
  }
  const error = new Error("Text file reading was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw makeAbortError();
  }
}

export function isGzipTextFile(file) {
  const name = String(file?.name ?? "").toLowerCase();
  const type = String(file?.type ?? "").toLowerCase();
  return name.endsWith(".gz") || type === "application/gzip" || type === "application/x-gzip";
}

function makeTextStream(file, compressed) {
  if (!file?.stream) {
    throw new Error("A browser File or Blob is required.");
  }
  if (!compressed) {
    return file.stream();
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("gzip decompression is not available in this browser. Use an uncompressed text file or a browser with DecompressionStream support.");
  }
  return file.stream().pipeThrough(new DecompressionStream("gzip"));
}

export async function* streamTextFileChunks(file, options = {}) {
  const compressed = options.compressed ?? isGzipTextFile(file);
  if (!compressed && typeof file?.text === "string") {
    throwIfAborted(options.signal);
    if (file.text) {
      options.onProgress?.({
        phase: "reading-text",
        compressed: false,
        chunks: 1,
        decodedBytes: file.text.length,
        sourceBytes: file?.size ?? file.text.length
      });
      yield file.text;
    }
    return;
  }
  if (!compressed && typeof file?.text === "function" && !file?.stream) {
    throwIfAborted(options.signal);
    const text = await file.text();
    throwIfAborted(options.signal);
    if (text) {
      options.onProgress?.({
        phase: "reading-text",
        compressed: false,
        chunks: 1,
        decodedBytes: text.length,
        sourceBytes: file?.size ?? text.length
      });
      yield text;
    }
    return;
  }
  const stream = makeTextStream(file, compressed);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let decodedBytes = 0;
  let chunks = 0;

  try {
    while (true) {
      throwIfAborted(options.signal);
      const { done, value } = await reader.read();
      throwIfAborted(options.signal);
      if (done) {
        break;
      }
      chunks += 1;
      decodedBytes += value.byteLength;
      options.onProgress?.({
        phase: compressed ? "decompressing-text" : "reading-text",
        compressed,
        chunks,
        decodedBytes,
        sourceBytes: file?.size ?? null
      });
      const text = decoder.decode(value, { stream: true });
      if (text) {
        yield text;
      }
    }

    const trailingText = decoder.decode();
    if (trailingText) {
      yield trailingText;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamTextLines(chunks, options = {}) {
  let buffer = "";
  let lineCount = 0;

  for await (const chunk of chunks) {
    throwIfAborted(options.signal);
    buffer += String(chunk ?? "").replace(/\r\n?/g, "\n");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      lineCount += 1;
      options.onLine?.({ lineCount });
      yield line;
      throwIfAborted(options.signal);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.length > 0) {
    lineCount += 1;
    options.onLine?.({ lineCount });
    yield buffer;
  }
}

export function streamTextFileLines(file, options = {}) {
  return streamTextLines(streamTextFileChunks(file, options), options);
}

export async function readTextFile(file, options = {}) {
  const chunks = [];
  for await (const chunk of streamTextFileChunks(file, options)) {
    chunks.push(chunk);
  }
  return chunks.join("");
}
