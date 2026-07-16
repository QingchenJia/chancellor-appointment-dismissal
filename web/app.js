import {
    buildSearchParams,
    createRequestGate,
    getActiveFilters,
    getPageMeta,
} from "./ui-state.mjs";

const state = {
    limit: 12,
    offset: 0,
    total: 0,
    items: [],
    selectedId: null,
    monthFrom: "",
    monthTo: "",
    dynastyRange: "",
};

const fields = {
    person: document.querySelector("#person"),
    yearFrom: document.querySelector("#yearFrom"),
    yearTo: document.querySelector("#yearTo"),
    month: document.querySelector("#month"),
    emperor: document.querySelector("#emperor"),
    era: document.querySelector("#era"),
    eventType: document.querySelector("#eventType"),
    keyword: document.querySelector("#keyword"),
};

const elements = {
    workspace: document.querySelector(".workspace"),
    toggleFilters: document.querySelector("#toggleFilters"),
    searchButton: document.querySelector("#searchButton"),
    clearButton: document.querySelector("#clearButton"),
    resetFilters: document.querySelector("#resetFilters"),
    resultsBody: document.querySelector("#resultsBody"),
    resultsStatus: document.querySelector("#resultsStatus"),
    resultCount: document.querySelector("#resultCount"),
    pageInfo: document.querySelector("#pageInfo"),
    prevPage: document.querySelector("#prevPage"),
    nextPage: document.querySelector("#nextPage"),
    filterSummary: document.querySelector("#filterSummary"),
    timeline: document.querySelector("#timeline"),
    detailDrawer: document.querySelector("#detailDrawer"),
    detailBackdrop: document.querySelector("#detailBackdrop"),
    detailContent: document.querySelector("#detailContent"),
    closeDetail: document.querySelector("#closeDetail"),
};

const typeLabels = {
    appointment: "任命/调整",
    dismissal: "罢免",
    death: "死亡/殉难",
    tenure: "任期状态",
};

const customSelects = new Map();
const searchGate = createRequestGate();
const detailGate = createRequestGate();
let detailTrigger = null;

initCustomSelects();
bindEvents();
init();

function bindEvents() {
    elements.searchButton.addEventListener("click", submitSearch);
    elements.clearButton.addEventListener("click", clearFilters);
    elements.resetFilters.addEventListener("click", clearFilters);
    elements.prevPage.addEventListener("click", () => turnPage(-1));
    elements.nextPage.addEventListener("click", () => turnPage(1));
    elements.closeDetail.addEventListener("click", closeDetail);
    elements.detailBackdrop.addEventListener("click", closeDetail);
    elements.toggleFilters.addEventListener("click", toggleFilters);

    [fields.person, fields.yearFrom, fields.yearTo, fields.keyword].forEach(
        (field) => {
            field.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearch();
                }
            });
        },
    );

    [fields.yearFrom, fields.yearTo, fields.month, fields.emperor].forEach(
        (field) => {
            field.addEventListener("input", clearDynastyQuickFilter);
            field.addEventListener("change", clearDynastyQuickFilter);
        },
    );

    document.querySelectorAll(".quick-filter").forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.range) {
                applyDynastyQuickFilter(button.dataset.range);
            }
            if (button.dataset.type) {
                fields.eventType.value = button.dataset.type;
                syncCustomSelect(fields.eventType);
            }
            state.offset = 0;
            syncQuickFilters();
            searchEvents();
        });
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".custom-select")) {
            closeCustomSelects();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (hasOpenCustomSelect()) {
            closeCustomSelects();
            return;
        }
        if (elements.detailDrawer.classList.contains("is-open")) {
            closeDetail();
        }
    });
}

async function init() {
    await Promise.allSettled([loadFacets(), loadTimeline(), searchEvents()]);
}

async function loadFacets() {
    clearFacetError();
    try {
        const facets = await fetchJson("/api/facets");
        fillSelect(fields.month, facets.months, "value", "label");
        fillSelect(
            fields.emperor,
            facets.emperors.map((value) => ({ value, label: value })),
            "value",
            "label",
        );
        fillSelect(
            fields.era,
            facets.eras.map((value) => ({ value, label: value })),
            "value",
            "label",
        );
    } catch (error) {
        renderFacetError(error.message);
    }
}

