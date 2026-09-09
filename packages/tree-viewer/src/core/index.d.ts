export type Scalar = string | number | boolean | null;
export type RootInterpretation = "rooted" | "unrooted" | "unspecified";
export interface TreeComment {
  text: string;
  position: "before" | "after-label" | "after-length";
}
export interface SupportValue {
  value: number;
  units: string;
  source: string;
}
export interface BranchData {
  length: number | null;
  lexical: string | null;
  comments: TreeComment[];
  annotations: Record<string, Scalar>;
  support: Record<string, SupportValue>;
}
export interface TreeNode {
  id: string;
  label: string;
  labelInterpretation: "name" | "unresolved" | "support";
  annotations: Record<string, Scalar>;
  comments: TreeComment[];
}
export interface TreeEdge extends BranchData {
  id: string;
  parent: string;
  child: string;
}
export interface ScientificTree {
  id: string;
  name: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  root: {
    nodeId: string;
    interpretation: RootInterpretation;
    stem: BranchData;
  };
}
export interface NodeStyle {
  branchColor?: string;
  labelColor?: string;
  highlight?: string;
  branchWidth?: number;
}
export interface MetadataTrack {
  id: string;
  field: string;
  type: "categorical" | "bar" | "heatmap" | "text" | "symbol" | "multi-bar";
  fields?: string[];
  symbolShape?: "circle" | "square" | "triangle";
  visible: boolean;
  color?: string;
  colors?: Record<string, string>;
}
export interface Presentation {
  layout: "rectangular" | "circular" | "unrooted";
  metric: "auto" | "phylogram" | "cladogram";
  orientation: "right" | "left" | "up" | "down";
  fontFamily: string;
  fontSize: number;
  branchWidth: number;
  branchColor: string;
  labelColor: string;
  background: string;
  spacing: number;
  width: number;
  showSupport: boolean;
  supportFilter?: "auto" | "all" | "minimum";
  supportField?: string;
  supportMinimum?: number | null;
  supportPrecision?: number;
  supportSize?: number;
  supportPosition?: "node" | "branch";
  branchShape?: "square" | "slanted" | "curved";
  unrootedAlgorithm?: "equal-angle" | "equal-daylight";
  labelAlignment?: "aligned" | "at-tip";
  labelBackground?: string;
  showLabelBackground?: boolean;
  showBranchLengths?: boolean;
  branchLengthPrecision?: number;
  supportEncoding?: "text" | "symbol" | "color";
  supportColor?: string;
  supportSymbol?: "circle" | "square" | "triangle";
  legendPosition?: "right" | "bottom";
  circularRotation?: number;
  circularArc?: number;
  legendSize?: number;
  showScale?: boolean;

  showLegend: boolean;
  ladderize: "none" | "ascending" | "descending";
  collapsed: string[];
  order: Record<string, string[]>;
  nodeStyles: Record<string, NodeStyle>;
  cladeAnnotations?: Record<string, {label:string; color:string; opacity:number; bracket?:boolean; tips:string[]}>;
  displayNames: Record<string, string>;
  tracks: MetadataTrack[];
}
export interface MetadataColumn {
  name: string;
  type: "string" | "number" | "boolean";
}
export interface TreeMetadata {
  columns: MetadataColumn[];
  rows: Array<{ nodeId: string; values: Record<string, Scalar> }>;
}
export interface TreeDocument {
  format: "sms3-tree-document";
  formatVersion: 1;
  producer: { name: string; version: string };
  revision: number;
  source: { text: string; name: string; format: string };
  trees: ScientificTree[];
  presentation: Record<string, Presentation>;
  metadata: Record<string, TreeMetadata>;
  history: { undo: HistoryEntry[]; redo: HistoryEntry[] };
}
export interface HistoryEntry {
  label: string;
  state: Partial<Pick<TreeDocument, "trees" | "presentation" | "metadata">>;
}
export interface Diagnostic {
  code: string;
  severity: "warning" | "error";
  message: string;
  treeId?: string;
  nodeId?: string;
  line?: number;
  column?: number;
  offset?: number;
}
export interface OperationContext {
  signal?: { readonly aborted: boolean };
  throwIfCancelled?: () => void;
  isCancelled?: () => boolean;
  yieldIfNeeded?: () => Promise<void> | void;
  reportProgress?: (progress: { phase: string }) => void;
}
export interface ImportOptions {
  sourceName?: string;
  supportProfile?: "unresolved" | "name" | "bootstrap-percent" | "bootstrap-proportion" | "sh-alrt-ufboot";
  internalLabels?: "name" | "unresolved" | "support";
  supportNames?: string[];
  supportUnits?: string;
  rootedness?: RootInterpretation;
  annotationDialect?: "opaque" | "nhx" | "beast";
}
export interface MetadataTable {
  key?: "label" | "nodeId";
  columns: MetadataColumn[];
  rows: Array<{ key: string; values: Record<string, Scalar> }>;
}
export interface StylePreset {
  format: "sms3-tree-style";
  formatVersion: 1;
  name: string;
  presentation: Omit<
    Presentation,
    "collapsed" | "order" | "nodeStyles" | "displayNames"
  >;
}
export type PresentationPatch = Partial<
  Omit<
    Presentation,
    "collapsed" | "order" | "nodeStyles" | "displayNames" | "tracks" | "cladeAnnotations"
  >
