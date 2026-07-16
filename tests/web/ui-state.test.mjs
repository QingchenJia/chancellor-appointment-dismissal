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
        person: " 赵普 ",
        yearFrom: "",
        yearTo: "1127",
        month: "",
        emperor: "",
        era: "",
        eventType: "appointment",
        keyword: "",
        monthFrom: "",
        monthTo: "4",
        limit: 12,
        offset: 0,
    });

    assert.equal(
        params.toString(),
        "person=%E8%B5%B5%E6%99%AE&year_to=1127&month_to=4&event_type=appointment&limit=12&offset=0",
    );
});

test("getPageMeta returns one display page for an empty result", () => {
    assert.deepEqual(getPageMeta(0, 0, 12), {
        currentPage: 1,
        totalPages: 1,
    });
    assert.deepEqual(getPageMeta(25, 12, 12), {
        currentPage: 2,
        totalPages: 3,
    });
});

test("getActiveFilters returns readable labels only for active values", () => {
    assert.deepEqual(
        getActiveFilters({
            person: "赵普",
            yearFrom: "960",
            yearTo: "",
            eventType: "dismissal",
        }),
        [
            { key: "person", label: "人物", value: "赵普" },
            { key: "yearFrom", label: "起始年", value: "960" },
            { key: "eventType", label: "事件类型", value: "罢免" },
        ],
    );
});

test("request gate rejects responses older than the latest request", () => {
    const gate = createRequestGate();
    const first = gate.issue();
    const second = gate.issue();

    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
});
