# Triton 2

[![npm](https://img.shields.io/npm/v/triton2)](https://www.npmjs.com/package/triton2)
[![CI](https://github.com/devpilgrin/triton2/actions/workflows/ci.yml/badge.svg)](https://github.com/devpilgrin/triton2/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/triton2)](https://github.com/devpilgrin/triton2/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/triton2)](https://nodejs.org)

Редактор диаграмм «диаграмма как код»: DSL в духе Mermaid (из
[triton-diagram-editor](https://github.com/devpilgrin/triton-diagram-editor)) +
детерминированный рендер и валидатор из
[archify](https://github.com/tt-a1i/archify) (MIT, vendored в `vendor/archify`).

**Статус: v0.2 — редактор.** Стык двух движков доказан и обёрнут в интерфейс:
`triton2 edit file.dsl` поднимает локальный редактор — код-панель + канвас
archify с двусторонней синхронизацией (drag узла пишет `[pin=x,y]` в код,
правка кода мгновенно перерисовывает канвас), выбор узла/связи, свойства,
экспорт HTML/SVG/PNG, диагностика валидатора.

## Редактор

```bash
triton2 edit diagram.dsl   # локальный сервер на случайном порту + браузер
```

- левая панель — DSL, правая — канвас (рендер archify в браузере, без сервера рендеринга);
- drag узла → `pin` в DSL; клик по узлу/связи → свойства (переименовать,
  связать, открепить, удалить);
- «Сохранить» пишет файл через сервер; без сервера — скачивает .dsl;
- экспорт: HTML (полный archify viewer), SVG, PNG.

## Установка

```bash
npm install -g triton2
```

Обновление до последней версии:

```bash
npm install -g triton2@latest
triton2 --version   # проверить установленную версию
```

Из исходников (разработка):

```bash
git clone https://github.com/devpilgrin/triton2.git
cd triton2 && npm install && npm run build && npm link
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
triton2 demo    # редактор с демо-диаграммой в браузере — работает из глобальной установки
```

## ArchiMate

Нотация включается заголовком `archimate` (вместо `flowchart`); узел получает
слой и тип элемента аннотацией `[arch:слой.элемент]`:

```
archimate TD
  customer[Клиент] [arch:business.actor]
  ordering[Оформление заказа] [arch:business.process]
  crm[CRM] [arch:application.component]
  store[(Заказы)] [arch:technology.node]
  customer --> ordering
  ordering --> crm
  crm --> store [--]
```

Слои `business` / `application` / `technology` / `physical` / `strategy` /
`motivation` раскладываются полосами в каноническом порядке и окрашиваются в
палитру ArchiMate (пресет `archimate` доступен и в Style Picker экспортированного
HTML). Тип элемента уходит в подпись узла (Актор, Процесс, Сервис…).

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
