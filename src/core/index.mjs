// Triton 2 core public API.
// Runs identically in Node (CLI, tests) and in the browser bundle
// (dist/triton2-core.browser.mjs, built by src/core/build.mjs).
//
//   renderDiagram('workflow', ir) -> { svg, cards, meta }
//   validateDiagram('workflow', ir) -> { ok, diagnostics }
//
// The vendored archify renderers throw on invalid input; validateDiagram
// converts those throws into a structured result for editor diagnostics.
import { renderArchitecture } from '../../vendor/archify/renderers/architecture/render-architecture.mjs';
import { renderWorkflow } from '../../vendor/archify/renderers/workflow/render-workflow.mjs';
import { renderSequence } from '../../vendor/archify/renderers/sequence/render-sequence.mjs';
import { renderDataflow } from '../../vendor/archify/renderers/dataflow/render-dataflow.mjs';
import { renderLifecycle } from '../../vendor/archify/renderers/lifecycle/render-lifecycle.mjs';

export const DIAGRAM_TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];

const RENDERERS = {
  architecture: renderArchitecture,
  workflow: renderWorkflow,
  sequence: renderSequence,
  dataflow: renderDataflow,
  lifecycle: renderLifecycle,
};

export async function renderDiagram(diagramType, diagram, { template = null, outPath = null, sourceEvidence = null } = {}) {
  const render = RENDERERS[diagramType];
  if (!render) throw new Error(`renderDiagram: unknown diagram type ${JSON.stringify(diagramType)}`);
  return render({ diagram, template, outPath, sourceEvidence });
}

export async function validateDiagram(diagramType, diagram) {
  const render = RENDERERS[diagramType];
  if (!render) throw new Error(`validateDiagram: unknown diagram type ${JSON.stringify(diagramType)}`);
  try {
    await render({ diagram });
    return { ok: true, diagnostics: [] };
  } catch (error) {
    const diagnostics = Array.isArray(error?.archifyDiagnostics)
      ? error.archifyDiagnostics
      : [{
          code: 'render/failed',
          severity: 'error',
          message: error?.message || String(error),
          subject: { diagramType },
          evidence: {},
          supportedFixes: [],
        }];
    return { ok: false, diagnostics, error: error?.message || String(error) };
  }
}

// Triton DSL <-> IR conversion (re-exported so the browser bundle is one file).
export { parseFlowchart } from '../convert/parse.mjs';
export { serializeFlowchart } from '../convert/serialize.mjs';
export { modelToArchitectureIR } from '../convert/to-ir.mjs';

// Template helpers for browser-side standalone HTML export.
export { applyTemplate, renderCards } from '../../vendor/archify/renderers/shared/utils.mjs';
