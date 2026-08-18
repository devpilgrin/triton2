#!/usr/bin/env node
// Triton 2 CLI — diagram-as-code rendering on top of the vendored archify core.
//
//   triton2 render <input.dsl|input.json> [-o output.html] [--title "Title"]
//   triton2 validate <input.dsl|input.json>
//
// .dsl/.mmd input is parsed as Triton DSL and converted to archify IR;
// .json input must be archify IR (diagram_type selects the renderer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderDiagram,
  validateDiagram,
  parseFlowchart,
  modelToArchitectureIR,
  DIAGRAM_TYPES,
} from '../src/core/index.mjs';
import { prepareDiagramBrandMarks } from '../vendor/archify/renderers/shared/brand-marks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = path.join(root, 'vendor', 'archify', 'assets', 'template.html');

const USAGE = `triton2 — diagram-as-code core (Triton DSL + archify IR)

Usage:
  triton2 render <input.dsl|input.json> [-o output.html] [--title "Title"]
  triton2 validate <input.dsl|input.json>

Diagram types: ${DIAGRAM_TYPES.join(', ')} (IR only; Triton DSL maps to architecture).
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--output') args.output = argv[++i];
    else if (arg === '--title') args.title = argv[++i];
    else if (arg === '--json') args.json = true;
    else args._.push(arg);
  }
  return args;
}

function loadInput(file, title) {
  const source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    const ir = JSON.parse(source);
    if (!DIAGRAM_TYPES.includes(ir.diagram_type)) {
      throw new Error(`unknown diagram_type ${JSON.stringify(ir.diagram_type)} — expected one of ${DIAGRAM_TYPES.join(', ')}`);
    }
    return { type: ir.diagram_type, ir };
  }
  const model = parseFlowchart(source);
  return {
    type: 'architecture',
    ir: modelToArchitectureIR(model, { title: title || path.basename(file).replace(/\.(dsl|mmd)$/i, '') }),
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const input = args._[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }
  if (!input) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const { type, ir } = loadInput(input, args.title);

  if (command === 'validate') {
    const result = await validateDiagram(type, ir);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.ok) {
      process.stdout.write(`${input}: valid ${type} IR\n`);
    } else {
      process.stderr.write(`${input}: invalid\n${result.error}\n`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'render') {
    const output = args.output || input.replace(/\.(dsl|mmd|json)$/i, '') + '.html';
    await prepareDiagramBrandMarks(type, ir);
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    await renderDiagram(type, ir, { template, outPath: path.resolve(output) });
    // writeDiagram (inside the renderer) prints the absolute output path.
    return;
  }

  process.stderr.write(`unknown command ${JSON.stringify(command)}\n\n${USAGE}`);
  process.exit(2);
}

main().catch((error) => {
  process.stderr.write(`triton2: ${error.message}\n`);
  process.exit(1);
});
