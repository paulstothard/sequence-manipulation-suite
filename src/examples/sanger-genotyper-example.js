import data from "./sanger-genotyper-example-data.json" with { type: "json" };
import { SANGER_SESSION_SEPARATOR } from "../core/sanger-trace.js";
import { formatFastaRecord } from "../core/fasta.js";
let cached;
export function getSangerGenotyperExample() {
  return (cached ??= data.traces
    .map((trace) => JSON.stringify(trace))
    .concat(formatFastaRecord("Synthetic reference", data.reference))
    .join(`\n${SANGER_SESSION_SEPARATOR}\n`));
}
