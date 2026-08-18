// Browser-safe variant of archify renderers/shared/repository-evidence.mjs
// (archify 2.15.0, MIT). Repository evidence requires git/fs access, which the
// browser build does not have; evidence is simply absent there.

export function hasRepositoryEvidence() {
  return false;
}

export function verifyRepositoryEvidence() {
  return null;
}
