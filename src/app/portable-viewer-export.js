import { appVersion } from "../app-version.js";
import {
  makePortableProteinStructureArtifact,
  makePortableSequenceViewerArtifact,
  makePortableViewerHtml,
  supportsPortableProteinStructureViewer,
  supportsPortableSequenceViewer
} from "../core/portable-viewer.js";
import { makeSafeFileStem } from "./canvas-export.js";
import { downloadText } from "./file-download.js";

const runtimeUrl = new URL("../portable-viewer/portable-viewer-runtime.iife.js", import.meta.url);
const stylesheetUrl = new URL("./styles.css", import.meta.url);
const structureRuntimeUrl = new URL("../vendor/3dmol/3Dmol-min.js", import.meta.url);
const structureLicenseUrl = new URL("../vendor/3dmol/LICENSE", import.meta.url);
const textAssetCache = new Map();

async function fetchTextAsset(url, label) {
  const key = String(url);
  if (!textAssetCache.has(key)) {
    textAssetCache.set(key, fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`${label} could not be loaded (${response.status}).`);
      return response.text();
    }).catch((error) => {
      textAssetCache.delete(key);
      throw error;
    }));
  }
  return textAssetCache.get(key);
}

export function supportsPortableViewerExport({ viewer, proteinStructure } = {}) {
  return supportsPortableSequenceViewer(viewer)
    || supportsPortableProteinStructureViewer(proteinStructure);
}

export async function makeStandalonePortableViewer({
  viewer,
  proteinStructure,
  state = {}
} = {}) {
  const theme = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
  const portableState = { ...state, theme };
  const artifact = supportsPortableSequenceViewer(viewer)
    ? makePortableSequenceViewerArtifact(viewer, { sms3Version: appVersion, state: portableState })
    : makePortableProteinStructureArtifact(proteinStructure, { sms3Version: appVersion, state: portableState });
  const isStructure = artifact.artifactType === "protein-structure-viewer";
  const [runtimeScript, stylesheet, structureRuntime, structureLicense] = await Promise.all([
    fetchTextAsset(runtimeUrl, "Portable viewer runtime"),
    fetchTextAsset(stylesheetUrl, "Portable viewer stylesheet"),
    isStructure ? fetchTextAsset(structureRuntimeUrl, "Protein structure runtime") : "",
    isStructure ? fetchTextAsset(structureLicenseUrl, "Protein structure license") : ""
  ]);
  const html = makePortableViewerHtml({
    artifact,
    runtimeScript,
    stylesheet,
    structureRuntime,
    structureLicense
  });
  return {
    artifact,
    html,
    filename: `${makeSafeFileStem(artifact.title, "sms3-viewer")}-portable-viewer.html`
  };
}

export async function downloadStandalonePortableViewer(options = {}) {
  const portable = await makeStandalonePortableViewer(options);
  downloadText(portable.html, portable.filename, "text/html;charset=utf-8");
  return portable;
}
