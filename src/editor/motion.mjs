// Motion capture for the editor: deterministic frame rendering of the archify
// trace animation onto a 2D canvas, then WebM (MediaRecorder) or APNG (UPNG).
// Ported from archify's viewer recordWebm (assets/template.html, MIT) and
// extended with the APNG path discussed for Triton 2.
import { UPNG } from '../../dist/triton2-core.browser.mjs';

const MOTION_DURATION = 6000;

function samplesFor(element, pointInRoot) {
  if (typeof element.getTotalLength !== 'function' || typeof element.getPointAtLength !== 'function') return [];
  let length;
  try { length = element.getTotalLength(); } catch { return []; }
  if (!Number.isFinite(length) || length <= 0) return [];
  const count = Math.max(12, Math.min(72, Math.ceil(length / 12)));
  const points = [];
  for (let i = 0; i <= count; i++) {
    points.push(pointInRoot(element, element.getPointAtLength((length * i) / count)));
  }
  return points;
}

function createMotionScene(root, vb) {
  const rootMatrix = root.getCTM ? root.getCTM() : null;

  function pointInRoot(element, point) {
    if (!rootMatrix || !element.getCTM || !point.matrixTransform) return { x: point.x, y: point.y };
    try {
      const elementMatrix = element.getCTM();
      if (!elementMatrix) return { x: point.x, y: point.y };
      const mapped = point.matrixTransform(rootMatrix.inverse().multiply(elementMatrix));
      return { x: mapped.x, y: mapped.y };
    } catch {
      return { x: point.x, y: point.y };
    }
  }

  const authoredStep = (element, fallback) => {
    const raw = element.style.getPropertyValue('--step') || getComputedStyle(element).getPropertyValue('--step');
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const edges = Array.prototype.slice.call(root.querySelectorAll('[data-animate="edge"]')).map((element, index) => {
    const computed = getComputedStyle(element);
    return {
      points: samplesFor(element, pointInRoot),
      color: computed.stroke && computed.stroke !== 'none' ? computed.stroke : '#22d3ee',
      width: Math.max(1.5, parseFloat(computed.strokeWidth) || 1.5),
      delay: Math.min(12, authoredStep(element, index)) * 0.16,
    };
  }).filter((edge) => edge.points.length > 1);

  const nodes = Array.prototype.slice.call(root.querySelectorAll('[data-node-id][data-animate="node"]')).map((element, index) => {
    let box;
    try { box = element.getBBox(); } catch { return null; }
    const painted = element.querySelector('[class*="c-"]') || element;
    const computed = getComputedStyle(painted);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      color: computed.stroke && computed.stroke !== 'none' ? computed.stroke : '#22d3ee',
      delay: Math.min(12, authoredStep(element, index)) * 0.16,
    };
  }).filter(Boolean);

  return { edges, nodes, x: vb.x, y: vb.y, width: vb.width, height: vb.height };
}

