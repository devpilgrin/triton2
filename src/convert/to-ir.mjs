// DiagramModel (Triton DSL) -> archify architecture IR.
//
// The DSL carries no coordinates except explicit pins, so unpinned nodes get a
// simple layered placement (longest-path depth = column for TB/BT, row for
// LR/RL). This is a deliberate spike stand-in for the ELK layout that V1 will
// reuse from triton-diagram-editor; archify's validator stays the authority on
// composition quality.

const NODE_W = 150;
const NODE_H = 64;
const GAP_COL = 220;
const GAP_ROW = 130;
const MARGIN_X = 40;
const MARGIN_Y = 90;

export function layerDepths(model) {
  // Layered placement tolerant to feedback edges (e.g. "D --> B" retry loops).
  // A plain longest-path pass inflates depths around cycles; instead, place a
  // node only once all its already-placed predecessors are known, and force
  // the best-connected remaining node when a cycle stalls the wave.
  const depth = new Map();
  const incoming = new Map(model.nodes.map((n) => [n.id, []]));
  for (const edge of model.edges) {
    if (incoming.has(edge.target) && edge.source !== edge.target) {
      incoming.get(edge.target).push(edge.source);
    }
  }

  let remaining = model.nodes.map((n) => n.id);
  while (remaining.length) {
    let progressed = false;
    const stillWaiting = [];
    for (const id of remaining) {
      const sources = incoming.get(id) || [];
      const placed = sources.filter((src) => depth.has(src));
      if (placed.length === sources.length) {
        depth.set(id, sources.length ? Math.max(...sources.map((src) => depth.get(src))) + 1 : 0);
        progressed = true;
      } else if (placed.length > 0) {
        stillWaiting.push({ id, placed });
      } else {
        stillWaiting.push({ id, placed });
      }
    }
    if (!progressed) {
      // Cycle stall: force-place the node with the most placed sources,
      // ignoring the feedback edges that point back into the unplaced set.
      stillWaiting.sort((a, b) => b.placed.length - a.placed.length);
      const { id, placed } = stillWaiting[0];
      depth.set(id, placed.length ? Math.max(...placed.map((src) => depth.get(src))) + 1 : 0);
      progressed = true;
    }
    remaining = stillWaiting.map((entry) => entry.id).filter((id) => !depth.has(id));
    if (!progressed) break;
  }
  return depth;
}

// Edges -> archify connections, with label anchors placed beside the route
// (archify validates label geometry strictly). Shared by the flowchart and
// ArchiMate converters.
export function buildConnections(edges, components) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const center = (c) => [c.pos[0] + c.size[0] / 2, c.pos[1] + c.size[1] / 2];

  return edges.map((edge) => {
    const conn = {
      id: edge.id,
      from: edge.source,
      to: edge.target,
      ...(edge.lineStyle === 'dashed' || edge.lineStyle === 'dashdot' ? { variant: 'dashed' } : {}),
    };
    if (!edge.label) return conn;
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to) return { ...conn, label: edge.label };
    const [fx, fy] = center(from);
    const [tx, ty] = center(to);
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.hypot(dx, dy) || 1;
    const labelAt = [
      Math.round((fx + tx) / 2 + (-dy / len) * 26),
      Math.round((fy + ty) / 2 + (dx / len) * 26),
    ];
    return { ...conn, label: edge.label, labelAt };
  });
}

export function modelToArchitectureIR(model, { title = 'Triton 2 diagram', animation } = {}) {
  const depth = layerDepths(model);
  const perLayer = new Map();
  const horizontal = model.direction === 'LR' || model.direction === 'RL';

  const components = model.nodes.map((node) => {
    const layer = depth.get(node.id) ?? 0;
    const indexInLayer = perLayer.get(layer) ?? 0;
    perLayer.set(layer, indexInLayer + 1);

    const autoX = horizontal
      ? MARGIN_X + layer * GAP_COL
      : MARGIN_X + indexInLayer * GAP_COL;
    const autoY = horizontal
      ? MARGIN_Y + indexInLayer * GAP_ROW
      : MARGIN_Y + layer * GAP_ROW;

    const pos = node.pin ? [node.pin.x, node.pin.y] : [autoX, autoY];
    return {
      id: node.id,
      type: 'backend',
      label: node.label,
      pos,
      size: [NODE_W, NODE_H],
    };
  });

  // Archify validates label geometry strictly; an unlabeled default label
  // position can land on the source node when the auto layout packs nodes
  // tightly. buildConnections gives every labeled edge an explicit anchor.
  const connections = buildConnections(model.edges, components);

  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title, ...(animation === 'trace' ? { animation: 'trace' } : {}) },
    components,
    connections,
  };
}
