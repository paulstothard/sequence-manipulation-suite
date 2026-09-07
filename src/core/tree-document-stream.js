import {
  validateTreeDocument,
  LIMITS,
  byteLength,
} from "../../packages/tree-viewer/src/core/index.js";
import { makeCollectionStream, makeTextStream } from "./workflow.js";

export const TREE_DOCUMENT_MEDIA_TYPE = "application/vnd.sms3.tree+json";
export const treeDocumentContract = {
  id: "treeDocument",
  kind: "collection",
  itemKind: "tree-document",
  label: "Tree document",
};

export function makeTreeDocumentStream(document) {
  validateTreeDocument(document);
  return makeCollectionStream(
    [makeTextStream(JSON.stringify(document), TREE_DOCUMENT_MEDIA_TYPE)],
    "tree-document",
  );
}

export function readTreeDocumentStream(stream) {
  if (
    stream?.kind !== "collection" ||
    stream.itemKind !== "tree-document" ||
    !Array.isArray(stream.items) ||
    stream.items.length !== 1
  )
    throw new Error(
      "A tree document collection must contain exactly one native document.",
    );
  const item = stream.items[0];
  if (
    item?.kind !== "text" ||
    item.mediaType !== TREE_DOCUMENT_MEDIA_TYPE ||
    typeof item.text !== "string" ||
    byteLength(item.text) > LIMITS.documentBytes
  )
    throw new Error("Invalid native tree document stream.");
  const document = JSON.parse(item.text);
  validateTreeDocument(document);
  return document;
}
