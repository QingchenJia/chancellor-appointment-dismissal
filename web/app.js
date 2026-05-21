const state = {
  limit: 30,
  offset: 0,
  total: 0,
  items: [],
  selectedId: null,
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

document.querySelector("#searchButton").addEventListener("click", () => {
  state.offset = 0;
  searchEvents();
});
document.querySelector("#clearButton").addEventListener("click", clearFilters);
document.querySelector("#resetFilters").addEventListener("click", clearFilters);
document.querySelector("#prevPage").addEventListener("click", () => turnPage(-1));
document.querySelector("#nextPage").addEventListener("click", () => turnPage(1));
document.querySelector("#exportCsv").addEventListener("click", exportCsv);

document.querySelectorAll(".quick-filters button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.range === "north") {
      fields.yearFrom.value = "960";
      fields.yearTo.value = "1127";
    }
    if (button.dataset.range === "south") {
      fields.yearFrom.value = "1127";
      fields.yearTo.value = "1279";
    }
    if (button.dataset.type) {
      fields.eventType.value = button.dataset.type;
    }
    state.offset = 0;
    searchEvents();
  });
});

init();

async function init() {
  await checkHealth();
  await loadFacets();
  await loadTimeline();
  await searchEvents();
}

async function checkHealth() {
  const health = await fetchJson("/api/health");
  document.querySelector("#healthStatus").textContent = health.loaded ? "数据库已加载" : "请先导入数据库";
}

async function loadFacets() {
  const facets = await fetchJson("/api/facets");
  fillSelect(fields.month, facets.months, "value", "label");
  fillSelect(fields.emperor, facets.emperors.map((value) => ({ value, label: value })), "value", "label");
  fillSelect(fields.era, facets.eras.map((value) => ({ value, label: value })), "value", "label");
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
  const params = new URLSearchParams();
  appendParam(params, "person", fields.person.value);
  appendParam(params, "year_from", fields.yearFrom.value);
  appendParam(params, "year_to", fields.yearTo.value);
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
  document.querySelector("#activeFilters").textContent = activeFilterText();
  document.querySelector("#pageInfo").textContent = `第 ${Math.floor(state.offset / state.limit) + 1} 页`;
  document.querySelector("#prevPage").disabled = state.offset <= 0;
  document.querySelector("#nextPage").disabled = state.offset + state.limit >= state.total;

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
    ? detail.annotations.map((annotation) => `<p>${escapeHtml(annotation.comment_text)}</p>`).join("")
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
  state.offset = 0;
  searchEvents();
}

function turnPage(direction) {
  const next = state.offset + direction * state.limit;
  if (next < 0 || next >= state.total) return;
  state.offset = next;
  searchEvents();
}

function exportCsv() {
  const rows = [["公元年", "月份", "皇帝", "年号", "人物", "事件类型", "源单元格", "原文"]];
  state.items.forEach((item) => {
    rows.push([
      item.gregorian_year,
      item.month_label,
      item.emperor,
      item.era_name,
      item.person_name,
      typeLabels[item.event_type] || item.event_type,
      item.source_cell,
      item.raw_text,
    ]);
  });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "song-chancellor-events.csv";
  link.click();
  URL.revokeObjectURL(link.href);
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
}

function activeFilterText() {
  const active = [];
  Object.entries(fields).forEach(([key, field]) => {
    if (field.value) active.push(`${key}: ${field.value}`);
  });
  return active.length ? active.join(" / ") : "当前显示全部记录";
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

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
