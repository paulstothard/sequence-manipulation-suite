# SVG parser runtime

Built locally from pinned saxes 6.0.0 and css-tree 3.1.0 and their transitive
packages. See the adjacent license notices. The runtime only parses XML/CSS;
SMS3 applies its own SVG allowlist and resource limits in core/graphic-editor.js.

Rebuild: `node scripts/vendor/build-svg-parser.mjs`.

The saxes npm tarball omits its license file. Its checked-in notice comes from
https://raw.githubusercontent.com/lddubeau/saxes/v6.0.0/LICENSE and is retained
by the rebuild script. Other notices are copied from the installed packages.