async function loadTimeline() {
    elements.timeline.innerHTML = '<span class="muted">正在载入分布…</span>';
    try {
        const data = await fetchJson("/api/timeline");
        renderTimeline(data);
    } catch (error) {
        elements.timeline.innerHTML = `
            <div class="timeline-error">
                <span>时间分布载入失败</span>
                <button id="retryTimeline" class="text-button" type="button">重试</button>
            </div>`;
        document
            .querySelector("#retryTimeline")
            .addEventListener("click", loadTimeline);
    }
}

function renderTimeline(data) {
    elements.timeline.innerHTML = "";
    const max = Math.max(...data.map((item) => item.event_count), 1);
    data.slice(0, 220).forEach((item) => {
        const bar = document.createElement("div");
        bar.className = "timeline-bar";
        bar.style.height = `${Math.max(6, (item.event_count / max) * 43)}px`;
        bar.title = `${item.gregorian_year} ${item.month_label}：${item.event_count} 条`;
        elements.timeline.appendChild(bar);
    });
    if (!data.length) {
        elements.timeline.innerHTML = '<span class="muted">暂无分布数据</span>';
    }
}

function submitSearch() {
    state.offset = 0;
    searchEvents();
}

async function searchEvents() {
    const token = searchGate.issue();
    setResultsStatus("loading");
    setSearchBusy(true);

    try {
        const params = buildSearchParams(readFilterState());
        const data = await fetchJson(
            `/api/search/events?${params.toString()}`,
        );
        if (!searchGate.isCurrent(token)) return;

        state.total = data.total;
        state.items = data.items;
        renderResults(data);
        renderFilterSummary();
        setResultsStatus(data.items.length ? "ready" : "empty");
    } catch (error) {
        if (searchGate.isCurrent(token)) {
            setResultsStatus("error", error.message);
        }
    } finally {
        if (searchGate.isCurrent(token)) {
            setSearchBusy(false);
        }
    }
}

function readFilterState() {
    return {
        person: fields.person.value,
        yearFrom: fields.yearFrom.value,
        yearTo: fields.yearTo.value,
        monthFrom: state.monthFrom,
        monthTo: state.monthTo,
        month: fields.month.value,
        emperor: fields.emperor.value,
        era: fields.era.value,
        eventType: fields.eventType.value,
        keyword: fields.keyword.value,
        limit: state.limit,
        offset: state.offset,
    };
}

function renderResults(data) {
    const page = getPageMeta(state.total, state.offset, state.limit);
    elements.resultCount.textContent = `${data.total} 条记录`;
    elements.pageInfo.textContent = `第 ${page.currentPage} 页 / 共 ${page.totalPages} 页`;
    elements.prevPage.disabled = state.offset <= 0;
    elements.nextPage.disabled = state.offset + state.limit >= state.total;
    elements.resultsBody.innerHTML = "";

    data.items.forEach((item) => {
        const row = document.createElement("tr");
        const isSelected = item.id === state.selectedId;
        row.dataset.id = item.id;
        row.tabIndex = 0;
        row.setAttribute("aria-selected", String(isSelected));
        row.classList.toggle("is-selected", isSelected);
        row.innerHTML = `
            <td>${escapeHtml(item.gregorian_year || "")} ${escapeHtml(item.month_label || "未载")}</td>
            <td>${escapeHtml(item.emperor || "未载")}</td>
            <td>${escapeHtml(item.era_name || "未载")}</td>
            <td>${escapeHtml(item.person_name)}</td>
            <td><span class="type-pill type-${escapeHtml(item.event_type)}">${escapeHtml(typeLabels[item.event_type] || item.event_type)}</span></td>
            <td class="raw-text">${escapeHtml(truncate(item.raw_text, 86))}</td>`;
        row.addEventListener("click", () => selectEvent(item.id, row));
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                selectEvent(item.id, row);
            }
        });
        elements.resultsBody.appendChild(row);
    });
}

