// Triton 2 editor — code pane + archify SVG canvas, two-way sync via DSL.
// Runs fully client-side; when served by `triton2 edit`, saving writes the
// source file through the local server.
import {
  parseFlowchart,
  serializeFlowchart,
  modelToArchitectureIR,
  renderDiagram,
  applyTemplate,
  renderCards,
} from '../dist/triton2-core.browser.mjs';
import { recordMotion } from './motion.mjs';

const $ = (id) => document.getElementById(id);
const els = {
  code: $('code'),
  canvas: $('canvas'),
  viewport: $('viewport'),
  wrap: $('canvas-wrap'),
  status: $('status'),
  fileName: $('file-name'),
  props: $('props'),
  propsTitle: $('props-title'),
  propsLabel: $('props-label'),
  propsLink: $('props-link'),
  propsUnpin: $('props-unpin'),
  propsDelete: $('props-delete'),
  direction: $('sel-direction'),
  export: $('sel-export'),
  zoomLevel: $('zoom-level'),
  helpModal: $('help-modal'),
  anim: $('btn-anim'),
};

const SAMPLE = `flowchart TD
  client[Клиент] --> api[API Gateway]
  api --> auth{Авторизован?}
  auth -Да-> svc[Сервис]
  auth -Нет-> deny([Отказ 401])
  svc --> db[(База данных)]
  svc --> log[Журнал] [--]`;

const state = {
  text: SAMPLE,
  server: null, // { name } when served by `triton2 edit`
  selectedNodeId: null,
  selectedEdgeId: null,
  linkSourceId: null,
  theme: 'dark',
  anim: localStorage.getItem('triton2-anim') === '1',
  templateText: '',
  templateStyle: '',
  lastIr: null,
};

// Canvas viewport: pan (x/y, px) + zoom (scale). Until the user zooms or pans
// manually, every render auto-fits the diagram into the visible area.
const view = { scale: 1, x: 0, y: 0, userZoomed: false };
let justPanned = false;

function applyView() {
  els.viewport.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  els.zoomLevel.textContent = `${Math.round(view.scale * 100)}%`;
}

function fitView() {
  const svg = els.canvas.querySelector('svg');
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const rect = els.wrap.getBoundingClientRect();
  const pad = 48; // viewport padding, both sides
  const scale = Math.min((rect.width - pad) / vb.width, (rect.height - pad) / vb.height);
  view.scale = Math.min(2.5, Math.max(0.05, scale));
  view.x = (rect.width - vb.width * view.scale) / 2;
  view.y = (rect.height - vb.height * view.scale) / 2;
  view.userZoomed = false;
  applyView();
}

function zoomAt(clientX, clientY, factor, user = true) {
  const rect = els.wrap.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const next = Math.min(6, Math.max(0.1, view.scale * factor));
  const k = next / view.scale;
  view.x = px - (px - view.x) * k;
  view.y = py - (py - view.y) * k;
  view.scale = next;
  if (user) view.userZoomed = true;
  applyView();
}

