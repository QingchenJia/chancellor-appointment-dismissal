# Modern Search Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有宋代宰执检索页面升级为桌面优先、浅色雅致、结果区主导并使用侧滑详情的现代检索工作台，同时保持 API 和业务功能不变。

**Architecture:** 保留 FastAPI 静态文件交付方式，将可测试的查询与分页状态逻辑抽取到无 DOM 依赖的 ES module；页面结构、样式和浏览器控制器仍使用原生 HTML/CSS/JavaScript。Python 静态结构测试约束关键语义和样式契约，Node 内置测试运行器验证纯前端状态逻辑，现有 pytest 套件证明后端行为没有回归。

**Tech Stack:** FastAPI、原生 HTML5、CSS、JavaScript ES modules、Node.js `node:test`、pytest

## Global Constraints

- 不修改数据库、数据模型、导入流程、API 参数或 API 响应结构。
- 不新增查询字段、列排序、列配置、CSV 导出、主题切换或深色主题。
- 不引入前端框架、组件库、npm 生产依赖或远程字体。
- 以 1280px 及以上桌面视口为主要验收范围。
- 保留现有人名、年份、月份、皇帝、年号、事件类型、关键词、快捷筛选、时间分布、分页和详情功能。
- 所有新增交互支持明确焦点状态；详情支持 Enter 打开和 Esc 关闭。
- 动效必须遵守 `prefers-reduced-motion: reduce`。

---

## File Structure

- Create `web/ui-state.mjs`: 无 DOM 依赖的查询参数、分页、筛选摘要和请求时序工具。
- Create `tests/web/ui-state.test.mjs`: 使用 Node 内置测试运行器验证 `ui-state.mjs`。
- Create `tests/test_web_ui.py`: 读取静态页面与样式，验证关键语义结构、可访问属性和响应式契约。
- Modify `web/index.html`: 两栏工作台、筛选分组、状态区域、筛选摘要和详情对话框结构。
- Modify `web/styles.css`: 浅色令牌、桌面布局、筛选胶囊、表格、状态视图、侧滑详情、响应式和减少动态效果。
- Modify `web/app.js`: 页面初始化、并发请求状态、过期请求保护、筛选摘要、键盘导航、详情焦点管理和错误恢复。

### Task 1: 可测试的前端状态核心

**Files:**
- Create: `web/ui-state.mjs`
- Create: `tests/web/ui-state.test.mjs`

**Interfaces:**
- Produces: `buildSearchParams(filterState): URLSearchParams`
- Produces: `getPageMeta(total: number, offset: number, limit: number): { currentPage: number, totalPages: number }`
- Produces: `getActiveFilters(filterState): Array<{ key: string, label: string, value: string }>`
- Produces: `createRequestGate(): { issue(): number, isCurrent(token: number): boolean }`
- Consumes: 仅 JavaScript 标准库。

- [ ] **Step 1: Write failing state tests**

```javascript
// tests/web/ui-state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
    buildSearchParams,
    createRequestGate,
    getActiveFilters,
    getPageMeta,
} from "../../web/ui-state.mjs";

test("buildSearchParams omits blank filters and keeps dynasty month bounds", () => {
    const params = buildSearchParams({
        person: " 赵普 ", yearFrom: "", yearTo: "1127", month: "",
        emperor: "", era: "", eventType: "appointment", keyword: "",
        monthFrom: "", monthTo: "4", limit: 12, offset: 0,
    });
    assert.equal(params.toString(), "person=%E8%B5%B5%E6%99%AE&year_to=1127&month_to=4&event_type=appointment&limit=12&offset=0");
});

test("getPageMeta returns one display page for an empty result", () => {
    assert.deepEqual(getPageMeta(0, 0, 12), { currentPage: 1, totalPages: 1 });
    assert.deepEqual(getPageMeta(25, 12, 12), { currentPage: 2, totalPages: 3 });
});

test("getActiveFilters returns readable labels only for active values", () => {
    assert.deepEqual(getActiveFilters({ person: "赵普", yearFrom: "960", yearTo: "", eventType: "dismissal" }), [
        { key: "person", label: "人物", value: "赵普" },
        { key: "yearFrom", label: "起始年", value: "960" },
        { key: "eventType", label: "事件类型", value: "罢免" },
    ]);
});

test("request gate rejects responses older than the latest request", () => {
    const gate = createRequestGate();
    const first = gate.issue();
    const second = gate.issue();
    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
});
```

