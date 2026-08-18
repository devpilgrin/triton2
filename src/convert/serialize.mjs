// Ported from triton-diagram-editor (devpilgrin, MIT): apps/web/src/mermaid/serialize.ts
import { wrapLabel } from './shapes.mjs';

function nodeBrackets(node) {
  const parts = [];
  if (node.color) parts.push(`[${node.color}]`);
  if (node.pin) parts.push(`[pin=${Math.round(node.pin.x)},${Math.round(node.pin.y)}]`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function edgeArrow(edge) {
  const hasBackHead = edge.direction === 'backward' || edge.direction === 'both';
  const hasFwdHead = edge.direction !== 'backward';
  const label = edge.label ?? '';
  return `${hasBackHead ? '<' : ''}-${label}-${hasFwdHead ? '>' : ''}`;
}

function edgeBrackets(edge) {
  const parts = [];
  if (edge.color) parts.push(`[${edge.color}]`);
  if (edge.lineStyle === 'dashed') parts.push('[--]');
  if (edge.lineStyle === 'dashdot') parts.push('[-.-]');
  return parts.length ? ` ${parts.join(' ')}` : '';
}

export function serializeFlowchart(model) {
  const lines = [`flowchart ${model.direction}`];

  for (const node of model.nodes) {
    lines.push(`  ${node.id}${wrapLabel(node.label, node.shape)}${nodeBrackets(node)}`);
  }
  for (const edge of model.edges) {
    lines.push(`  ${edge.source} ${edgeArrow(edge)} ${edge.target}${edgeBrackets(edge)}`);
  }

  return lines.join('\n');
}
