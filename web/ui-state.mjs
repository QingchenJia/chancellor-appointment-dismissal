const queryKeys = {
    person: "person",
    yearFrom: "year_from",
    yearTo: "year_to",
    monthFrom: "month_from",
    monthTo: "month_to",
    month: "month",
    emperor: "emperor",
    era: "era",
    eventType: "event_type",
    keyword: "keyword",
    limit: "limit",
    offset: "offset",
};

const filterLabels = {
    person: "人物",
    yearFrom: "起始年",
    yearTo: "终止年",
    month: "月份",
    emperor: "皇帝",
    era: "年号",
    eventType: "事件类型",
    keyword: "关键词",
};

const eventLabels = {
    appointment: "任命/调整",
    dismissal: "罢免",
    death: "死亡/殉难",
};

export function buildSearchParams(state) {
    const params = new URLSearchParams();
    Object.entries(queryKeys).forEach(([stateKey, queryKey]) => {
        const value = state[stateKey];
        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
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
        if (
            value === undefined ||
            value === null ||
            String(value).trim() === ""
        ) {
            return [];
        }
        const text =
            key === "eventType"
                ? eventLabels[value] || value
                : String(value).trim();
        return [{ key, label: filterLabels[key], value: text }];
    });
}

export function createRequestGate() {
    let current = 0;
    return {
        issue() {
            current += 1;
            return current;
        },
        isCurrent(token) {
            return token === current;
        },
    };
}

export function clearFilterValue(state, key) {
    return { ...state, [key]: "" };
}
