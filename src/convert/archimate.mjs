// DiagramModel (archimate notation) -> archify architecture IR.
//
// ArchiMate is carried on top of the architecture renderer: each ArchiMate
// layer maps 1:1 to an archify component type purely as a CSS-class carrier,
// and the `archimate` visual preset (src/editor/archimate-preset.mjs)
// redefines those classes to the canonical ArchiMate palette. Element kinds
// land in sublabel, the aspect (active/behavior/passive) in the node variant.
import { buildConnections } from './to-ir.mjs';

// Canonical layer order top-to-bottom, mapped to the archify type that carries
// its color in the archimate preset.
export const ARCHIMATE_LAYERS = {
  strategy: { order: 0, type: 'cloud', label: 'Стратегия' },
  business: { order: 1, type: 'external', label: 'Бизнес' },
  application: { order: 2, type: 'backend', label: 'Приложение' },
  technology: { order: 3, type: 'database', label: 'Технологии' },
  physical: { order: 4, type: 'messagebus', label: 'Физический' },
  motivation: { order: 5, type: 'security', label: 'Мотивация' },
};

// ArchiMate element kinds (per layer) with their aspect and RU caption.
const ELEMENT_ASPECT = {
  // active structure
  actor: 'active', role: 'active', collaboration: 'active', component: 'active',
  node: 'active', device: 'active', stakeholder: 'active', resource: 'active',
  // behavior
  process: 'behavior', function: 'behavior', service: 'behavior', event: 'behavior',
  interaction: 'behavior', capability: 'behavior', courseofaction: 'behavior',
  valuestream: 'behavior',
  // passive structure
  object: 'passive', dataobject: 'passive', artifact: 'passive', contract: 'passive',
  representation: 'passive', material: 'passive', outcome: 'passive', value: 'passive',
  // motivation core
  driver: 'behavior', assessment: 'behavior', goal: 'behavior', principle: 'behavior',
  requirement: 'behavior', constraint: 'passive', meaning: 'passive',
};

const ELEMENT_RU = {
  actor: 'Актор', role: 'Роль', collaboration: 'Коллаборация', component: 'Компонент',
  node: 'Узел', device: 'Устройство', stakeholder: 'Стейкхолдер', resource: 'Ресурс',
  process: 'Процесс', function: 'Функция', service: 'Сервис', event: 'Событие',
  interaction: 'Взаимодействие', capability: 'Способность', courseofaction: 'Курс действий',
  valuestream: 'Поток ценности', object: 'Объект', dataobject: 'Объект данных',
  artifact: 'Артефакт', contract: 'Контракт', representation: 'Представление',
  material: 'Материал', outcome: 'Результат', value: 'Ценность', driver: 'Драйвер',
  assessment: 'Оценка', goal: 'Цель', principle: 'Принцип', requirement: 'Требование',
  constraint: 'Ограничение', meaning: 'Смысл', element: 'Элемент',
};

const ASPECT_VARIANT = { active: 'default', behavior: 'emphasis', passive: 'dashed' };

const NODE_W = 170;
const NODE_H = 64;
const COLS_PER_LAYER = 4;
const GAP_COL = 220;
const GAP_ROW = 120;
const BAND_GAP = 70;
const MARGIN_X = 50;
const MARGIN_Y = 90;

export function modelToArchimateIR(model, { title = 'ArchiMate diagram', animation } = {}) {
  const fallback = ARCHIMATE_LAYERS.application;
  const annotated = model.nodes.filter((n) => n.archimate);
  const plain = model.nodes.filter((n) => !n.archimate);

  // Group by layer in canonical order; nodes without [arch:...] go to the
  // application band so nothing disappears from the canvas.
  const bands = new Map();
  for (const node of model.nodes) {
    const layerKey = node.archimate ? node.archimate.layer : 'application';
    const layer = ARCHIMATE_LAYERS[layerKey] || fallback;
    if (!bands.has(layer.order)) bands.set(layer.order, { layer, nodes: [] });
    bands.get(layer.order).nodes.push(node);
  }
  const orderedBands = [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([, band]) => band);

  const components = [];
  const boundaries = [];
  const legendEntries = {};
  let bandY = MARGIN_Y;

  for (const band of orderedBands) {
    band.nodes.forEach((node, index) => {
      const col = index % COLS_PER_LAYER;
      const row = Math.floor(index / COLS_PER_LAYER);
      const autoPos = [MARGIN_X + col * GAP_COL, bandY + row * GAP_ROW];
      const pos = node.pin ? [node.pin.x, node.pin.y] : autoPos;
      const kind = node.archimate?.element || 'element';
      components.push({
        id: node.id,
        type: band.layer.type,
        label: node.label,
        // aspect (active/behavior/passive) rides in the caption; the
        // architecture schema reserves `variant` for connections only.
        sublabel: ELEMENT_RU[kind] || kind,
        pos,
        size: [NODE_W, NODE_H],
      });
    });
    const rows = Math.ceil(band.nodes.length / COLS_PER_LAYER);
    const memberIds = band.nodes.map((n) => n.id);
    if (memberIds.length > 1) {
      boundaries.push({ kind: 'region', label: band.layer.label, wraps: memberIds });
    }
    legendEntries[band.layer.type] = { label: band.layer.label, visible: true };
    bandY += rows * GAP_ROW + BAND_GAP;
  }

  // All 7 carrier types must be declared in the legend override map or the
  // renderer prints default English labels for present kinds.
  const connections = buildConnections(model.edges, components);

  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title,
      ...(animation === 'trace' ? { animation: 'trace' } : {}),
      legend: { mode: 'auto', entries: legendEntries },
    },
    components,
    connections,
    boundaries,
  };
}

/** Marker for the editor/exporter: archimate models render with this preset. */
export const ARCHIMATE_PRESET = 'archimate';

export function isArchimateModel(model) {
  return model.notation === 'archimate' || model.nodes.some((n) => n.archimate);
}
