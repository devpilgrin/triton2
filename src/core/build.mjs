// Build the browser bundle of the Triton 2 core (archify renderers + converter).
// The vendored archify renderers import a handful of Node-only shared modules
// (fs/http/child_process); the alias plugin swaps them for browser-safe
// variants at bundle time so the same vendor tree still runs natively in Node.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const REPLACEMENTS = [
  ['renderers/shared/cli.mjs', 'src/core/browser/cli.browser.mjs'],
  ['renderers/shared/diagnostics.mjs', 'src/core/browser/diagnostics.browser.mjs'],
  ['renderers/shared/brand-marks.mjs', 'src/core/browser/brand-marks.browser.mjs'],
  ['renderers/shared/repository-evidence.mjs', 'src/core/browser/repository-evidence.browser.mjs'],
];

const browserAliasPlugin = {
  name: 'browser-alias',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^\.\.?\// }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path);
      for (const [from, to] of REPLACEMENTS) {
        if (resolved.endsWith(from.split('/').join(path.sep))) {
          return { path: path.join(root, to) };
        }
      }
      return null;
    });
  },
};

await build({
  entryPoints: [path.join(root, 'src/core/index.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(root, 'dist', 'triton2-core.browser.mjs'),
  plugins: [browserAliasPlugin],
  define: {
    'process.env.ARCHIFY_QUALITY_PROFILE': 'undefined',
    'process.env.ARCHIFY_DIAGNOSTIC_FORMAT': 'undefined',
  },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});

// Editor bundle: CodeMirror + core, one self-contained ESM file.
await build({
  entryPoints: [path.join(root, 'src/editor/editor.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(root, 'dist', 'editor.bundle.mjs'),
  plugins: [browserAliasPlugin],
  define: {
    'process.env.ARCHIFY_QUALITY_PROFILE': 'undefined',
    'process.env.ARCHIFY_DIAGNOSTIC_FORMAT': 'undefined',
  },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});

console.log('built dist/triton2-core.browser.mjs + dist/editor.bundle.mjs');
