// Ported from triton-diagram-editor (devpilgrin, MIT): apps/web/src/mermaid/parse.ts
import { matchNodeRef } from './shapes.mjs';
import { resolveColorName, resolveLineStyleWord } from './keywords.mjs';

const HEADER_RE = /^\s*(flowchart|graph|archimate)\s+(TB|TD|BT|LR|RL)\s*;?\s*$/i;

function normalizeDirection(raw) {
  const upper = raw.toUpperCase();
  return upper === 'TD' ? 'TB' : upper;
}

// ArchiMate element annotation: [arch:layer.element] or [arch:layer].
const ARCHIMATE_RE = /^arch:([a-z]+)(?:\.([a-z]+))?$/i;

// Unified arrow: optional "<" (arrowhead at source), a dash, an inline label
// made of anything but dashes, another dash, optional ">" (arrowhead at
// target). Covers "-->", "<--", "<-->", "-Label->", "<-Label->", "<-Label-".
const ARROW_RE = /^(<)?-([^-]*)-(>)?/;

function matchArrow(text) {
  const s = text.trimStart();
  const leadingWs = text.length - s.length;

  if (s.startsWith('-.->')) {
    return { rest: text.slice(leadingWs + 4), direction: 'forward', lineStyle: 'dashed' };
  }
  if (s.startsWith('==>')) {
    return { rest: text.slice(leadingWs + 3), direction: 'forward' };
  }

  const spacedLabel = /^--\s+(.+?)\s+-->/.exec(s);
  if (spacedLabel) {
    return {
      label: spacedLabel[1],
      direction: 'forward',
      rest: text.slice(leadingWs + spacedLabel[0].length),
    };
  }

  const m = ARROW_RE.exec(s);
  if (!m) return null;
  const [full, backHead, rawLabel, fwdHead] = m;
  const label = rawLabel.trim() || undefined;
  const direction = backHead && fwdHead ? 'both' : backHead ? 'backward' : 'forward';
  return { label, direction, rest: text.slice(leadingWs + full.length) };
}

function matchPipeLabel(text) {
  const m = /^\s*\|([^|]*)\|/.exec(text);
  if (!m) return null;
  return { label: m[1].trim(), rest: text.slice(m[0].length) };
}

/** A dash/dot-only bracket ("[-]", "[--]", "[-.-]") or a line-style word in
 * Russian or English ("[dashed]", "[прерывистая]") sets line style; anything
 * else ("[Red]", "[красный]", "[#ff0000]") is a color, with Russian color
 * words resolved to their CSS name. Any number of brackets may follow, in
 * any order. */
function matchTrailingBrackets(text) {
  let rest = text;
  let color;
  let lineStyle;

  for (;;) {
    const m = /^\s*\[([^\]]*)\]/.exec(rest);
    if (!m) break;
    const content = m[1].trim();
    if (/^[-.]+$/.test(content)) {
      lineStyle = content.includes('.') ? 'dashdot' : content.length > 1 ? 'dashed' : 'solid';
    } else {
      const styleWord = resolveLineStyleWord(content);
      if (styleWord) {
        lineStyle = styleWord;
      } else if (content) {
        color = resolveColorName(content);
      }
    }
    rest = rest.slice(m[0].length);
  }
  return { color, lineStyle, rest };
}

/** Standalone node declarations only ("A[Label] [red] [pin=120,340]") — a
 * bare word/hex bracket is a color, "pin=x,y" fixes its canvas position.
 * Kept separate from edge trailing brackets so "A[Label] --> B[Label2] [red]"
 * unambiguously colors the edge, not node B. */
