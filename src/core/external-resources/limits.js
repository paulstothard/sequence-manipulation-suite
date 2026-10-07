// Retrieval and Workspace import share a ceiling so any complete download can
// be saved locally. Large assemblies must fail as a whole, never be truncated.
export const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
export const MAX_ASSEMBLY_SEQUENCES = 1000;
