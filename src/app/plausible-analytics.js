export const PLAUSIBLE_TOOL_RUN_EVENT = "Tool Run";

export function trackPlausiblePageview(windowRef = globalThis.window) {
  if (typeof windowRef?.plausible !== "function") return false;
  windowRef.plausible("pageview");
  return true;
}

export function makePlausibleToolRunProperties(metadata, appVersion) {
  return {
    tool_id: String(metadata?.id || "unknown-tool"),
    tool_name: String(metadata?.name || "Tool"),
    tool_category: String(metadata?.category || "Other Tools"),
    app_version: String(appVersion || "unknown")
  };
}

export function trackPlausibleToolRun(metadata, appVersion, windowRef = globalThis.window) {
  if (typeof windowRef?.plausible !== "function") return false;
  windowRef.plausible(PLAUSIBLE_TOOL_RUN_EVENT, {
    props: makePlausibleToolRunProperties(metadata, appVersion)
  });
  return true;
}
