# Sequence Manipulation Suite

This repository contains the generated static files for the public Sequence Manipulation Suite 3 (SMS3) site.

Open SMS3 here:

- <https://stothardresearch.ca/sequence-manipulation-suite/>

The GitHub Pages project URL also works and currently redirects to the custom domain:

- <https://paulstothard.github.io/sequence-manipulation-suite/>

The custom domain works because `stothardresearch.ca` is configured to serve GitHub Pages content, and this project is published from the `sequence-manipulation-suite` repository.

SMS3 is a local-first browser lab toolkit. The app runs as static HTML, JavaScript, and bundled reference data in your browser; normal sequence, table, and workflow inputs are not uploaded to an SMS3 server.

Development happens in the private/development `sms3` repository. This public repository is a deployment artifact generated from that source repository. Do not develop SMS3 here; manual edits may be overwritten by the deploy packaging script.

Maintainer deployment notes and host-specific files live in the development repo's `deploy` symlink.
