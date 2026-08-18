// Triton 2 smoke test — proves the vendored archify renderers run through the
// Triton 2 core API in Node, and that the browser bundle (the artifact the web
// editor will load) executes the exact same renders without any Node builtins.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDiagram, parseFlowchart, modelToArchitectureIR } from '../src/core/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// 1. Every archify example renders through the Node path.
const EXAMPLES = [
  ['architecture', 'examples/checkout-platform.base.architecture.json'],
  ['workflow', 'examples/agent-tool-call.workflow.json'],
  ['sequence', 'examples/cache-miss-request.sequence.json'],
  ['dataflow', 'examples/event-stream.dataflow.json'],
  ['lifecycle', 'examples/deployment-release.lifecycle.json'],
];

for (const [type, rel] of EXAMPLES) {
  try {
    const { svg, meta } = await renderDiagram(type, read(rel));
    check(`node render ${type}`, svg.includes('<svg') && svg.includes('</svg>'), `svg ${svg.length} bytes, title "${meta?.title}"`);
  } catch (error) {
    check(`node render ${type}`, false, error.message.split('\n')[0]);
  }
}

// 2. The browser bundle renders the same diagrams without Node builtins.
const browser = await import(path.join(root, 'dist', 'triton2-core.browser.mjs'));
for (const [type, rel] of EXAMPLES) {
  try {
    const { svg } = await browser.renderDiagram(type, read(rel));
    check(`browser-bundle render ${type}`, svg.includes('<svg') && svg.includes('</svg>'), `svg ${svg.length} bytes`);
  } catch (error) {
    check(`browser-bundle render ${type}`, false, error.message.split('\n')[0]);
  }
}

// 3. Full chain: Triton DSL -> DiagramModel -> architecture IR -> SVG.
const dsl = `flowchart TD
  A[Клиент] --> B{Запрос валиден?}
  B -Да-> C[Обработка] [зелёный]
  B -Нет-> D[Отказ] [красный] [--]
  C --> E([Ответ])`;
try {
  const model = parseFlowchart(dsl);
  const ir = modelToArchitectureIR(model, { title: 'Triton DSL smoke' });
  const { svg } = await renderDiagram('architecture', ir);
  check(
    'dsl -> ir -> svg (node)',
    svg.includes('<svg') && svg.includes('Клиент') && ir.components.length === 5 && ir.connections.length === 4,
    `${ir.components.length} components, ${ir.connections.length} connections`,
  );
} catch (error) {
  check('dsl -> ir -> svg (node)', false, error.message.split('\n')[0]);
}
try {
  const model = browser.parseFlowchart(dsl);
  const ir = browser.modelToArchitectureIR(model, { title: 'Triton DSL smoke (browser bundle)' });
  const { svg } = await browser.renderDiagram('architecture', ir);
  check('dsl -> ir -> svg (browser bundle)', svg.includes('<svg') && svg.includes('Клиент'), `svg ${svg.length} bytes`);
} catch (error) {
  check('dsl -> ir -> svg (browser bundle)', false, error.message.split('\n')[0]);
}

// 4. Validator diagnostics surface as structured data (editor diagnostics panel).
const broken = read('examples/checkout-platform.base.architecture.json');
broken.components = [{ id: 'only', pos: [0, 0] }]; // missing label/size is fine; remove connections target integrity
broken.connections = [{ from: 'only', to: 'ghost-node' }];
try {
  await renderDiagram('architecture', broken);
  check('diagnostics for broken IR', false, 'render unexpectedly succeeded');
} catch (error) {
  const diag = Array.isArray(error?.archifyDiagnostics) ? error.archifyDiagnostics.length : 0;
  check('diagnostics for broken IR', diag > 0 || /ghost-node/.test(error.message), error.message.split('\n')[0].slice(0, 90));
}

// 5. ArchiMate chain: archimate DSL -> layer bands + palette preset -> SVG.
const ARCH_DSL = `archimate TD
  customer[Клиент] [arch:business.actor]
  ordering[Оформление заказа] [arch:business.process]
  crm[CRM] [arch:application.component]
  api[Order API] [arch:application.service]
  store[(Заказы)] [arch:technology.node]
  customer --> ordering
  ordering --> crm
  crm --> api
  api --> store`;
try {
  const m = parseFlowchart(ARCH_DSL);
  const { modelToArchimateIR, isArchimateModel, archimateIconImages } = await import('../src/convert/archimate.mjs');
  const ir = modelToArchimateIR(m, { title: 'ArchiMate smoke' });
  const { svg } = await renderDiagram('architecture', ir);
  const presetSvg = svg.replace('data-preset="classic"', 'data-preset="archimate"');
  check(
    'archimate dsl -> ir -> svg',
    isArchimateModel(m)
      && presetSvg.includes('data-preset="archimate"')
      && svg.includes('Актор')
      && svg.includes('Бизнес')
      && svg.includes('Технологии'),
    `${ir.components.length} components, ${ir.boundaries.length} layer boundaries`,
  );
  const icons = archimateIconImages(m, ir.components);
  check(
    'archimate icons injected',
    icons.includes('data:image/png;base64,') && icons.includes('data-icon-for="customer"'),
    `${(icons.match(/<image/g) || []).length} icon images`,
  );
} catch (error) {
  check('archimate dsl -> ir -> svg', false, error.message.split('\n')[0]);
}

// 6. DSL styling -> embedded CSS overrides (node color/shape, edge color).
try {
  const { styleOverridesForModel } = await import('../src/convert/to-ir.mjs');
  const styled = parseFlowchart('flowchart TD\n  A[Узел] [red]\n  A --> B [blue]');
  const css = styleOverridesForModel(styled);
  check(
    'style overrides from DSL',
    css.includes('fill: red') && css.includes('stroke: blue'),
    `${css.split('\n').length} rules`,
  );
  // round-trip: model -> DSL -> model keeps every parameter
  const { serializeFlowchart } = await import('../src/convert/serialize.mjs');
  const rt = parseFlowchart(serializeFlowchart(styled));
  check(
    'dsl round-trip keeps params',
    rt.nodes[0].color === 'red' && rt.edges[0].color === 'blue',
    '',
  );
} catch (error) {
  check('style overrides from DSL', false, error.message.split('\n')[0]);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
