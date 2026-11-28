# MediaPort 3D landing header — entire project

This project’s pages, files, and uploads as this browser tab had them at export.
Anything left out is listed below.

## Contents

- `Main.dc.html`
- `canvas.json` — the canvas: its pages, where each artboard sits, its notes and shapes
- `ds/mediaport/tokens.json`
- `assets/` — files uploaded to the design (images, fonts, media)
- `_runtime/` — what runs the pages in a browser; not part of the design

## Uploaded files

Images, fonts and media uploaded to the design are written once each under
`assets/` — 1 in this export — and the exported files refer to them there. A
reference a script puts together while the page runs (for example
`"/_blob/" + id`) is not rewritten and does not load from this folder.

A page in a subfolder may not show an upload that reaches it through a script, a data
file or an imported component, because those files link to `assets/` from a different folder.

## Viewing

To view a page, start a local web server in this folder (for example `python3 -m http.server`), then open an artboard’s `.dc.html` file through it. Opening the file directly may not work, because some browsers block its scripts.

## Left out of this export

The export never includes hidden files (files whose names start with a dot) or
files the editor keeps for its own use.
