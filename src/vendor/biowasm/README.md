# BioWasm Vendored Runtime

SMS3 vendors the small BioWasm/Aioli runtime plus selected JavaScript/WebAssembly
packages so browser analyses can run locally without a runtime CDN dependency.

Fetched files:

- `aioli/3.2.1/aioli.js` from `https://biowasm.com/cdn/v3/aioli.js`
- `muscle/5.1.0/muscle.js` from `https://biowasm.com/cdn/v3/muscle/5.1.0/muscle.js`
- `muscle/5.1.0/muscle.wasm` from `https://biowasm.com/cdn/v3/muscle/5.1.0/muscle.wasm`
- `seq-align/2017.10.18/needleman_wunsch.js` from `https://biowasm.com/cdn/v3/seq-align/2017.10.18/needleman_wunsch.js`
- `seq-align/2017.10.18/needleman_wunsch.wasm` from `https://biowasm.com/cdn/v3/seq-align/2017.10.18/needleman_wunsch.wasm`
- `seq-align/2017.10.18/smith_waterman.js` from `https://biowasm.com/cdn/v3/seq-align/2017.10.18/smith_waterman.js`
- `seq-align/2017.10.18/smith_waterman.wasm` from `https://biowasm.com/cdn/v3/seq-align/2017.10.18/smith_waterman.wasm`
- `samtools/1.21/samtools.js` from `https://biowasm.com/cdn/v3/samtools/1.21/samtools.js`
- `samtools/1.21/samtools.wasm` from `https://biowasm.com/cdn/v3/samtools/1.21/samtools.wasm`
- `samtools/1.21/samtools.data` from `https://biowasm.com/cdn/v3/samtools/1.21/samtools.data`
- `bcftools/1.10/bcftools.js` from `https://biowasm.com/cdn/v3/bcftools/1.10/bcftools.js`
- `bcftools/1.10/bcftools.wasm` from `https://biowasm.com/cdn/v3/bcftools/1.10/bcftools.wasm`
- `bcftools/1.10/bcftools.data` from `https://biowasm.com/cdn/v3/bcftools/1.10/bcftools.data`
- `minimap2/2.22/minimap2.js` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2.js`
- `minimap2/2.22/minimap2.wasm` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2.wasm`
- `minimap2/2.22/minimap2.data` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2.data`
- `minimap2/2.22/minimap2-simd.js` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2-simd.js`
- `minimap2/2.22/minimap2-simd.wasm` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2-simd.wasm`
- `minimap2/2.22/minimap2-simd.data` from `https://biowasm.com/cdn/v3/minimap2/2.22/minimap2-simd.data`
- `fastp/0.20.1/fastp.js` from `https://biowasm.com/cdn/v3/fastp/0.20.1/fastp.js`
- `fastp/0.20.1/fastp.wasm` from `https://biowasm.com/cdn/v3/fastp/0.20.1/fastp.wasm`
- `fastp/0.20.1/fastp.data` from `https://biowasm.com/cdn/v3/fastp/0.20.1/fastp.data`
- `gffread/0.12.7/gffread.js` from `https://biowasm.com/cdn/v3/gffread/0.12.7/gffread.js`
- `gffread/0.12.7/gffread.wasm` from `https://biowasm.com/cdn/v3/gffread/0.12.7/gffread.wasm`
- `gffread/0.12.7/gffread.data` from `https://biowasm.com/cdn/v3/gffread/0.12.7/gffread.data`
- `bedtools/2.31.0/bedtools.js` from `https://biowasm.com/cdn/v3/bedtools/2.31.0/bedtools.js`
- `bedtools/2.31.0/bedtools.wasm` from `https://biowasm.com/cdn/v3/bedtools/2.31.0/bedtools.wasm`
- `bedtools/2.31.0/bedtools.data` from `https://biowasm.com/cdn/v3/bedtools/2.31.0/bedtools.data`

The vendored Aioli bootstrap is patched to create its nested worker from a
same-origin `Blob` URL when SMS3 runs BioWasm from a module worker.

SHA-256 checksums:

