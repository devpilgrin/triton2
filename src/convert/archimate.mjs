// DiagramModel (archimate notation) -> archify architecture IR.
//
// ArchiMate is carried on top of the architecture renderer: each ArchiMate
// layer maps 1:1 to an archify component type purely as a CSS-class carrier,
// and the `archimate` visual preset (archimate-preset.mjs) redefines those
// classes to the canonical ArchiMate palette. Element kinds land in sublabel
// and drive the corner icon (archimate-icons.mjs, from the Archi tool, MIT).
import { buildConnections } from './to-ir.mjs';
import { archimateIconDataUrl } from './archimate-icons.mjs';

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

// Element kinds per layer with RU captions. Icon lookup:
// archimateIconDataUrl(layer, element).
export const LAYER_ELEMENTS = {
  business: {
    actor: 'Актор', role: 'Роль', collaboration: 'Коллаборация', interface: 'Интерфейс',
    process: 'Процесс', function: 'Функция', interaction: 'Взаимодействие', event: 'Событие',
    service: 'Сервис', object: 'Объект', contract: 'Контракт', representation: 'Представление',
    product: 'Продукт',
  },
  application: {
    component: 'Компонент', collaboration: 'Коллаборация', interface: 'Интерфейс',
    function: 'Функция', interaction: 'Взаимодействие', process: 'Процесс', event: 'Событие',
    service: 'Сервис', dataobject: 'Объект данных',
  },
  technology: {
    node: 'Узел', device: 'Устройство', systemsoftware: 'Системное ПО',
    collaboration: 'Коллаборация', interface: 'Интерфейс', path: 'Путь',
    communicationnetwork: 'Сеть связи', function: 'Функция', process: 'Процесс',
    interaction: 'Взаимодействие', event: 'Событие', service: 'Сервис', artifact: 'Артефакт',
  },
  motivation: {
    stakeholder: 'Стейкхолдер', driver: 'Драйвер', assessment: 'Оценка', goal: 'Цель',
    outcome: 'Результат', principle: 'Принцип', requirement: 'Требование',
    constraint: 'Ограничение', value: 'Ценность', meaning: 'Смысл',
  },
  strategy: {
    resource: 'Ресурс', capability: 'Способность', courseofaction: 'Курс действий',
    valuestream: 'Поток ценности',
  },
  physical: {
    equipment: 'Оборудование', facility: 'Площадка',
    distributionnetwork: 'Сеть распределения', material: 'Материал',
  },
};

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

  // Group by layer in canonical order; nodes without [arch:...] go to the
  // application band so nothing disappears from the canvas.
  const bands = new Map();
  for (const node of model.nodes) {
    const layerKey = node.archimate ? node.archimate.layer : 'application';
    const layer = ARCHIMATE_LAYERS[layerKey] || fallback;
    if (!bands.has(layer.order)) bands.set(layer.order, { layer, layerKey, nodes: [] });
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
      const layerKey = node.archimate?.layer || 'application';
      const kind = node.archimate?.element || 'element';
      components.push({
        id: node.id,
        type: band.layer.type,
        label: node.label,
        sublabel: LAYER_ELEMENTS[layerKey]?.[kind] || kind,
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

/** Absolute-positioned icon images appended before </svg>: ArchiMate puts the
 * element icon in the node's top-right corner. Pure string surgery — no group
 * parsing — so it works identically on the live DOM and on CLI output. */
export function archimateIconImages(model, components) {
  const byId = new Map(
    model.nodes.filter((n) => n.archimate).map((n) => [n.id, n.archimate]),
  );
  return components
    .map((c) => {
      const a = byId.get(c.id);
      const url = a && archimateIconDataUrl(a.layer, a.element);
      if (!url) return '';
      return `<image href="${url}" x="${c.pos[0] + c.size[0] - 18}" y="${c.pos[1] + 4}" width="14" height="14" data-icon-for="${c.id}"/>`;
    })
    .filter(Boolean)
    .join('\n');
}

/** Marker for the editor/exporter: archimate models render with this preset. */
export const ARCHIMATE_PRESET = 'archimate';

export function isArchimateModel(model) {
  return model.notation === 'archimate' || model.nodes.some((n) => n.archimate);
}