- [ ] **Step 2: Run tests and verify expected RED**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/ui-state.mjs`.

- [ ] **Step 3: Implement the minimal pure state module**

```javascript
// web/ui-state.mjs
const queryKeys = {
    person: "person", yearFrom: "year_from", yearTo: "year_to",
    monthFrom: "month_from", monthTo: "month_to", month: "month",
    emperor: "emperor", era: "era", eventType: "event_type", keyword: "keyword",
    limit: "limit", offset: "offset",
};

const filterLabels = {
    person: "人物", yearFrom: "起始年", yearTo: "终止年", month: "月份",
    emperor: "皇帝", era: "年号", eventType: "事件类型", keyword: "关键词",
};

const eventLabels = { appointment: "任命/调整", dismissal: "罢免", death: "死亡/殉难" };

export function buildSearchParams(state) {
    const params = new URLSearchParams();
    Object.entries(queryKeys).forEach(([stateKey, queryKey]) => {
        const value = state[stateKey];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            params.set(queryKey, String(value).trim());
        }
    });
    return params;
}

export function getPageMeta(total, offset, limit) {
    return {
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export function getActiveFilters(state) {
    return Object.keys(filterLabels).flatMap((key) => {
        const value = state[key];
        if (value === undefined || value === null || String(value).trim() === "") return [];
        const text = key === "eventType" ? (eventLabels[value] || value) : String(value).trim();
        return [{ key, label: filterLabels[key], value: text }];
    });
}

export function createRequestGate() {
    let current = 0;
    return {
        issue() { current += 1; return current; },
        isCurrent(token) { return token === current; },
    };
}
```

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add web/ui-state.mjs tests/web/ui-state.test.mjs
git commit -m "test: add frontend state primitives"
```

### Task 2: 两栏工作台与侧滑详情语义结构

**Files:**
- Create: `tests/test_web_ui.py`
- Modify: `web/index.html`

**Interfaces:**
- Consumes: Existing element IDs used by `web/app.js` plus new IDs below.
- Produces: `#toggleFilters`, `#filterSummary`, `#resultsStatus`, `#detailDrawer`, `#detailBackdrop`, `#closeDetail`, `#retryResults`, `#clearEmptyFilters`.
- Produces: grouped `.filter-section`, `.quick-filter`, `dialog`-like drawer semantics through `role="dialog"` and `aria-modal="true"`.

- [ ] **Step 1: Write failing static structure tests**

```python
# tests/test_web_ui.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_page_uses_two_column_workbench_and_filter_groups():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert 'class="workspace"' in html
    assert html.count('class="filter-section"') == 3
    assert 'id="toggleFilters"' in html
    assert 'id="filterSummary"' in html
    assert 'id="resultsStatus"' in html


def test_detail_drawer_has_accessible_dialog_controls():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert 'id="detailDrawer"' in html
    assert 'role="dialog"' in html
    assert 'aria-modal="true"' in html
    assert 'aria-labelledby="detailTitle"' in html
    assert 'id="closeDetail"' in html
    assert 'id="detailBackdrop"' in html


def test_scripts_load_as_modules_after_the_document_markup():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert '<script type="module" src="/static/app.js"></script>' in html
```

- [ ] **Step 2: Run structure tests and verify expected RED**

Run: `conda run -n document python -m pytest tests/test_web_ui.py -q`

Expected: 3 failures because filter groups, result status and detail drawer do not exist.

- [ ] **Step 3: Replace the page body with semantic workbench markup**

Implement `web/index.html` with these exact structural decisions:

```html
<div class="app-shell">
  <header class="topbar">
    <div><p class="eyebrow">宋代政治人物资料检索</p><h1>宋代宰执拜罢一览</h1></div>
    <div class="topbar-actions"><p class="topbar-note">按人物、年代与事件检索任免记录，并追溯原始文献单元格。</p><button id="toggleFilters" class="secondary-button" type="button" aria-expanded="true" aria-controls="filterPanel">收起筛选</button></div>
  </header>
  <main class="workspace">
    <aside id="filterPanel" class="filters panel" aria-labelledby="filterTitle">
      <div class="panel-title"><div><p class="section-kicker">检索工具</p><h2 id="filterTitle">筛选条件</h2></div><button id="resetFilters" class="text-button" type="button">全部重置</button></div>
      <div class="filter-scroll">
        <section class="filter-section"><h3>人物与时间</h3><label>人名<input id="person" autocomplete="off" placeholder="赵普 / 王安石 / 文天祥"></label><div class="field-grid"><label>起始年<input id="yearFrom" inputmode="numeric" placeholder="960"></label><label>终止年<input id="yearTo" inputmode="numeric" placeholder="1279"></label></div><label>月份<select id="month" class="archive-select"><option value="">全部月份</option></select></label></section>
        <section class="filter-section"><h3>朝代信息</h3><label>皇帝<select id="emperor" class="archive-select"><option value="">全部皇帝</option></select></label><label>年号<select id="era" class="archive-select"><option value="">全部年号</option></select></label></section>
        <section class="filter-section"><h3>事件内容</h3><label>事件类型<select id="eventType" class="archive-select"><option value="">全部类型</option><option value="appointment">任命/调整</option><option value="dismissal">罢免</option><option value="death">死亡/殉难</option></select></label><label>原文关键词<input id="keyword" autocomplete="off" placeholder="乙亥 / 长编 / 同平章事"></label></section>
        <div class="quick-filters" aria-label="快捷筛选"><button class="quick-filter" data-range="north" aria-pressed="false">北宋</button><button class="quick-filter" data-range="south" aria-pressed="false">南宋</button><button class="quick-filter" data-type="appointment" aria-pressed="false">任命</button><button class="quick-filter" data-type="dismissal" aria-pressed="false">罢免</button></div>
      </div>
      <div class="filter-actions"><button id="searchButton" class="primary-button" type="button"><span class="button-label">查询记录</span></button><button id="clearButton" class="text-button" type="button">清空条件</button></div>
    </aside>
    <section class="results panel" aria-labelledby="resultsTitle">
      <header class="results-head"><div><p class="section-kicker">检索结果</p><h2 id="resultsTitle">宰执任免记录</h2><p id="resultCount">0 条记录</p></div></header>
      <div id="filterSummary" class="filter-summary" aria-label="当前筛选条件"></div>
      <section class="timeline-card" aria-labelledby="timelineTitle"><div><h3 id="timelineTitle">事件时间分布</h3><p>按年月汇总的记录密度</p></div><div id="timeline" class="timeline"></div></section>
      <div id="resultsStatus" class="results-status" aria-live="polite"></div>
      <div class="table-wrap"><table><thead><tr><th>公元年月</th><th>皇帝</th><th>年号</th><th>人物</th><th>类型</th><th>原文摘要</th></tr></thead><tbody id="resultsBody"></tbody></table></div>
      <footer class="results-footer"><span id="pageInfo">第 1 页 / 共 1 页</span><div class="pager"><button id="prevPage" type="button">上一页</button><button id="nextPage" type="button">下一页</button></div></footer>
    </section>
  </main>
</div>
<div id="detailBackdrop" class="drawer-backdrop" hidden></div>
<aside id="detailDrawer" class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detailTitle" aria-hidden="true">
  <header class="drawer-head"><div><p class="section-kicker">原始证据</p><h2 id="detailTitle">记录详情</h2></div><button id="closeDetail" type="button" aria-label="关闭详情">×</button></header>
  <div id="detailContent" class="detail-content"></div>
</aside>
<script type="module" src="/static/app.js"></script>
```

The shown input/select IDs and option values are the complete filter contract; do not rename or add fields.

- [ ] **Step 4: Run structure tests and verify GREEN**

Run: `conda run -n document python -m pytest tests/test_web_ui.py -q`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add tests/test_web_ui.py web/index.html
git commit -m "feat: restructure search workbench markup"
```

### Task 3: 浅色视觉系统与响应式工作台

**Files:**
- Modify: `tests/test_web_ui.py`
- Modify: `web/styles.css`

**Interfaces:**
- Consumes: Task 2 markup classes and IDs.
- Produces: CSS custom properties `--canvas`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-soft`, `--danger`.
- Produces: `.is-open`, `.is-loading`, `.is-selected`, `.is-active` state classes used by Task 4.

- [ ] **Step 1: Add failing CSS contract tests**

```python
def test_styles_define_light_tokens_drawer_and_reduced_motion():
    css = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
    for token in ("--canvas:", "--surface:", "--accent:", "--accent-soft:"):
        assert token in css
    assert ".detail-drawer.is-open" in css
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert "@media (max-width: 1080px)" in css


def test_filters_and_detail_have_independent_scrolling():
    css = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
    assert ".filter-scroll" in css and "overflow-y: auto" in css
    assert ".detail-content" in css
```

- [ ] **Step 2: Run CSS tests and verify expected RED**

Run: `conda run -n document python -m pytest tests/test_web_ui.py -q`

Expected: 2 new failures because the light tokens and drawer selectors are absent.

- [ ] **Step 3: Rebuild `web/styles.css` around the approved token system**

Use these concrete base values and layout contracts:

```css
:root {
  --canvas: #f4f1ea; --surface: #fffdfa; --surface-subtle: #f8f6f1;
  --ink: #202925; --muted: #6f7772; --line: #dddcd5;
  --accent: #315f59; --accent-hover: #274e49; --accent-soft: #e4efec;
  --danger: #a8443b; --shadow: 0 18px 48px rgba(42, 53, 48, .12);
  --radius-lg: 14px; --radius-md: 10px;
}
body { margin: 0; min-width: 320px; background: var(--canvas); color: var(--ink); font-family: "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif; }
.app-shell { min-height: 100vh; padding: 24px; }
.topbar { max-width: 1800px; margin: 0 auto 18px; display: flex; align-items: end; justify-content: space-between; gap: 32px; }
.workspace { max-width: 1800px; height: calc(100vh - 126px); margin: auto; display: grid; grid-template-columns: 292px minmax(0, 1fr); gap: 18px; }
.panel { min-height: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: 0 8px 24px rgba(42, 53, 48, .06); }
.workspace.filters-collapsed { grid-template-columns: 0 minmax(0, 1fr); }
.workspace.filters-collapsed .filters { visibility: hidden; opacity: 0; pointer-events: none; }
.filters { display: flex; flex-direction: column; overflow: hidden; }
.filter-scroll, .detail-content { min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
.results { min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.detail-drawer { position: fixed; inset: 0 0 0 auto; z-index: 40; width: min(540px, 92vw); background: var(--surface); box-shadow: var(--shadow); transform: translateX(104%); visibility: hidden; transition: transform .22s ease, visibility .22s; }
.detail-drawer.is-open { transform: translateX(0); visibility: visible; }
.drawer-backdrop { position: fixed; inset: 0; z-index: 30; background: rgba(31, 41, 37, .18); opacity: 0; transition: opacity .2s ease; }
.drawer-backdrop.is-open { opacity: 1; }
@media (max-width: 1080px) { .workspace { grid-template-columns: 252px minmax(0, 1fr); } }
@media (max-width: 820px) { .app-shell { padding: 12px; } .workspace { height: auto; grid-template-columns: 1fr; } .filters, .results { min-height: 640px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
```

Add explicit selectors for every Task 2 class with these fixed contracts: labels use 13px muted text and 7px internal gaps; inputs and custom select buttons use 40px minimum height; filter groups use 16px vertical padding and a top border after the first group; `.quick-filter.is-active` uses `--accent-soft` background and `--accent` border/text; `.filter-chip` is a removable pill; `.primary-button` is at least 44px tall; `.timeline-card` is 72px tall; `th` is sticky; `.table-wrap`, `.filter-scroll`, and `.detail-content` show native scrollbars; type pills use semantic modifier classes; `.skeleton-row`, `.empty-result`, and `.error-result` reserve the result area; `.results-footer` remains at the bottom; `.source-text` has 1.85 line height and no clamp; all interactive controls define hover and `:focus-visible`. Use no gradients, remote assets, gold accents, hidden scrollbars, or fixed-height detail text clamping.

- [ ] **Step 4: Run CSS contract tests and verify GREEN**

Run: `conda run -n document python -m pytest tests/test_web_ui.py -q`

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add tests/test_web_ui.py web/styles.css
git commit -m "feat: add light archival visual system"
```

### Task 4: 查询状态、筛选摘要与侧滑详情交互

**Files:**
- Modify: `tests/web/ui-state.test.mjs`
- Modify: `web/ui-state.mjs`
- Modify: `web/app.js`

**Interfaces:**
- Consumes: Task 1 state helpers and Task 2 DOM IDs.
- Produces: `clearFilterValue(state, key)` for deterministic single-chip removal.
- Produces browser behavior: Enter queries, query loading/error/empty states, active chips, stale-response rejection, row keyboard activation, drawer focus restoration, Esc/backdrop/close dismissal, detail retry.

- [ ] **Step 1: Add failing filter removal tests**

```javascript
import { clearFilterValue } from "../../web/ui-state.mjs";

test("clearFilterValue resets one field without mutating the original state", () => {
    const original = { person: "赵普", yearFrom: "960", monthFrom: "1", monthTo: "4" };
    assert.deepEqual(clearFilterValue(original, "person"), { person: "", yearFrom: "960", monthFrom: "1", monthTo: "4" });
    assert.equal(original.person, "赵普");
});
```

- [ ] **Step 2: Run state tests and verify expected RED**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: FAIL because `clearFilterValue` is not exported.

- [ ] **Step 3: Implement filter removal helper**

```javascript
export function clearFilterValue(state, key) {
    return { ...state, [key]: "" };
}
```

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Refactor `web/app.js` into explicit UI states**

Replace the current controller while preserving existing API URLs and `escapeHtml`. The implementation must:

```javascript
import { buildSearchParams, createRequestGate, getActiveFilters, getPageMeta } from "./ui-state.mjs";

const searchGate = createRequestGate();
const detailGate = createRequestGate();
let detailTrigger = null;

async function searchEvents() {
  const token = searchGate.issue();
  setResultsStatus("loading");
  setSearchBusy(true);
  try {
    const data = await fetchJson(`/api/search/events?${buildSearchParams(readFilterState())}`);
    if (!searchGate.isCurrent(token)) return;
    state.total = data.total;
    state.items = data.items;
    renderResults(data);
    renderFilterSummary();
    setResultsStatus(data.items.length ? "ready" : "empty");
  } catch (error) {
    if (searchGate.isCurrent(token)) setResultsStatus("error", error.message);
  } finally {
    if (searchGate.isCurrent(token)) setSearchBusy(false);
  }
}

async function selectEvent(id, trigger) {
  const token = detailGate.issue();
  state.selectedId = id;
  detailTrigger = trigger;
  openDetail();
  renderDetailLoading();
  try {
    const detail = await fetchJson(`/api/events/${id}`);
    if (detailGate.isCurrent(token)) renderDetail(detail);
  } catch (error) {
    if (detailGate.isCurrent(token)) renderDetailError(id, error.message);
  }
}
```

Implement the surrounding functions with these exact behaviors:

- `init()` starts `loadFacets()`, `loadTimeline()`, and `searchEvents()` concurrently via `Promise.allSettled`.
- `readFilterState()` maps existing form values plus `monthFrom`, `monthTo`, `limit`, and `offset` to Task 1 helper keys.
- `renderFilterSummary()` uses `getActiveFilters`, creates removable buttons with accessible labels, and also exposes active dynasty quick selection.
- Chip removal clears the mapped native field, clears dynasty bounds when relevant, resets offset, synchronizes the custom select, and queries again.
- Quick buttons synchronize `aria-pressed` and `.is-active` after every state change.
- `#toggleFilters` toggles `.filters-collapsed` on `.workspace`, updates `aria-expanded`, and changes its label between `收起筛选` and `展开筛选`; the button is visible at widths below 1280px and the filter is expanded by default.
- All text/year inputs listen for Enter and initiate a first-page query.
- Rows receive `tabIndex = 0`, `aria-selected`, click activation and Enter activation.
- `getPageMeta` renders `第 N 页 / 共 M 页`.
- `setResultsStatus("loading")` renders six skeleton rows; `empty` renders a message plus `#clearEmptyFilters`; `error` renders escaped error text plus `#retryResults`.
- `openDetail()` unhides backdrop, then applies `.is-open`, `aria-hidden="false"`, locks body scroll and focuses `#closeDetail`.
- `closeDetail()` removes open state, restores body scroll, sets `aria-hidden="true"`, and returns focus to `detailTrigger`.
- Backdrop click, close button, and Escape call `closeDetail()`.
- `renderDetail` includes year/month, emperor, era, person, event type, source cell, full source text and annotations without line clamping.
- Facet and timeline failures render local retry buttons rather than throwing out of `init()`.
- Keep custom selects, but add ArrowUp/ArrowDown navigation and ensure Escape closes the select before closing the drawer.

- [ ] **Step 6: Run JavaScript tests and syntax checks**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: 5 tests pass, 0 fail.

Run: `node --check web/app.js`

Expected: exit 0 with no output.

Run: `node --check web/ui-state.mjs`

Expected: exit 0 with no output.

- [ ] **Step 7: Commit**

```powershell
git add web/app.js web/ui-state.mjs tests/web/ui-state.test.mjs
git commit -m "feat: refine search and detail interactions"
```

### Task 5: 全量回归与桌面验收

**Files:**
- Modify only if verification exposes a concrete defect; add a failing regression test before each fix.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified release-ready local UI state.

- [ ] **Step 1: Run the complete Python suite**

Run: `conda run -n document python -m pytest -q`

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run the complete frontend state suite**

Run: `node --test tests/web/ui-state.test.mjs`

Expected: 5 tests pass, 0 failures.

- [ ] **Step 3: Run static and whitespace verification**

Run: `node --check web/app.js`

Expected: exit 0.

Run: `git diff --check`

Expected: exit 0 with no output.

- [ ] **Step 4: Start the local app for manual desktop verification**

Run: `conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --host 127.0.0.1 --port 8000`

Expected: Uvicorn reports the application running at `http://127.0.0.1:8000`.

- [ ] **Step 5: Verify the approved desktop workflow**

At a viewport of at least 1280px, verify:

1. Initial facets, timeline and results render independently.
2. Person/year/keyword Enter submission and the primary button return matching records.
3. North/South Song and event quick filters visibly select and update results.
4. Active filter chips remove one condition without clearing the rest.
5. Loading, empty and recoverable error views do not collapse the results panel.
6. Pagination reports current and total pages and respects boundaries.
7. Mouse click and keyboard Enter open the drawer with untruncated source text.
8. Close button, backdrop and Escape close the drawer and restore row focus.
9. Filter panel, result table and drawer each scroll without hidden content.
10. At a narrower desktop width the table scrolls horizontally and no control is unreachable.

- [ ] **Step 6: Re-run all automated checks after any manual-test fix**

Run: `conda run -n document python -m pytest -q`

Run: `node --test tests/web/ui-state.test.mjs`

Run: `node --check web/app.js`

Run: `git diff --check`

Expected: every command exits 0 and reports no failures.

- [ ] **Step 7: Commit any verification fixes**

```powershell
git add web tests
git commit -m "fix: polish responsive workbench behavior"
```

Skip this commit when verification required no code changes.
