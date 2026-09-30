# Browser file engines

Run `npm run vendor:file-tools` after a reviewed dependency update; run
`npm run vendor:file-tools -- --check` to verify reproducibility. Versions are
pinned in package-lock.json. provenance.json records versions, byte sizes and
SHA-256 hashes; licenses/ preserves upstream notices, including hash-wasm's
embedded C implementations. Runtime imports use these local bundles, without
CDN requests or user-data uploads. Archives are lazy-loaded by their consumer.

hash-wasm supplies MD5/SHA-1/SHA-256/SHA-512. zip.js supplies ZIP/ZIP64 readers
and its packaged WASM codecs; SMS3 runs it inside its own cancellable worker.
fflate handles streaming multi-member gzip. modern-tar parses streamed TAR.
file-type provides best-effort binary signature recognition on bounded samples.