function wrapCenter() {
  const rect = els.wrap.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ---------- helpers ----------

function setStatus(text, kind = '') {
  els.status.className = kind;
  els.status.textContent = text;
}

function model() {
  return parseFlowchart(state.text);
}

// Serialize the model back to the code pane (canonical form — the same
// contract as triton-diagram-editor: any canvas mutation rewrites the text).
function commitModel(next) {
  state.text = serializeFlowchart(next);
  els.code.value = state.text;
  els.direction.value = next.direction === 'LR' ? 'LR' : 'TB';
  render();
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.__lastExport = { name: filename, size: blob.size, type: blob.type };
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function updateAnimButton() {
  els.anim.textContent = state.anim ? '⏸ Анимация' : '▶ Анимация';
  els.anim.classList.toggle('primary', state.anim);
  // The viewer's Motion Governor gates trace CSS behind these html attributes;
  // the editor plays motion whenever the author toggled it on.
  const html = document.documentElement;
  if (state.anim) {
    html.setAttribute('data-motion-capable', 'true');
    html.setAttribute('data-ambient-motion', 'running');
  } else {
    html.removeAttribute('data-ambient-motion');
  }
}

// ---------- render ----------

async function render() {
  const m = model();
  try {
    const ir = modelToArchitectureIR(m, {
      title: state.server?.name || 'Triton 2',
      animation: state.anim ? 'trace' : undefined,
    });
    const { svg } = await renderDiagram('architecture', ir);
    state.lastIr = ir;
    els.canvas.innerHTML = svg;
    wireCanvas();
    applySelection();
    if (view.userZoomed) applyView();
    else fitView();
    setStatus(`OK — ${m.nodes.length} узлов, ${m.edges.length} рёбер`, 'ok');
  } catch (error) {
    const diagnostics = Array.isArray(error?.archifyDiagnostics)
      ? error.archifyDiagnostics.map((d) => `• ${d.message}`).join('\n')
      : error.message;
    setStatus(diagnostics, 'error');
  }
}

function applySelection() {
  els.canvas.querySelectorAll('g.selected').forEach((g) => g.classList.remove('selected'));
  if (state.selectedNodeId) {
    els.canvas.querySelector(`g[data-node-id="${CSS.escape(state.selectedNodeId)}"]`)
      ?.classList.add('selected');
  }
  const hasNode = Boolean(state.selectedNodeId);
  const hasEdge = Boolean(state.selectedEdgeId);
  els.props.classList.toggle('visible', hasNode || hasEdge);
  if (hasNode) {
    const node = model().nodes.find((n) => n.id === state.selectedNodeId);
    els.propsTitle.textContent = `Узел: ${state.selectedNodeId}`;
    els.propsLabel.value = node?.label ?? '';
    els.propsLink.style.display = '';
    els.propsUnpin.style.display = '';
  } else if (hasEdge) {
    const edge = model().edges.find((e) => e.id === state.selectedEdgeId);
    els.propsTitle.textContent = `Связь: ${edge?.source} → ${edge?.target}`;
    els.propsLabel.value = edge?.label ?? '';
    els.propsLink.style.display = 'none';
    els.propsUnpin.style.display = 'none';
  }
}

// ---------- canvas interaction ----------

function svgPoint(event) {
  const svg = els.canvas.querySelector('svg');
  if (!svg) return { x: 0, y: 0 };
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

function wireCanvas() {
  const svg = els.canvas.querySelector('svg');
  if (!svg) return;

  svg.addEventListener('click', (event) => {
    if (justPanned) { justPanned = false; return; }
    if (event.target === svg) {
      state.selectedNodeId = null;
      state.selectedEdgeId = null;
      state.linkSourceId = null;
      applySelection();
    }
  });

  // Edges: click to select.
  svg.querySelectorAll('[data-edge-id]').forEach((edgeEl) => {
    edgeEl.style.cursor = 'pointer';
    edgeEl.addEventListener('click', (event) => {
      event.stopPropagation();
      state.selectedEdgeId = edgeEl.getAttribute('data-edge-id');
      state.selectedNodeId = null;
      applySelection();
    });
  });

  // Nodes: click selects (or completes a pending link), drag pins the node.
  svg.querySelectorAll('g[data-node-id]').forEach((g) => {
    g.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = g.getAttribute('data-node-id');
      if (state.linkSourceId && state.linkSourceId !== id) {
        addEdge(state.linkSourceId, id);
        state.linkSourceId = null;
        return;
      }
      state.selectedNodeId = id;
      state.selectedEdgeId = null;
      applySelection();
    });

    g.addEventListener('pointerdown', (event) => {
      const id = g.getAttribute('data-node-id');
      const irNode = state.lastIr?.components.find((c) => c.id === id);
      if (!irNode) return;
      const start = svgPoint(event);
      const grabOffset = { x: start.x - irNode.pos[0], y: start.y - irNode.pos[1] };
      let moved = false;

      const onMove = (moveEvent) => {
        const current = svgPoint(moveEvent);
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        g.setAttribute('transform', `translate(${dx} ${dy})`);
      };
      const onUp = (upEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) return; // a click, not a drag — selection handled by click
        const drop = svgPoint(upEvent);
        pinNode(id, Math.round(drop.x - grabOffset.x), Math.round(drop.y - grabOffset.y));
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

// ---------- model mutations ----------

function pinNode(id, x, y) {
  const m = model();
  commitModel({
    ...m,
    nodes: m.nodes.map((n) => (n.id === id ? { ...n, pin: { x, y } } : n)),
  });
}

function addNode() {
  const m = model();
  const ids = new Set(m.nodes.map((n) => n.id));
  let i = ids.size + 1;
  while (ids.has(`n${i}`)) i += 1;
  commitModel({ ...m, nodes: [...m.nodes, { id: `n${i}`, label: 'Новый узел', shape: 'rect' }] });
  state.selectedNodeId = `n${i}`;
  applySelection();
}

function addEdge(source, target) {
  const m = model();
  if (m.edges.some((e) => e.source === source && e.target === target)) return;
  commitModel({
    ...m,
    edges: [...m.edges, { id: `e${m.edges.length}-${source}-${target}`, source, target }],
  });
}

function renameSelected(label) {
  const m = model();
  if (state.selectedNodeId) {
    commitModel({
      ...m,
      nodes: m.nodes.map((n) => (n.id === state.selectedNodeId ? { ...n, label } : n)),
    });
  } else if (state.selectedEdgeId) {
    commitModel({
      ...m,
      edges: m.edges.map((e) =>
        e.id === state.selectedEdgeId ? { ...e, label: label.trim() || undefined } : e),
    });
  }
}

function deleteSelected() {
  const m = model();
  if (state.selectedNodeId) {
    const id = state.selectedNodeId;
    state.selectedNodeId = null;
    commitModel({
      ...m,
      nodes: m.nodes.filter((n) => n.id !== id),
      edges: m.edges.filter((e) => e.source !== id && e.target !== id),
    });
  } else if (state.selectedEdgeId) {
    const id = state.selectedEdgeId;
    state.selectedEdgeId = null;
    commitModel({ ...m, edges: m.edges.filter((e) => e.id !== id) });
  }
}

function unpinSelected() {
  if (!state.selectedNodeId) return;
  const id = state.selectedNodeId;
  const m = model();
  commitModel({
    ...m,
    nodes: m.nodes.map((n) => (n.id === id ? { ...n, pin: undefined } : n)),
  });
}

// ---------- export ----------

function styledStandaloneSvg() {
  const svg = els.canvas.querySelector('svg');
  if (!svg) throw new Error('нет отрендеренной диаграммы');
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('data-theme', state.theme);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = state.templateStyle;
  clone.insertBefore(style, clone.firstChild);
  // Solid backdrop: the template page background does not exist in standalone SVG.
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const vb = svg.viewBox.baseVal;
  bg.setAttribute('x', vb.x);
  bg.setAttribute('y', vb.y);
  bg.setAttribute('width', vb.width);
  bg.setAttribute('height', vb.height);
  bg.setAttribute('fill', state.theme === 'dark' ? '#0b0e14' : '#f5f6f8');
  style.after(bg);
  return new XMLSerializer().serializeToString(clone);
}

async function exportDiagram(kind) {
  els.export.value = '';
  const base = (state.server?.name || 'diagram').replace(/\.[^.]+$/, '');
  try {
    if (kind === 'webm' || kind === 'apng') {
      const svg = els.canvas.querySelector('svg');
      if (!svg || svg.getAttribute('data-animation') !== 'trace') {
        setStatus('Включите анимацию (кнопка «▶ Анимация») перед экспортом движения', 'error');
        return;
      }
      setStatus(`Запись ${kind.toUpperCase()}… ~6 секунд`, '');
      const blob = await recordMotion(svg, {
        format: kind,
        backgroundSvgText: styledStandaloneSvg(),
      });
      download(blob, `${base}.${kind}`);
    } else if (kind === 'svg') {
      download(new Blob([styledStandaloneSvg()], { type: 'image/svg+xml' }), `${base}.svg`);
    } else if (kind === 'png') {
      const svgText = styledStandaloneSvg();
      const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('не удалось растеризовать SVG'));
        image.src = svgUrl;
      });
      const svg = els.canvas.querySelector('svg');
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = svg.viewBox.baseVal.width * scale;
      canvas.height = svg.viewBox.baseVal.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas.toBlob вернул null');
      download(blob, `${base}.png`);
    } else if (kind === 'html') {
      const ir = state.lastIr;
      const { svg, cards } = await renderDiagram('architecture', ir);
      const html = applyTemplate(state.templateText, {
        title: ir.meta.title,
        subtitle: undefined,
        svg,
        cards: renderCards(cards || []),
        visualPreset: 'classic',
        guidedViews: [],
        sourceEvidence: null,
      });
      download(new Blob([html], { type: 'text/html' }), `${base}.html`);
    }
    setStatus(`Экспортировано: ${base}.${kind}`, 'ok');
  } catch (error) {
    setStatus(`Экспорт не удался: ${error.message}`, 'error');
  }
}

// ---------- server integration ----------

async function detectServer() {
  try {
    const response = await fetch('/api/file');
    if (!response.ok) return;
    const data = await response.json();
    state.server = { name: data.name };
    state.text = data.text;
    els.fileName.textContent = data.name;
  } catch {
    // static mode — no file backend
  }
}

async function save() {
  if (state.server) {
    const response = await fetch('/api/file', { method: 'POST', body: state.text });
    setStatus(response.ok ? `Сохранено: ${state.server.name}` : 'Ошибка сохранения', response.ok ? 'ok' : 'error');
  } else {
    download(new Blob([state.text], { type: 'text/plain' }), 'diagram.dsl');
    setStatus('Скачан diagram.dsl (статический режим — файлового сервера нет)', 'ok');
  }
}

// ---------- wiring ----------

let debounce = 0;
els.code.addEventListener('input', () => {
  state.text = els.code.value;
  clearTimeout(debounce);
  debounce = setTimeout(render, 350);
});

els.direction.addEventListener('change', () => {
  const m = model();
  view.userZoomed = false; // layout shape changed radically — refit
  commitModel({ ...m, direction: els.direction.value });
});

// Pan: drag on empty canvas (not on nodes, props, or zoom controls).
els.wrap.addEventListener('pointerdown', (event) => {
  if (event.target.closest('g[data-node-id]') || event.target.closest('#props')
      || event.target.closest('#zoom-controls')) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const baseX = view.x;
  const baseY = view.y;
  let moved = false;
  const onMove = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    justPanned = true;
    els.wrap.classList.add('panning');
    view.x = baseX + dx;
    view.y = baseY + dy;
    view.userZoomed = true;
    applyView();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    els.wrap.classList.remove('panning');
    if (!moved) justPanned = false;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

// Wheel zoom at cursor.
els.wrap.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

// Zoom control buttons.
$('zoom-in').addEventListener('click', () => {
  const c = wrapCenter();
  zoomAt(c.x, c.y, 1.25);
});
$('zoom-out').addEventListener('click', () => {
  const c = wrapCenter();
  zoomAt(c.x, c.y, 0.8);
});
els.zoomLevel.addEventListener('click', () => {
  const svg = els.canvas.querySelector('svg');
  const rect = els.wrap.getBoundingClientRect();
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  view.scale = 1;
  view.x = (rect.width - vb.width) / 2;
  view.y = (rect.height - vb.height) / 2;
  view.userZoomed = true;
  applyView();
});
$('zoom-fit').addEventListener('click', fitView);

// Help modal.
$('btn-help').addEventListener('click', () => { els.helpModal.hidden = false; });
$('help-close').addEventListener('click', () => { els.helpModal.hidden = true; });
els.helpModal.addEventListener('click', (event) => {
  if (event.target === els.helpModal) els.helpModal.hidden = true;
});
$('help-example').addEventListener('click', () => {
  state.text = SAMPLE;
  els.code.value = SAMPLE;
  els.helpModal.hidden = true;
  view.userZoomed = false;
  render();
});

$('btn-theme').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
});

els.anim.addEventListener('click', () => {
  state.anim = !state.anim;
  localStorage.setItem('triton2-anim', state.anim ? '1' : '0');
  updateAnimButton();
  render();
});

$('btn-add-node').addEventListener('click', addNode);
$('btn-save').addEventListener('click', save);
els.export.addEventListener('change', () => exportDiagram(els.export.value));

els.propsLabel.addEventListener('change', () => renameSelected(els.propsLabel.value));
els.propsDelete.addEventListener('click', deleteSelected);
els.propsUnpin.addEventListener('click', unpinSelected);
els.propsLink.addEventListener('click', () => {
  state.linkSourceId = state.selectedNodeId;
  setStatus(`Режим связи: кликните целевой узел (источник: ${state.linkSourceId})`, 'ok');
});

// ---------- init ----------

async function init() {
  const templateText = await fetch('../vendor/archify/assets/template.html').then((r) => r.text());
  state.templateText = templateText;
  state.templateStyle = templateText.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  const style = document.createElement('style');
  style.textContent = state.templateStyle;
  document.head.appendChild(style);

  await detectServer();
  els.code.value = state.text;
  els.direction.value = model().direction === 'LR' ? 'LR' : 'TB';
  updateAnimButton();
  render();
}

init();
