let aioliModulePromise = null;

export function getBioWasmUnavailableReason() {
  if (globalThis.SMS3_FORCE_BIOWASM_FALLBACK === true) {
    return "BioWasm was disabled by the current test or runtime configuration";
  }
  if (typeof Worker !== "function") {
    return "Web Worker support is missing";
  }
  if (typeof WebAssembly === "undefined") {
    return "WebAssembly support is missing";
  }
  return "";
}

export function canRunBioWasm() {
  return getBioWasmUnavailableReason() === "";
}

export function requireBioWasmRuntime(toolLabel) {
  const reason = getBioWasmUnavailableReason();
  if (reason) {
    throw new Error(`${toolLabel} requires SMS3's bundled local runtime, but this execution environment cannot run it (${reason}).`);
  }
}

export function makeBioWasmFallbackWarning({ toolLabel, fallbackLabel }) {
  const reason = getBioWasmUnavailableReason();
  if (reason) {
    return `${toolLabel} did not run in this execution context (${reason}); used ${fallbackLabel}.`;
  }
  return `${toolLabel} did not run; used ${fallbackLabel}.`;
}

async function loadAioli() {
  if (!aioliModulePromise) {
    aioliModulePromise = import("../vendor/biowasm/aioli/3.2.1/aioli-module.js").then(({ Aioli }) => {
      if (!Aioli) {
        throw new Error("BioWasm Aioli runtime did not initialize.");
      }
      return Aioli;
    }).catch((error) => {
      aioliModulePromise = null;
      throw error;
    });
  }
  return aioliModulePromise;
}

export async function createBioWasmCli({ tool, program, version, assetPath, callback }) {
  if (!assetPath || !assetPath.startsWith("../vendor/biowasm/")) {
    throw new Error("BioWasm tools must use local vendored assets through createBioWasmCli.");
  }
  const Aioli = await loadAioli();
  return new Aioli([{
    tool,
    program: program || tool,
    version,
    urlPrefix: new URL(assetPath, import.meta.url).href
  }], {
    printInterleaved: false,
    debug: false,
    ...(typeof callback === "function" ? { callback } : {})
  });
}
