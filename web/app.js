const state = {
    limit: 12,
    offset: 0,
    total: 0,
    items: [],
    selectedId: null,
    monthFrom: "",
    monthTo: "",
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

const typeLabels = {
    appointment: "任命/调整",
    dismissal: "罢免",
    death: "死亡/殉难",
    tenure: "任期状态",
};

const customSelects = new Map();

initCustomSelects();

document.querySelector("#searchButton").addEventListener("click", () => {
    state.offset = 0;
    searchEvents();
});
document.querySelector("#clearButton").addEventListener("click", clearFilters);
document.querySelector("#resetFilters").addEventListener("click", clearFilters);
document
    .querySelector("#prevPage")
    .addEventListener("click", () => turnPage(-1));
document
    .querySelector("#nextPage")
    .addEventListener("click", () => turnPage(1));

[
    fields.yearFrom,
    fields.yearTo,
    fields.month,
    fields.emperor,
].forEach((field) => {
    field.addEventListener("input", clearDynastyQuickFilter);
    field.addEventListener("change", clearDynastyQuickFilter);
});

document.querySelectorAll(".quick-filters button").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.range === "north") {
            applyDynastyQuickFilter("north");
        }
        if (button.dataset.range === "south") {
            applyDynastyQuickFilter("south");
        }
        if (button.dataset.type) {
            fields.eventType.value = button.dataset.type;
            syncCustomSelect(fields.eventType);
        }
        state.offset = 0;
        searchEvents();
    });
});

init();

async function init() {
    await loadFacets();
    await loadTimeline();
    await searchEvents();
}

async function loadFacets() {
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
}

async function loadTimeline() {
    const data = await fetchJson("/api/timeline");
    const container = document.querySelector("#timeline");
    container.innerHTML = "";
    const max = Math.max(...data.map((item) => item.event_count), 1);
    data.slice(0, 220).forEach((item) => {
        const bar = document.createElement("div");
        bar.className = "timeline-bar";
        bar.style.height = `${Math.max(8, (item.event_count / max) * 58)}px`;
        bar.title = `${item.gregorian_year} ${item.month_label}: ${item.event_count} 条`;
        container.appendChild(bar);
    });
}

async function searchEvents() {
    syncAllCustomSelects();
    const params = new URLSearchParams();
    appendParam(params, "person", fields.person.value);
    appendParam(params, "year_from", fields.yearFrom.value);
    appendParam(params, "year_to", fields.yearTo.value);
    appendParam(params, "month_from", state.monthFrom);
    appendParam(params, "month_to", state.monthTo);
    appendParam(params, "month", fields.month.value);
    appendParam(params, "emperor", fields.emperor.value);
    appendParam(params, "era", fields.era.value);
    appendParam(params, "event_type", fields.eventType.value);
    appendParam(params, "keyword", fields.keyword.value);
    params.set("limit", state.limit);
    params.set("offset", state.offset);

    const data = await fetchJson(`/api/search/events?${params.toString()}`);
    state.total = data.total;
    state.items = data.items;
    renderResults(data);
}

async function selectEvent(id) {
    state.selectedId = id;
    const detail = await fetchJson(`/api/events/${id}`);
    renderDetail(detail);
    document.querySelectorAll("tbody tr").forEach((row) => {
        row.classList.toggle("selected", Number(row.dataset.id) === id);
    });
}

