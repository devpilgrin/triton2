// Browser-safe variant of archify renderers/shared/brand-marks.mjs (archify 2.15.0, MIT).
// Brand capture and the built-in brand catalogue require fs/network, so the
// browser build resolves no brand marks; all render-side helpers degrade to
// their no-brand results. Brand support in the editor is planned work.

export async function prepareDiagramBrandMarks() {}

export function findBrandMark() {
  return null;
}

export function listBrandMarks() {
  return [];
}

export function isPrivateBrandAddress() {
  return true;
}

export async function captureBrandReference() {
  throw new Error('brand capture is not available in the browser build');
}

export function brandMarkFor() {
  return null;
}

export function brandMetadataFor() {
  return {};
}

export function brandLabelFitWidth(node, width) {
  return width;
}

export function brandTopRailProblem() {
  return null;
}

export function renderBrandMark() {
  return '';
}
