#!/usr/bin/env python3
"""Patch vendored archify renderers from CLI scripts into importable functions.

Each render-<type>.mjs keeps its rendering body byte-identical; only the
fs/argv head and the writeDiagram tail are replaced:
  head: const { diagram, template, outPath } = await loadDiagramWithBrandMarks(...)
    ->  export async function render<Type>({ diagram, template, outPath, sourceEvidence } = {}) { + validation
  tail: validateX(); writeDiagram({...})
    ->  validateX(); const svg = renderSvg(); conditional writeDiagram; return {svg, cards, meta}; }
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RENDERERS = ROOT / "vendor" / "archify" / "renderers"

SPECS = {
    "architecture": ("arch", "renderArchitecture", "validateArchitecture"),
    "workflow": ("workflow", "renderWorkflow", "validateWorkflow"),
    "sequence": ("sequence", "renderSequence", "validateSequence"),
    "dataflow": ("dataflow", "renderDataflow", "validateDataflow"),
    "lifecycle": ("lifecycle", "renderLifecycle", "validateLifecycle"),
}

HEAD_BLOCK_RE = re.compile(
    r"(?:const layoutJsonMode = [^\n]*\n)?"
    r"(?:const cliArgs = [^\n]*\n)?"
    r"const \{ diagram: (?P<var>\w+), template, outPath(?:, sourceEvidence)? \} = await loadDiagramWithBrandMarks\(\{[\s\S]*?\}\);\n"
)

TAIL_RE = re.compile(
    r"(?P<validate>validate\w+\(\);)\n"
    r"(?:if \(layoutJsonMode\) \{[\s\S]*?\}\n)?"
    r"writeDiagram\(\{[\s\S]*?\}\);\s*$"
)


def patch_renderer(diagram_type: str, var: str, func: str, validate_fn: str) -> None:
    path = RENDERERS / diagram_type / f"render-{diagram_type}.mjs"
    text = path.read_text(encoding="utf-8")
    original = text

    # 1. Drop node-only preamble imports and __dirname.
    text = text.replace("import path from 'node:path';\n", "")
    text = text.replace("import { fileURLToPath } from 'node:url';\n", "")
    text = re.sub(r"const __dirname = [^\n]*\n", "", text)

    # 2. Swap loadDiagramWithBrandMarks for the validation helpers in the cli import.
    if "loadDiagramWithBrandMarks, " in text:
        text = text.replace(
            "loadDiagramWithBrandMarks, ",
            "validateSchema, validateGuidedViews, validateRelationshipIds, ",
        )
    elif ", loadDiagramWithBrandMarks" in text:
        text = text.replace(
            ", loadDiagramWithBrandMarks",
            ", validateSchema, validateGuidedViews, validateRelationshipIds",
        )
    else:
        raise SystemExit(f"{path}: loadDiagramWithBrandMarks import not found")

    # 3. Add the engineering-profile validator import (pure module).
    if "engineering-profiles" not in text:
        marker = "from '../shared/cli.mjs';\n"
        idx = text.index(marker) + len(marker)
        text = (
            text[:idx]
            + "import { validateEngineeringProfile } from '../shared/engineering-profiles.mjs';\n"
            + text[idx:]
        )

    # 4. Replace the CLI load head with the exported function opener.
    head = HEAD_BLOCK_RE.search(text)
    if not head:
        raise SystemExit(f"{path}: load head block not found")
    if head.group("var") != var:
        raise SystemExit(f"{path}: expected diagram var {var}, got {head.group('var')}")
    opener = (
        f"// Patched for Triton 2: CLI entry replaced by an importable render function.\n"
        f"// The rendering body below is unchanged from the vendored archify 2.15.0 source.\n"
        f"export async function {func}({{ diagram: {var}, template = null, outPath = null, sourceEvidence = null }} = {{}}) {{\n"
        f"if (!{var} || typeof {var} !== 'object') throw new Error('{func}: a diagram object is required');\n"
        f"validateSchema('{diagram_type}', {var});\n"
        f"validateGuidedViews('{diagram_type}', {var});\n"
        f"validateRelationshipIds('{diagram_type}', {var});\n"
        f"validateEngineeringProfile('{diagram_type}', {var});\n"
    )
    text = text[: head.start()] + opener + text[head.end():]

    # 5. Replace the write tail with a return.
    tail = TAIL_RE.search(text)
    if not tail:
        raise SystemExit(f"{path}: write tail block not found")
    if tail.group("validate") != f"{validate_fn}();":
        raise SystemExit(f"{path}: expected {validate_fn}();, got {tail.group('validate')}")
    closer = (
        f"{validate_fn}();\n"
        f"const svg = renderSvg();\n"
        f"if (outPath && template) {{\n"
        f"  writeDiagram({{ outPath, template, diagramType: '{diagram_type}', meta: {var}.meta, svg, cards: {var}.cards, sourceEvidence }});\n"
        f"}}\n"
        f"return {{ svg, cards: {var}.cards, meta: {var}.meta }};\n"
        f"}}\n"
    )
    text = text[: tail.start()] + closer

    if text == original:
        raise SystemExit(f"{path}: no changes applied")
    path.write_text(text, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")


for diagram_type, (var, func, validate_fn) in SPECS.items():
    patch_renderer(diagram_type, var, func, validate_fn)
print("all renderers patched")
