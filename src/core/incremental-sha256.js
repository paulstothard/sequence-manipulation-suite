import { createSHA256 } from "../vendor/file-tools/hash-runtime.js";

// hash-wasm: https://github.com/Daninet/hash-wasm
// Each caller owns its state. Reuse init() for successive FASTA records.
export async function createIncrementalSha256() {
  const hasher = await createSHA256();
  let finished = false;
  return {
    init() { hasher.init(); finished = false; return this; },
    update(bytes) {
      if (finished) throw new Error("SHA-256 digest has already been finalized.");
      hasher.update(bytes);
      return this;
    },
    digestHex() {
      if (finished) throw new Error("SHA-256 digest has already been finalized.");
      finished = true;
      return hasher.digest("hex");
    }
  };
}