>;
export type CommandAction =
  | { type: "clade-annotation"; nodeId:string; annotation:{label:string; color:string; opacity:number; bracket?:boolean} | null }
  | { type: "reroot"; nodeId: string; midpoint?: false }
  | { type: "reroot"; edgeChildId: string; midpoint?: false }
  | { type: "reroot"; midpoint: true }
  | { type: "prune"; nodeId: string }
  | { type: "presentation"; patch: PresentationPatch }
  | { type: "reset-presentation" }
  | { type: "display-name"; nodeId: string; name: string }
  | {
      type: "node-style";
      nodeId: string;
      scope?: "node" | "clade";
      style: NodeStyle;
    }
  | { type: "collapse"; nodeId: string; collapsed: boolean }
  | { type: "order"; nodeId: string; children: string[] }
  | {
      type: "metadata";
      table: MetadataTable;
      allowUnmatched?: boolean;
      dropIncompatibleTracks?: boolean;
    }
  | { type: "tracks"; tracks: MetadataTrack[] }
  | {
      type: "preset";
      preset: StylePreset;
      fieldMapping?: Record<string, string>;
    }
  | {
      type: "interpret-label";
      nodeId: string;
      interpretation: "name" | "support";
      names?: string[];
      units?: string;
    }
  | { type: "interpret-labels"; profile: "name" | "bootstrap-percent" | "bootstrap-proportion" | "sh-alrt-ufboot" }
  | { type: "undo" | "redo" };
export type TreeCommand =
  | (Exclude<CommandAction, { type: "undo" | "redo" }> & {
      treeId: string;
      expectedRevision: number;
    })
  | { type: "undo" | "redo"; treeId?: string; expectedRevision: number };
export interface DataExportOptions {
  format?:
    | "native"
    | "source"
    | "newick"
    | "nexus"
    | "nodes"
    | "edges"
    | "history";
  treeId?: string;
}
export interface DataExport {
  text: string;
  revision: number;
  losses: string[];
  columns?: string[];
  rows?: Scalar[][];
}
export function parseTreeDocument(
  source: string,
  options?: ImportOptions,
  context?: OperationContext,
): Promise<{ document: TreeDocument; diagnostics: Diagnostic[] }>;
export function validateTreeDocument(document: unknown): {
  valid: true;
  treeCount: number;
  nodeCount: number;
};
export function applyTreeCommand(
  document: TreeDocument,
  command: TreeCommand,
  context?: OperationContext,
): Promise<TreeDocument>;
export function exportTreeDocument(
  document: TreeDocument,
  options?: DataExportOptions,
  context?: OperationContext,
): Promise<DataExport>;
export function serializeNewick(
  tree: ScientificTree,
  context?: OperationContext,
): Promise<string>;
export function quoteLabel(value: string): string;
export function treeIndex(tree: ScientificTree): {
  nodes: Map<string, TreeNode>;
  children: Map<string, TreeEdge[]>;
  incoming: Map<string, TreeEdge>;
};
export function descendants(tree: ScientificTree, nodeId: string): string[];
export function scientificSnapshot(document: TreeDocument): ScientificTree[];
export function searchTree(
  document: TreeDocument,
  treeId: string,
  query: string,
): string[];
export function previewMetadataJoin(
  tree: ScientificTree,
  table: MetadataTable,
): {
  metadata: TreeMetadata;
  matched: number;
  unmatched: Array<{ row: number; key: string }>;
  ambiguous: Array<{ row: number; key: string; nodeIds: string[] }>;
  duplicates: Array<{ row: number; key: string }>;
  missingNodes: string[];
  canApply: boolean;
};
export function createStylePreset(
  document: TreeDocument,
  treeId: string,
  name?: string,
): StylePreset;
export function previewStylePreset(
  document: TreeDocument,
  treeId: string,
  preset: StylePreset,
  fieldMapping?: Record<string, string>,
): {
  presentation: StylePreset["presentation"];
  missingFields: string[];
  canApply: boolean;
};
export function makeTreeDocument(
  source: TreeDocument["source"],
  trees: ScientificTree[],
): TreeDocument;
export function byteLength(value: unknown): number;
export function checkpoint(
  context?: OperationContext,
  phase?: string,
): Promise<void>;
export function checkCancelled(context?: OperationContext): void;
export function isFiniteNumberToken(text: string): boolean;
export const VERSION: string;
export const LIMITS: Readonly<{
  inputBytes: number;
  documentBytes: number;
  nodes: number;
  visibleNodes: number;
  visibleTips: number;
  trees: number;
  depth: number;
  labelCharacters: number;
  commentCharacters: number;
  comments: number;
  metadataCells: number;
  metadataColumns: number;
  tracks: number;
  historyBytes: number;
  historyEntries: number;
  rasterPixels: number;
}>;
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export const DEFAULT_PRESENTATION: DeepReadonly<Presentation>;
export class TreeInputError extends Error {
  constructor(message: string, source?: string, offset?: number, code?: string);
  diagnostic: Diagnostic;
}