function matchNodeDeclBrackets(text) {
  let rest = text;
  let color;
  let pin;
  let archimate;

  for (;;) {
    const m = /^\s*\[([^\]]*)\]/.exec(rest);
    if (!m) break;
    const content = m[1].trim();
    const archMatch = ARCHIMATE_RE.exec(content);
    const pinMatch = /^pin\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/i.exec(content);
    if (archMatch) {
      archimate = {
        layer: archMatch[1].toLowerCase(),
        element: (archMatch[2] || 'element').toLowerCase(),
      };
    } else if (pinMatch) {
      pin = { x: Number(pinMatch[1]), y: Number(pinMatch[2]) };
    } else if (content) {
      color = resolveColorName(content);
    }
    rest = rest.slice(m[0].length);
  }
  return { color, pin, archimate, rest };
}

export function parseFlowchart(source) {
  const lines = source.split('\n');
  let direction = 'TB';
  let notation = 'flowchart';
  const nodeOrder = [];
  const nodes = new Map();
  const edges = [];
  let edgeCounter = 0;

  const upsertNode = (id, shape, label, color, pin, archimate) => {
    const existing = nodes.get(id);
    if (existing) {
      if (shape) existing.shape = shape;
      if (label !== undefined) existing.label = label;
      if (color !== undefined) existing.color = color;
      if (pin !== undefined) existing.pin = pin;
      if (archimate !== undefined) existing.archimate = archimate;
      return;
    }
    nodeOrder.push(id);
    nodes.set(id, { id, shape: shape ?? 'rect', label: label ?? id, color, pin, archimate });
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/%%.*$/, '').trim();
    if (!line) continue;

    if (HEADER_RE.test(line)) {
      const m = HEADER_RE.exec(line);
      direction = normalizeDirection(m[2]);
      notation = m[1].toLowerCase() === 'archimate' ? 'archimate' : 'flowchart';
      continue;
    }

    let current = matchNodeRef(line);
    if (!current) continue;

    // Brackets right after the *first* node on a line, before any arrow has
    // been seen, are unambiguous — no edge token exists yet at this position
    // — so they're always this node's own color/pin, e.g. "A[Start] [red] --> B".
    const leadingDecl = matchNodeDeclBrackets(current.rest);
    current = { ...current, rest: leadingDecl.rest };

    // A line may chain multiple arrows, e.g. "A --> B --> C". Walk the chain,
    // registering one edge per hop, so nothing after the first "-->" is dropped.
    let matchedAnyEdge = false;
    let isFirstHop = true;
    for (;;) {
      const arrow = matchArrow(current.rest);
      if (!arrow) break;

      let label = arrow.label;
      let rest = arrow.rest;
      if (label === undefined) {
        const pipe = matchPipeLabel(rest);
        if (pipe) {
          label = pipe.label;
          rest = pipe.rest;
        }
      }

      const next = matchNodeRef(rest);
      if (!next) break;

      const trailing = matchTrailingBrackets(next.rest);

      // leadingDecl belongs only to the very first node of the line — later
      // hops must not inherit its color/pin as `current` advances down the chain.
      upsertNode(
        current.id,
        current.shape,
        current.label,
        isFirstHop ? leadingDecl.color : undefined,
        isFirstHop ? leadingDecl.pin : undefined,
        isFirstHop ? leadingDecl.archimate : undefined,
      );
      upsertNode(next.id, next.shape, next.label);
      edges.push({
        id: `e${edgeCounter++}-${current.id}-${next.id}`,
        source: current.id,
        target: next.id,
        label,
        direction: arrow.direction === 'forward' ? undefined : arrow.direction,
        lineStyle: trailing.lineStyle ?? arrow.lineStyle,
        color: trailing.color,
      });
      matchedAnyEdge = true;
      isFirstHop = false;
      current = { ...next, rest: trailing.rest };
    }

    if (!matchedAnyEdge && current.rest.trim() === '') {
      // standalone node declaration, e.g. `A[Start] [red] [pin=120,340]`
      upsertNode(current.id, current.shape, current.label, leadingDecl.color, leadingDecl.pin, leadingDecl.archimate);
    }
  }

  return {
    direction,
    notation,
    nodes: nodeOrder.map((id) => nodes.get(id)),
    edges,
  };
}