function pointAlong(points, progress) {
  const scaled = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * mix,
    y: points[index].y + (points[index + 1].y - points[index].y) * mix,
  };
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMotionFrame(ctx, backgroundImage, motionScene, elapsed) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(backgroundImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(ctx.canvas.width / motionScene.width, ctx.canvas.height / motionScene.height);
  ctx.translate(-motionScene.x, -motionScene.y);

  motionScene.edges.forEach((edge) => {
    const duration = 1.75;
    const progress = (elapsed - edge.delay) / duration;
    if (progress < 0 || progress > 1) return;
    const head = Math.max(0, Math.min(1, progress));
    const tail = Math.max(0, head - 0.24);
    const opacity = Math.sin(Math.PI * Math.min(1, progress));

    ctx.save();
    ctx.strokeStyle = edge.color;
    ctx.fillStyle = edge.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3.2, edge.width * 2.2);
    ctx.globalAlpha = 0.42 + opacity * 0.5;
    ctx.shadowColor = edge.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const trailPoint = pointAlong(edge.points, tail + ((head - tail) * i) / 14);
      if (i === 0) ctx.moveTo(trailPoint.x, trailPoint.y);
      else ctx.lineTo(trailPoint.x, trailPoint.y);
    }
    ctx.stroke();

    const point = pointAlong(edge.points, head);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  motionScene.nodes.forEach((node) => {
    const progress = (elapsed - node.delay) / 2.6;
    if (progress < 0 || progress > 1) return;
    const pulse = Math.sin(Math.PI * progress);
    if (pulse <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = node.color;
    ctx.lineWidth = 1.4 + pulse * 1.8;
    ctx.globalAlpha = pulse * 0.5;
    ctx.shadowColor = node.color;
    ctx.shadowBlur = 12 * pulse;
    const inset = 2 + pulse * 3;
    roundedRectPath(ctx, node.x - inset, node.y - inset, node.width + inset * 2, node.height + inset * 2, 8);
    ctx.stroke();
    ctx.restore();
  });

  ctx.restore();
}

function loadImage(svgText) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('не удалось растеризовать фоновый SVG'));
    };
    image.src = url;
  });
}

function motionMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const candidate of candidates) {
    if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

/**
 * Capture the trace animation of the given live SVG element.
 * format: 'webm' (MediaRecorder stream) or 'apng' (deterministic frame loop + UPNG).
 * backgroundSvgText: standalone SVG markup used as the static backdrop.
 */
export async function recordMotion(svg, { format, backgroundSvgText, duration = MOTION_DURATION, maxWidth }) {
  const vb = svg.viewBox.baseVal;
  const targetW = format === 'apng'
    ? Math.min(960, Math.max(640, vb.width))
    : Math.min(1280, Math.max(720, vb.width));
  const scale = targetW / vb.width;
  const width = Math.max(2, Math.round((vb.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((vb.height * scale) / 2) * 2);
  const scene = createMotionScene(svg, vb);
  const { image, url } = await loadImage(backgroundSvgText);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (format === 'webm') {
      const mime = motionMimeType();
      if (!mime || typeof canvas.captureStream !== 'function') {
        throw new Error('MediaRecorder/captureStream недоступны в этом браузере');
      }
      return await new Promise((resolve, reject) => {
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        const chunks = [];
        let stopped = false;
        const startedAt = performance.now();
        const draw = (now) => {
          const elapsed = Math.max(0, ((Number(now) || performance.now()) - startedAt) / 1000);
          drawMotionFrame(ctx, image, scene, elapsed);
          if (!stopped) requestAnimationFrame(draw);
        };
        recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
        recorder.onerror = (event) => {
          stopped = true;
          stream.getTracks().forEach((t) => t.stop());
          reject(event.error || new Error('MediaRecorder failed'));
        };
        recorder.onstop = () => {
          stopped = true;
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || mime });
          if (!blob.size) reject(new Error('MediaRecorder produced an empty WebM'));
          else resolve(blob);
        };
        drawMotionFrame(ctx, image, scene, 0);
        recorder.start(250);
        requestAnimationFrame(draw);
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, duration);
      });
    }

    if (format === 'apng') {
      const fps = 12;
      const frameDelay = Math.round(1000 / fps);
      const frameCount = Math.max(1, Math.round((duration / 1000) * fps));
      const frames = [];
      const delays = [];
      for (let i = 0; i < frameCount; i++) {
        drawMotionFrame(ctx, image, scene, i / fps);
        frames.push(ctx.getImageData(0, 0, width, height).data.buffer.slice(0));
        delays.push(frameDelay);
        // Let the UI breathe between frames on large diagrams.
        if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
      }
      const encoded = UPNG.encode(frames, width, height, 256, delays);
      return new Blob([encoded], { type: 'image/png' });
    }

    throw new Error(`recordMotion: unknown format ${JSON.stringify(format)}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
