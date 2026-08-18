# Triton 2

Редактор диаграмм «диаграмма как код»: DSL в духе Mermaid (из
[triton-diagram-editor](https://github.com/devpilgrin/triton-diagram-editor)) +
детерминированный рендер и валидатор из
[archify](https://github.com/tt-a1i/archify) (MIT, vendored в `vendor/archify`).

**Статус: spike.** Стык двух движков доказан: DSL → IR → SVG работает
одинаково в Node и в браузере (см. `test/smoke.mjs`, `demo/index.html`).

## Установка

```bash
npm install -g triton2        # после публикации в npm
# локально из репозитория:
npm install && npm run build && npm link
```

## CLI

```bash
triton2 render diagram.dsl                 # -> diagram.html (standalone archify viewer)
triton2 render diagram.json -o out.html    # напрямую из archify IR
triton2 validate diagram.json              # схема + семантика, exit 0/1
triton2 validate diagram.json --json       # структурированные диагностики
```

## Библиотека

```js
import { renderDiagram, validateDiagram, parseFlowchart, modelToArchitectureIR } from 'triton2';

const model = parseFlowchart('flowchart TD\n  A[Клиент] --> B[Сервис]');
const ir = modelToArchitectureIR(model, { title: 'Demo' });
const { svg, cards, meta } = await renderDiagram('architecture', ir);
```

В браузере: `triton2/browser` — собранный бандл без Node-зависимостей
(`npm run build` → `dist/triton2-core.browser.mjs`).

## Демо

```bash
npm run demo    # http://127.0.0.1:8765/demo/ — живой DSL → SVG в браузере
```

## Типы диаграмм (archify IR)

`architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`.
Triton DSL пока конвертируется в `architecture` (свободные координаты, пины).

## Структура

```
bin/triton2.mjs      CLI
src/core/            API + сборка browser-бандла (esbuild + алиасы node-модулей)
src/convert/         Triton DSL: парсер, сериализатор, конвертер в IR
vendor/archify/      archify 2.15.0 (MIT) + минимальные патчи (см. PROVENANCE.md)
demo/                браузерное демо
test/smoke.mjs       14 проверок: рендер 5 типов в Node и в browser-бандле
```

## Roadmap (v1)

- Канвас-редактор поверх SVG (клик → селект, drag → `pos`/`pin`)
- ELK-автолайаут вместо спайкового слоистого
- Панель диагностик валидатора в редакторе
- Экспорт PNG/SVG/HTML (+APNG/WebM)
- AI-панель (LM Studio / DeepSeek) из triton-diagram-editor