function renderResults(data) {
    document.querySelector("#resultCount").textContent = `${data.total} 条记录`;
    document.querySelector("#pageInfo").textContent =
        `第 ${Math.floor(state.offset / state.limit) + 1} 页`;
    document.querySelector("#prevPage").disabled = state.offset <= 0;
    document.querySelector("#nextPage").disabled =
        state.offset + state.limit >= state.total;

    const body = document.querySelector("#resultsBody");
    body.innerHTML = "";
    if (!data.items.length) {
        body.innerHTML = `<tr><td colspan="6" class="muted">没有匹配记录</td></tr>`;
        return;
    }
    data.items.forEach((item) => {
        const row = document.createElement("tr");
        row.dataset.id = item.id;
        row.innerHTML = `
      <td>${escapeHtml(item.gregorian_year || "")} ${escapeHtml(item.month_label || "")}</td>
      <td>${escapeHtml(item.emperor || "")}</td>
      <td>${escapeHtml(item.era_name || "")}</td>
      <td>${escapeHtml(item.person_name)}</td>
      <td><span class="type-pill">${typeLabels[item.event_type] || item.event_type}</span></td>
      <td class="raw-text">${escapeHtml(truncate(item.raw_text, 86))}</td>
    `;
        row.addEventListener("click", () => selectEvent(item.id));
        body.appendChild(row);
    });
}

function renderDetail(detail) {
    document.querySelector("#sourceCell").textContent = detail.source_cell;
    const annotations = detail.annotations.length
        ? detail.annotations
              .map(
                  (annotation) =>
                      `<p>${escapeHtml(annotation.comment_text)}</p>`,
              )
              .join("")
        : `<p class="muted">无批注</p>`;

    document.querySelector("#detailContent").className = "";
    document.querySelector("#detailContent").innerHTML = `
    <p class="eyebrow">${escapeHtml(detail.gregorian_year || "")} ${escapeHtml(detail.month_label || "")} · ${escapeHtml(detail.emperor || "")}</p>
    <h2>${escapeHtml(detail.person_name)} <span class="type-pill">${typeLabels[detail.event_type] || detail.event_type}</span></h2>
    <div class="detail-section">
      <div class="detail-label">原文</div>
      <div class="source-text">${escapeHtml(detail.raw_text)}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">批注</div>
      ${annotations}
    </div>
  `;
}

function clearFilters() {
    Object.values(fields).forEach((field) => {
        field.value = "";
    });
    clearDynastyQuickFilter();
    state.offset = 0;
    searchEvents();
}

function turnPage(direction) {
    const next = state.offset + direction * state.limit;
    if (next < 0 || next >= state.total) return;
    state.offset = next;
    searchEvents();
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
    }
    return response.json();
}

function appendParam(params, key, value) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
        params.set(key, String(value).trim());
    }
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

        button.addEventListener("click", () => {
            const willOpen = !wrapper.classList.contains("is-open");
            closeCustomSelects(select);
            wrapper.classList.toggle("is-open", willOpen);
            button.setAttribute("aria-expanded", String(willOpen));
        });

        select.addEventListener("change", () => syncCustomSelect(select));
        rebuildCustomSelect(select);
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".custom-select")) {
            closeCustomSelects();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeCustomSelects();
        }
    });
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
        item.addEventListener("click", () => chooseCustomOption(select, option.value));
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                chooseCustomOption(select, option.value);
            }
        });
        custom.options.appendChild(item);
    });

    syncCustomSelect(select);
}

function chooseCustomOption(select, value) {
    if (select === fields.emperor) {
        clearDynastyQuickFilter();
    }
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeCustomSelects();
}

function syncCustomSelect(select) {
    const custom = customSelects.get(select);
    if (!custom) return;

    const selected = select.selectedOptions[0] || select.options[0];
    custom.button.textContent = selected ? selected.textContent : "";
    custom.options.querySelectorAll(".custom-select-option").forEach((item) => {
        const isSelected = item.dataset.value === select.value;
        item.classList.toggle("is-selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
    });
}

function syncAllCustomSelects() {
    customSelects.forEach((_, select) => syncCustomSelect(select));
}

function closeCustomSelects(exceptSelect) {
    customSelects.forEach((custom, select) => {
        if (select === exceptSelect) return;
        custom.wrapper.classList.remove("is-open");
        custom.button.setAttribute("aria-expanded", "false");
    });
}

function applyDynastyQuickFilter(range) {
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
}

function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, length)}...` : text;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