function setResultsStatus(status, message = "") {
    if (status === "loading") {
        elements.resultsBody.innerHTML = "";
        elements.resultsStatus.innerHTML = `
            <div class="status-panel" aria-label="正在查询">
                <div class="skeleton-table">
                    ${Array.from({ length: 6 }, () => '<div class="skeleton-row"></div>').join("")}
                </div>
            </div>`;
        return;
    }

    if (status === "empty") {
        elements.resultsStatus.innerHTML = `
            <div class="status-panel empty-result">
                <strong>没有找到匹配记录</strong>
                <span>可以减少筛选条件，或恢复显示全部记录。</span>
                <button id="clearEmptyFilters" class="secondary-button" type="button">清空筛选</button>
            </div>`;
        document
            .querySelector("#clearEmptyFilters")
            .addEventListener("click", clearFilters);
        return;
    }

    if (status === "error") {
        elements.resultsBody.innerHTML = "";
        elements.resultsStatus.innerHTML = `
            <div class="status-panel error-result">
                <strong>查询未能完成</strong>
                <span>${escapeHtml(normalizeError(message))}</span>
                <button id="retryResults" class="secondary-button" type="button">重新查询</button>
            </div>`;
        document
            .querySelector("#retryResults")
            .addEventListener("click", searchEvents);
        return;
    }

    elements.resultsStatus.innerHTML = "";
}

function setSearchBusy(isBusy) {
    elements.searchButton.disabled = isBusy;
    elements.searchButton.classList.toggle("is-loading", isBusy);
    elements.searchButton.querySelector(".button-label").textContent = isBusy
        ? "查询中"
        : "查询记录";
}

function renderFilterSummary() {
    const current = readFilterState();
    let activeFilters = getActiveFilters(current);
    if (state.dynastyRange) {
        activeFilters = activeFilters.filter(
            (item) => item.key !== "yearFrom" && item.key !== "yearTo",
        );
        activeFilters.unshift({
            key: "dynastyRange",
            label: "时段",
            value: state.dynastyRange === "north" ? "北宋" : "南宋",
        });
    }

    elements.filterSummary.innerHTML = "";
    activeFilters.forEach((filter) => {
        const button = document.createElement("button");
        button.className = "filter-chip";
        button.type = "button";
        button.textContent = `${filter.label}：${filter.value}`;
        button.setAttribute("aria-label", `移除筛选：${filter.label} ${filter.value}`);
        button.addEventListener("click", () => removeFilter(filter.key));
        elements.filterSummary.appendChild(button);
    });
    syncQuickFilters();
}

function removeFilter(key) {
    if (key === "dynastyRange") {
        fields.yearFrom.value = "";
        fields.yearTo.value = "";
        clearDynastyQuickFilter();
    } else if (fields[key]) {
        fields[key].value = "";
        syncCustomSelect(fields[key]);
        if (["yearFrom", "yearTo", "month", "emperor"].includes(key)) {
            clearDynastyQuickFilter();
        }
    }
    state.offset = 0;
    searchEvents();
}

async function selectEvent(id, trigger) {
    const token = detailGate.issue();
    state.selectedId = id;
    detailTrigger = trigger;
    markSelectedRow(id);
    openDetail();
    renderDetailLoading();

    try {
        const detail = await fetchJson(`/api/events/${id}`);
        if (detailGate.isCurrent(token)) {
            renderDetail(detail);
        }
    } catch (error) {
        if (detailGate.isCurrent(token)) {
            renderDetailError(id, error.message);
        }
    }
}

function markSelectedRow(id) {
    document.querySelectorAll("#resultsBody tr").forEach((row) => {
        const isSelected = Number(row.dataset.id) === id;
        row.classList.toggle("is-selected", isSelected);
        row.setAttribute("aria-selected", String(isSelected));
    });
}

function openDetail() {
    elements.detailBackdrop.hidden = false;
    elements.detailDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    void elements.detailDrawer.offsetWidth;
    elements.detailBackdrop.classList.add("is-open");
    elements.detailDrawer.classList.add("is-open");
    elements.closeDetail.focus({ preventScroll: true });
}

