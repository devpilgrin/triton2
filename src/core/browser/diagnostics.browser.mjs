// Browser-safe variant of archify renderers/shared/diagnostics.mjs (archify 2.15.0, MIT).
// Pure throwers; the process-level diagnostic boundary is a no-op outside Node.

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizedDiagnostic(diagnostic) {
  const message = String(diagnostic?.message || 'Archify could not classify this failure.').trim();
  return {
    code: String(diagnostic?.code || 'internal/unclassified'),
    severity: diagnostic?.severity === 'warning' ? 'warning' : 'error',
    message,
    subject: plainObject(diagnostic?.subject),
    evidence: plainObject(diagnostic?.evidence),
    supportedFixes: Array.isArray(diagnostic?.supportedFixes)
      ? [...new Set(diagnostic.supportedFixes.map((fix) => String(fix).trim()).filter(Boolean))]
      : [],
  };
}

export function recordDiagnostic() {}

export function throwDiagnosticError(message, diagnostics) {
  const error = new Error(message);
  error.archifyDiagnostics = (diagnostics || []).map(normalizedDiagnostic);
  throw error;
}

export function throwDiagnosticProblems(prefix, problems, { code = 'layout/constraint' } = {}) {
  const messages = (problems || []).map((problem) => String(problem));
  throw new Error(`${prefix}:\n- ${messages.join('\n- ')}`);
}

export function installRendererDiagnosticBoundary() {}
