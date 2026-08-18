# Vendored archify

Source: https://github.com/tt-a1i/archify
Version: 2.15.0 (MIT, see ./LICENSE)
Vendored: 2026-08-18

Only `renderers/`, `schemas/`, and `assets/template.html` are vendored — the
parts Triton 2 needs for deterministic SVG/HTML rendering and validation.

## Local patches (keep minimal, upstream-syncable via scripts/patch-renderers.py)

1. `renderers/*/render-*.mjs` — the CLI head (`loadDiagramWithBrandMarks` +
   argv parsing) is replaced by an exported `render<Type>({ diagram, template,
   outPath, sourceEvidence })` function that runs the same validation chain and
   returns `{ svg, cards, meta }`. The write tail only calls `writeDiagram`
   when both `template` and `outPath` are provided. Rendering bodies are
   byte-identical to upstream.
2. `renderers/shared/cli.mjs` — one added line: `export { validateSchema }`
   re-export so patched renderers can import it from this module.
3. `assets/template.html` — `'archimate'` added to the viewer's `PRESETS`
   array so the authored ArchiMate preset survives the Style Picker
   normalization (reader sessions can still switch away and back).

Browser compatibility is achieved without touching these files further:
`src/core/build.mjs` aliases the four Node-only shared modules
(`cli.mjs`, `diagnostics.mjs`, `brand-marks.mjs`, `repository-evidence.mjs`)
to the pure variants in `src/core/browser/` when bundling for the browser.