function closeDetail() {
    detailGate.issue();
    elements.detailBackdrop.classList.remove("is-open");
    elements.detailDrawer.classList.remove("is-open");
    elements.detailDrawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
    window.setTimeout(() => {
        if (!elements.detailDrawer.classList.contains("is-open")) {
            elements.detailBackdrop.hidden = true;
        }
    }, 220);
    if (detailTrigger?.isConnected) {
        detailTrigger.focus({ preventScroll: true });
    }
}

function renderDetailLoading() {
    elements.detailContent.innerHTML = `
        <div class="detail-loading" aria-live="polite">正在载入完整记录…</div>`;
}

function renderDetailError(id, message) {
    elements.detailContent.innerHTML = `
        <div class="detail-error">
            <div>
                <p>详情载入失败：${escapeHtml(normalizeError(message))}</p>
                <button id="retryDetail" class="secondary-button" type="button">重试</button>
            </div>
        </div>`;
    document.querySelector("#retryDetail").addEventListener("click", () => {
        const trigger = document.querySelector(`#resultsBody tr[data-id="${id}"]`);
        selectEvent(id, trigger || detailTrigger);
    });
}

function renderDetail(detail) {
    const annotations = detail.annotations.length
        ? detail.annotations
              .map(
                  (annotation) =>
                      `<p>${escapeHtml(annotation.comment_text)}</p>`,
              )
              .join("")
        : '<p class="muted">无批注</p>';

    elements.detailContent.innerHTML = `
        <p class="detail-date">${escapeHtml(detail.gregorian_year || "未载")} ${escapeHtml(detail.month_label || "未载")}</p>
        <h3 class="detail-person">${escapeHtml(detail.person_name)}</h3>
        <div class="detail-meta">
            <span>${escapeHtml(detail.emperor || "皇帝未载")}</span>
            <span>·</span>
            <span>${escapeHtml(detail.era_name || "年号未载")}</span>
            <span class="type-pill type-${escapeHtml(detail.event_type)}">${escapeHtml(typeLabels[detail.event_type] || detail.event_type)}</span>
            <span class="source-pill">${escapeHtml(detail.source_cell || "来源未载")}</span>
        </div>
        <section class="detail-section">
            <div class="detail-label">原文</div>
            <div class="source-text">${escapeHtml(detail.raw_text || "原文未载")}</div>
        </section>
        <section class="detail-section">
            <div class="detail-label">批注</div>
            <div class="annotations">${annotations}</div>
        </section>`;
}

function clearFilters() {
    Object.values(fields).forEach((field) => {
        field.value = "";
    });
    clearDynastyQuickFilter();
    syncAllCustomSelects();
    closeCustomSelects();
    state.offset = 0;
    searchEvents();
}

function turnPage(direction) {
    const next = state.offset + direction * state.limit;
    if (next < 0 || next >= state.total) return;
    state.offset = next;
    searchEvents();
}

function toggleFilters() {
    const isCollapsed = elements.workspace.classList.toggle(
        "filters-collapsed",
    );
    elements.toggleFilters.setAttribute("aria-expanded", String(!isCollapsed));
    elements.toggleFilters.textContent = isCollapsed ? "展开筛选" : "收起筛选";
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `请求失败（${response.status}）`);
    }
    return response.json();
}

function fillSelect(select, items, valueKey, labelKey) {
    const first = select.querySelector("option");
    select.innerHTML = "";
    select.appendChild(first);
    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item[valueKey];
        option.textContent = item[labelKey];
        select.appendChild(option);
    });
    rebuildCustomSelect(select);
}

function initCustomSelects() {
    document.querySelectorAll(".archive-select").forEach((select) => {
        const wrapper = document.createElement("div");
        wrapper.className = "custom-select";

        const button = document.createElement("button");
        button.className = "custom-select-button";
        button.type = "button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-expanded", "false");

        const options = document.createElement("ul");
        options.className = "custom-select-options";
        options.setAttribute("role", "listbox");

        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        wrapper.appendChild(button);
        wrapper.appendChild(options);
        customSelects.set(select, { wrapper, button, options });

        button.addEventListener("click", () => toggleCustomSelect(select));
        button.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                openCustomSelect(select, event.key === "ArrowUp");
            }
        });
        select.addEventListener("change", () => syncCustomSelect(select));
        rebuildCustomSelect(select);
    });
}

