// Ported from triton-diagram-editor (devpilgrin, MIT): apps/web/src/mermaid/shapes.ts
// Order matters: more specific (longer) delimiters must be tried before shorter
// ones that are prefixes of them, e.g. "([" before "(" and "((" before "(".
export const SHAPE_DELIMS = [
  { shape: 'stadium', open: '([', close: '])' },
  { shape: 'circle', open: '((', close: '))' },
  { shape: 'round', open: '(', close: ')' },
  { shape: 'diamond', open: '{', close: '}' },
  { shape: 'rect', open: '[', close: ']' },
];

export function wrapLabel(label, shape) {
  const delim = SHAPE_DELIMS.find((d) => d.shape === shape) ?? SHAPE_DELIMS[SHAPE_DELIMS.length - 1];
  return `${delim.open}${label}${delim.close}`;
}

/** Parses a trailing shape token (e.g. "[Start]", "{Decision}") into shape + label. */
export function parseShapeToken(token) {
  const trimmed = token.trim();
  for (const delim of SHAPE_DELIMS) {
    if (trimmed.startsWith(delim.open) && trimmed.endsWith(delim.close)) {
      const inner = trimmed.slice(delim.open.length, trimmed.length - delim.close.length);
      return { shape: delim.shape, label: inner.trim() };
    }
  }
  return null;
}

/** Matches a leading id + optional shape token at the start of a string. Returns match + rest. */
export function matchNodeRef(text) {
  const idMatch = /^\s*([A-Za-z0-9_-]+)/.exec(text);
  if (!idMatch) return null;
  const id = idMatch[1];
  let rest = text.slice(idMatch[0].length);

  // No whitespace allowed between the id and its shape bracket (matches real
  // Mermaid syntax) — this also disambiguates it from a trailing style
  // annotation like "A [Red]", which is always space-separated.
  for (const delim of SHAPE_DELIMS) {
    if (rest.startsWith(delim.open)) {
      const afterOpen = rest.slice(delim.open.length);
      const closeIdx = afterOpen.indexOf(delim.close);
      if (closeIdx !== -1) {
        const label = afterOpen.slice(0, closeIdx).trim();
        const consumed = delim.open.length + closeIdx + delim.close.length;
        return { id, shape: delim.shape, label, rest: rest.slice(consumed) };
      }
    }
  }
  return { id, rest };
}
