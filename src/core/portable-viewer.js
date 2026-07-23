export const PORTABLE_VIEWER_FORMAT = "sms3-portable-viewer";
export const PORTABLE_VIEWER_FORMAT_VERSION = 1;

const SEQUENCE_VIEWER_TYPES = new Set([
  "dna-sequence-viewer",
  "protein-sequence-viewer"
]);

function jsonClone(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`${label} is not serializable: ${error?.message || error}`);
  }
}

function materializedRegionSource(viewer) {
  const navigation = viewer?.regionNavigation;
  if (!navigation?.reference) return { type: "materialized-viewer" };
  return {
    type: "materialized-region",
    reference: String(navigation.reference),
    start: Number(navigation.start),
    end: Number(navigation.end),
    sourceMode: String(navigation.sourceMode || ""),
    availableReferenceCount: Array.isArray(navigation.references) ? navigation.references.length : 0
  };
}

function materializedViewerTitle(viewer, source) {
  const title = String(viewer?.title || "SMS3 sequence viewer");
  if (source.type !== "materialized-region") return title;
  return `${title} · ${source.reference}:${source.start.toLocaleString()}–${source.end.toLocaleString()}`;
}

export function supportsPortableSequenceViewer(viewer) {
  return Boolean(
    viewer &&
    SEQUENCE_VIEWER_TYPES.has(viewer.viewerType) &&
    Array.isArray(viewer.records) &&
    viewer.records.length > 0
  );
}

export function supportsPortableProteinStructureViewer(payload) {
  return Boolean(payload && String(payload.structureText || "").trim());
}

export function makePortableSequenceViewerArtifact(viewer, options = {}) {
  if (!supportsPortableSequenceViewer(viewer)) {
    throw new Error("A portable sequence viewer requires a materialized DNA/RNA or protein viewer payload.");
  }
  const source = materializedRegionSource(viewer);
  const payload = jsonClone(viewer, "Viewer payload");
  // Region navigation depends on the original SAM/BAM/VCF/reference inputs.
  // Portable artifacts deliberately contain only the materialized region.
  delete payload.regionNavigation;
  return {
    format: PORTABLE_VIEWER_FORMAT,
    formatVersion: PORTABLE_VIEWER_FORMAT_VERSION,
    sms3Version: String(options.sms3Version || "unknown"),
    artifactType: "sequence-viewer",
    viewerType: payload.viewerType,
    title: materializedViewerTitle(viewer, source),
    source,
    payload,
    state: jsonClone(options.state || {}, "Viewer state")
  };
}

export function makePortableProteinStructureArtifact(payload, options = {}) {
  if (!supportsPortableProteinStructureViewer(payload)) {
    throw new Error("A portable protein structure viewer requires materialized structure text.");
  }
  return {
    format: PORTABLE_VIEWER_FORMAT,
    formatVersion: PORTABLE_VIEWER_FORMAT_VERSION,
    sms3Version: String(options.sms3Version || "unknown"),
    artifactType: "protein-structure-viewer",
    viewerType: "protein-structure-viewer",
    title: String(payload.title || "Protein structure viewer"),
    source: { type: "materialized-viewer" },
    payload: jsonClone(payload, "Protein structure payload"),
    state: jsonClone(options.state || {}, "Protein structure viewer state")
  };
}