- `aioli/3.2.1/aioli.js`: `eefafecf0ac799c44284ac045e09862d6f62766a364fe4245365243e6082f515`
- `muscle/5.1.0/muscle.js`: `a857f4120fa752316e985d4e15df0004cd54997568b903e2297356735ce7fa10`
- `muscle/5.1.0/muscle.wasm`: `bfd665c7cbd0847bbdc4d672a9fc975ab6f785b26e99d8a7adf0497f213a95cd`
- `seq-align/2017.10.18/needleman_wunsch.js`: `f806e8f02dbf52366c6fbec589a3bc72bfd7ff92e7acf705068c01bde31a3260`
- `seq-align/2017.10.18/needleman_wunsch.wasm`: `44ce58a899b679fb75a00c1252cef49df458448d8fd77a6083bd00be102be17b`
- `seq-align/2017.10.18/smith_waterman.js`: `a84a57dd03f737c602e232ca43c92a968a425f15b5752b8048f26e69bf2a338b`
- `seq-align/2017.10.18/smith_waterman.wasm`: `3376540d3596497ab50cf1ff4d008cf2e8d020fe433afab052fee27fd2557083`
- `samtools/1.21/samtools.js`: `c4cc0ece973ce2e0290297c15ee108fdd28d9b496b9b14c47982cde985e5887e`
- `samtools/1.21/samtools.wasm`: `558dbfcacbed3bd71bb600ca48299c2ceb563f3c3aafe40eaed3a3c45cdbb7b3`
- `samtools/1.21/samtools.data`: `9fb04db92aa5c1169353144e803bd1a64c15e332cd8b0bea7598018c374b7aea`
- `bcftools/1.10/bcftools.js`: `2e0118cbb252a4124e18ab370f58cd5e0f266329d17db2dc8592fe66b9480367`
- `bcftools/1.10/bcftools.wasm`: `ae6ca30d70c97f8e8adea1c3de6c2f4cd67be693231f62275676989ae1dd0d9c`
- `bcftools/1.10/bcftools.data`: `586a06ce1ba23eef26f5b3b6b0f2cabeddf2a2b99f17cd06cffcbb0acc35d19f`
- `minimap2/2.22/minimap2.js`: `e70da4c6e6852791ef47e37d227a74126d340e6d6b16f06a9eb114f6b418c750`
- `minimap2/2.22/minimap2.wasm`: `865c9737f4ea1099f2b3f70870ad365274f37edbbb11fce5b0c33160f72bef70`
- `minimap2/2.22/minimap2.data`: `b4b27e859ea460eb35edc3481d1acae5f02dba849baa64c86ec7c4a1749090c1`
- `minimap2/2.22/minimap2-simd.js`: `82eac484c3cd31983e7369b2d6f7f4923c01ac7bc2a5064bd2ec682b135f0b6e`
- `minimap2/2.22/minimap2-simd.wasm`: `4c93d2b4ed01955b4a6ca8b4501c0cb99afea3c9c39f842f335974f2e1feeb88`
- `minimap2/2.22/minimap2-simd.data`: `b4b27e859ea460eb35edc3481d1acae5f02dba849baa64c86ec7c4a1749090c1`
- `fastp/0.20.1/fastp.js`: `f5afc65123041743c44a258b334d03b8781a067e838cf371af0c13931e25721c`
- `fastp/0.20.1/fastp.wasm`: `160fb1472d0c29e9189e58efbd57121ceb62c95a9f671682466f67b1dc304f9b`
- `fastp/0.20.1/fastp.data`: `e5562c4b4c16bffc9450a4de109c258eaab17c97e8c447c81813c4221f02c447`
- `gffread/0.12.7/gffread.js`: `a89894746dd736ccd6336a1d19578e6c5eaa8ec7af4eadc9b1447e77b9bf9702`
- `gffread/0.12.7/gffread.wasm`: `6411b6da42038f107e82168670f1eadaafb7e8713fe3df161d4a1762e774dc2b`
- `gffread/0.12.7/gffread.data`: `77557b0d0c678401e7d80582e249d672dbd65c991b35225ce5b9d5c7fef311a2`
- `bedtools/2.31.0/bedtools.js`: `d38932a8d8cc3a11d3a10173d7eba782114d943fe5f55015d31d80f1ed0f4553`
- `bedtools/2.31.0/bedtools.wasm`: `d3c6c93819a02022c89a80a3b8938a823d294567386363428079a3c3ef964c19`
- `bedtools/2.31.0/bedtools.data`: `859fb21116501704a568dea08ee322a4e9beb1c5a0a09fff35723bbf81484263`

License texts are kept under `licenses/`. The app attribution page is driven by
`src/reference-data/license-attributions.js`, and the production BioWasm package
inventory is kept in `src/vendor/biowasm/manifest.js`.