function toggleCustomSelect(select) {
    const custom = customSelects.get(select);
    if (custom.wrapper.classList.contains("is-open")) {
        closeCustomSelects();
    } else {
        openCustomSelect(select);
    }
}

function openCustomSelect(select, focusLast = false) {
    const custom = customSelects.get(select);
    closeCustomSelects();
    custom.wrapper.classList.add("is-open");
    custom.button.setAttribute("aria-expanded", "true");
    const selected = custom.options.querySelector(".is-selected");
    const target = focusLast
        ? custom.options.lastElementChild
        : selected || custom.options.firstElementChild;
    target?.focus();
}

function rebuildCustomSelect(select) {
    const custom = customSelects.get(select);
    if (!custom) return;

    custom.options.innerHTML = "";
    Array.from(select.options).forEach((option) => {
        const item = document.createElement("li");
        item.className = "custom-select-option";
        item.dataset.value = option.value;
        item.setAttribute("role", "option");
        item.tabIndex = 0;
        item.textContent = option.textContent;
        item.addEventListener("click", () =>
            chooseCustomOption(select, option.value),
        );
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                chooseCustomOption(select, option.value);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusAdjacentOption(item, event.key === "ArrowDown" ? 1 : -1);
            }
        });
        custom.options.appendChild(item);
    });
    syncCustomSelect(select);
}

function focusAdjacentOption(item, direction) {
    const options = Array.from(item.parentElement.children);
    const current = options.indexOf(item);
    const next = (current + direction + options.length) % options.length;
    options[next].focus();
}

function chooseCustomOption(select, value) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncCustomSelect(select);
    closeCustomSelects();
    customSelects.get(select).button.focus();
}

function syncCustomSelect(select) {
    const custom = customSelects.get(select);
    if (!custom) return;

    const selected = select.selectedOptions[0] || select.options[0];
    custom.button.textContent = selected?.textContent || "";
    custom.options.querySelectorAll(".custom-select-option").forEach((item) => {
        const isSelected = item.dataset.value === select.value;
        item.classList.toggle("is-selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
    });
}

function syncAllCustomSelects() {
    customSelects.forEach((_, select) => syncCustomSelect(select));
}

function closeCustomSelects() {
    customSelects.forEach((custom) => {
        custom.wrapper.classList.remove("is-open");
        custom.button.setAttribute("aria-expanded", "false");
    });
}

function hasOpenCustomSelect() {
    return Array.from(customSelects.values()).some((custom) =>
        custom.wrapper.classList.contains("is-open"),
    );
}

function applyDynastyQuickFilter(range) {
    state.dynastyRange = range;
    if (range === "north") {
        fields.yearFrom.value = "";
        fields.yearTo.value = "1127";
        state.monthFrom = "";
        state.monthTo = "4";
    } else {
        fields.yearFrom.value = "1127";
        fields.yearTo.value = "";
        state.monthFrom = "5";
        state.monthTo = "";
    }
    fields.month.value = "";
    fields.emperor.value = "";
    syncCustomSelect(fields.month);
    syncCustomSelect(fields.emperor);
}

function clearDynastyQuickFilter() {
    state.monthFrom = "";
    state.monthTo = "";
    state.dynastyRange = "";
    syncQuickFilters();
}

function syncQuickFilters() {
    document.querySelectorAll(".quick-filter").forEach((button) => {
        const isActive = button.dataset.range
            ? button.dataset.range === state.dynastyRange
            : button.dataset.type === fields.eventType.value;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function renderFacetError(message) {
    const error = document.createElement("div");
    error.id = "facetError";
    error.className = "status-panel error-result";
    error.innerHTML = `
        <span>筛选项载入失败：${escapeHtml(normalizeError(message))}</span>
        <button id="retryFacets" class="secondary-button" type="button">重试</button>`;
    document.querySelector(".filter-scroll").prepend(error);
    document.querySelector("#retryFacets").addEventListener("click", loadFacets);
}

function clearFacetError() {
    document.querySelector("#facetError")?.remove();
}

function normalizeError(message) {
    const text = String(message || "未知错误");
    try {
        const payload = JSON.parse(text);
        return payload.detail || text;
    } catch {
        return text;
    }
}

function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, length)}…` : text;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