export function validatePortableViewerArtifact(artifact) {
  if (!artifact || artifact.format !== PORTABLE_VIEWER_FORMAT) {
    throw new Error("This is not an SMS3 portable viewer artifact.");
  }
  if (Number(artifact.formatVersion) !== PORTABLE_VIEWER_FORMAT_VERSION) {
    throw new Error(`Unsupported SMS3 portable viewer format version: ${artifact.formatVersion}.`);
  }
  if (artifact.artifactType === "sequence-viewer") {
    if (!supportsPortableSequenceViewer(artifact.payload)) {
      throw new Error("The portable sequence viewer payload is incomplete.");
    }
    if (artifact.payload.regionNavigation) {
      throw new Error("Portable sequence viewers cannot retain source-backed region navigation.");
    }
  } else if (artifact.artifactType === "protein-structure-viewer") {
    if (!supportsPortableProteinStructureViewer(artifact.payload)) {
      throw new Error("The portable protein structure payload is incomplete.");
    }
  } else {
    throw new Error(`Unsupported portable viewer type: ${artifact.artifactType || "unknown"}.`);
  }
  return artifact;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function serializePortableViewerArtifact(artifact) {
  validatePortableViewerArtifact(artifact);
  return JSON.stringify(artifact)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function assertSafeInlineAsset(value, closingTag, label) {
  const text = String(value || "");
  if (new RegExp(`</${closingTag}`, "iu").test(text)) {
    throw new Error(`${label} contains an unsafe closing ${closingTag} tag.`);
  }
  return text;
}

function normalizePortableTheme(value) {
  return value === "dark" || value === "light" ? value : "";
}

export function makePortableViewerHtml({
  artifact,
  runtimeScript,
  stylesheet,
  structureRuntime = "",
  structureLicense = ""
} = {}) {
  validatePortableViewerArtifact(artifact);
  const runtime = assertSafeInlineAsset(runtimeScript, "script", "Portable viewer runtime");
  const structure = assertSafeInlineAsset(structureRuntime, "script", "Protein structure runtime");
  const css = assertSafeInlineAsset(stylesheet, "style", "Portable viewer stylesheet");
  if (!runtime.trim()) throw new Error("Portable viewer runtime is missing.");
  if (!css.trim()) throw new Error("Portable viewer stylesheet is missing.");
  if (artifact.artifactType === "protein-structure-viewer" && !structure.trim()) {
    throw new Error("Protein structure portable viewers require the bundled 3D structure runtime.");
  }
  const title = escapeHtml(artifact.title);
  const initialTheme = normalizePortableTheme(artifact.state?.theme);
  const themeBootstrap = `(()=>{const exportedTheme=${JSON.stringify(initialTheme)};const storageKey="sms3-portable-viewer-theme:"+location.pathname;let storedTheme="";try{storedTheme=localStorage.getItem(storageKey)||""}catch{}const savedTheme=storedTheme==="dark"||storedTheme==="light"?storedTheme:"";const theme=savedTheme||exportedTheme||(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.documentElement.style.backgroundColor=theme==="dark"?"#111418":"#f7f8fa";})();`;
  const licenseDetails = structureLicense
    ? `<details class="portable-viewer-license"><summary>Bundled viewer license</summary><pre>${escapeHtml(structureLicense)}</pre></details>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; media-src data: blob:; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${title}</title>
  <script>${themeBootstrap}</script>
  <style>${css}
  .portable-viewer-page{box-sizing:border-box;max-width:100%;min-height:100vh;padding:1rem;background:var(--bg,#f7f8fa);color:var(--text,#172026)}
  .portable-viewer-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;max-width:96rem;margin:0 auto .75rem}
  .portable-viewer-header h1{margin:0;font-size:1.15rem}.portable-viewer-meta{margin:0;color:var(--muted-text,#5f6b76);font-size:.8rem}
  .portable-viewer-header-actions{display:flex;align-items:center;gap:.7rem}.portable-viewer-theme-toggle{flex:0 0 auto}
  .portable-viewer-host{max-width:96rem;margin:0 auto}.portable-viewer-note{margin:.7rem;padding:.6rem .7rem;border:1px solid var(--border,#ccd4dc);border-radius:6px;background:var(--surface,#fff);font-size:.82rem}
  .portable-viewer-license{max-width:96rem;margin:1rem auto;color:var(--muted-text,#5f6b76);font-size:.75rem}.portable-viewer-license pre{max-height:12rem;overflow:auto;white-space:pre-wrap}
  </style>
</head>
<body>
  <main class="portable-viewer-page">
    <header class="portable-viewer-header">
      <h1>${title}</h1>
      <div class="portable-viewer-header-actions">
        <p class="portable-viewer-meta">Portable viewer · SMS3 ${escapeHtml(artifact.sms3Version)}</p>
        <label class="theme-toggle portable-viewer-theme-toggle" title="Switch between light and dark mode">
          <input id="portableViewerThemeToggle" type="checkbox"${initialTheme === "dark" ? " checked" : ""}>
          <span class="switch-track" aria-hidden="true">
            <svg class="switch-icon switch-icon-sun" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
            <svg class="switch-icon switch-icon-moon" viewBox="0 0 24 24" focusable="false"><path d="M12 3a6.9 6.9 0 0 0 8.9 8.9A8 8 0 1 1 12 3Z"></path></svg>
            <span class="switch-thumb"></span>
          </span>
          <span class="visually-hidden">Dark mode</span>
        </label>
      </div>
    </header>
    <section id="sms3-portable-viewer" class="portable-viewer-host visual-output" aria-label="${title}"></section>
    ${licenseDetails}
  </main>
  <script id="sms3-portable-viewer-data" type="application/json">${serializePortableViewerArtifact(artifact)}</script>
  ${structure ? `<script>${structure}</script>` : ""}
  <script>${runtime}</script>
</body>
</html>`;
}
