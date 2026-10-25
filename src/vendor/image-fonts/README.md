# Image editor fonts

Six OFL families are bundled for Text & Table to Image: JetBrains Mono, Source
Code Pro, IBM Plex Mono, Inconsolata, Inter and Source Serif 4. Each family includes
its upstream license. `manifest.json` pins the source revision, versions, URLs,
checksums and file sizes. The complete bundle is approximately 1.2 MB.

Rebuild with `scripts/vendor/build-image-fonts.py` using Python and
`fonttools[woff]==4.61.1`. Conversion is lossless TTF-to-WOFF2 compression: complete
glyph sets and font metadata are retained; no glyphs or styles are redesigned.
This follows the [OFL guidance on WOFF compression](https://openfontlicense.org/ofl-faq/#22-can-i-make-and-use-woff-web-open-font-format-versions-of-ofl-fonts).
Only upright faces are used. IBM Plex Mono has separate regular and bold faces;
the other families retain their variable weights. Width and optical-size axes
are held at their defaults for consistent canvas measurement and SVG rendering.

Fonts load from this directory when the image editor opens, before measurement.
There are no runtime CDN requests. A failed load offers retry rather than
silently measuring or exporting a substitute. Exports embed only used bundled
families plus license text. PNG captures those fonts; SVG retains editable text
and embedded WOFF2 font faces. Some desktop SVG importers ignore embedded fonts;
install the corresponding font or use PNG in those applications. Existing
Courier New, Arial and Georgia choices remain system fonts with fallbacks.
