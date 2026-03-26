"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { runFindIds } = require("./query-runner");
const { safeJsonStringify, summarizeDocs } = require("./serialize-context");

/**
 * 组装失败上下文，便于固定 seed 后写入 regression/hand-crafted-cases.test.js
 */
function formatFailureContext(ctx) {
    const lines = [
        "--- semantic equivalence / idempotency failure ---",
        `seed: ${ctx.seed}`,
        "hint: 复现 FC_SEED=<seed> [FC_RUNS=…]；沉淀见 test/REGRESSION.md 与 test/regression/cases/seeded-failure-template.js",
        `reason: ${ctx.reason}`,
        `normalizeOptions: ${safeJsonStringify(ctx.normalizeOptions ?? {})}`,
        `sort: ${safeJsonStringify(ctx.sort)}`,
        `skip: ${ctx.skip}`,
        `limit: ${ctx.limit}`,
        `rawQuery: ${safeJsonStringify(ctx.rawQuery)}`,
        `normalizedQuery: ${safeJsonStringify(ctx.normalizedQuery)}`,
        `meta (first normalize): ${safeJsonStringify(ctx.meta)}`,
    ];
    if (ctx.metaSecond) {
        lines.push(`meta (second normalize): ${safeJsonStringify(ctx.metaSecond)}`);
    }
    if (ctx.secondPassQuery !== undefined) {
        lines.push(`secondPassQuery: ${safeJsonStringify(ctx.secondPassQuery)}`);
    }
    if (ctx.beforeIds) {
        lines.push(`beforeIds: ${safeJsonStringify(ctx.beforeIds)}`);
    }
    if (ctx.afterIds) {
        lines.push(`afterIds: ${safeJsonStringify(ctx.afterIds)}`);
    }
    if (ctx.docsSummary) {
        lines.push(`docsSummary: ${safeJsonStringify(ctx.docsSummary)}`);
    }
    lines.push("--- end ---");
    return lines.join("\n");
}

class SemanticEquivalenceError extends Error {
    constructor(message, ctx) {
        super(message);
        this.name = "SemanticEquivalenceError";
        this.context = ctx;
    }
}

/**
 * 在真实集合上比对 normalize 前后 find 结果（_id 列表与顺序），并校验 query 幂等。
 */
async function assertSemanticEquivalence({
    collection,
    rawQuery,
    normalizeOptions,
    sort,
    skip,
    limit,
    seed,
    docs,
}) {
    const baseCtx = {
        seed,
        rawQuery,
        normalizeOptions,
        sort,
        skip,
        limit,
        docsSummary: docs ? summarizeDocs(docs) : undefined,
    };

    let first;
    try {
        first = normalizeQuery(rawQuery, normalizeOptions);
    } catch (err) {
        throw new SemanticEquivalenceError(
            `normalizeQuery threw: ${err.message}\n${formatFailureContext({ ...baseCtx, reason: "normalize_threw", normalizedQuery: null, meta: null })}`,
            { ...baseCtx, reason: "normalize_threw", cause: err }
        );
    }

    const normalizedQuery = first.query;
    let second;
    try {
        second = normalizeQuery(normalizedQuery, normalizeOptions);
    } catch (err) {
        throw new SemanticEquivalenceError(
            `second normalizeQuery threw: ${err.message}\n${formatFailureContext({
                ...baseCtx,
                reason: "normalize_second_threw",
                normalizedQuery,
                meta: first.meta,
            })}`,
            { ...baseCtx, reason: "normalize_second_threw", cause: err }
        );
    }

    try {
        assert.deepStrictEqual(
            second.query,
            normalizedQuery,
            "idempotency: normalize(normalize(q)) must deepEqual normalize(q) for .query"
        );
    } catch (err) {
        throw new SemanticEquivalenceError(
            `${err.message}\n${formatFailureContext({
                ...baseCtx,
                reason: "idempotency_failed",
                normalizedQuery,
                meta: first.meta,
                metaSecond: second.meta,
                secondPassQuery: second.query,
            })}`,
            { ...baseCtx, reason: "idempotency_failed" }
        );
    }

    let beforeIds;
    let afterIds;
    try {
        beforeIds = await runFindIds(collection, rawQuery, { sort, skip, limit });
        afterIds = await runFindIds(collection, normalizedQuery, { sort, skip, limit });
    } catch (err) {
        throw new SemanticEquivalenceError(
            `Mongo find failed: ${err.message}\n${formatFailureContext({
                ...baseCtx,
                reason: "mongo_threw",
                normalizedQuery,
                meta: first.meta,
            })}`,
            { ...baseCtx, reason: "mongo_threw", cause: err }
        );
    }

    const sameLength = beforeIds.length === afterIds.length;
    const sameOrder = sameLength && beforeIds.every((id, i) => id === afterIds[i]);
    if (!sameOrder) {
        throw new SemanticEquivalenceError(
            `semantic mismatch: _id lists differ in length or order.\n${formatFailureContext({
                ...baseCtx,
                reason: "semantic_mismatch",
                normalizedQuery,
                meta: first.meta,
                beforeIds,
                afterIds,
            })}`,
            { ...baseCtx, reason: "semantic_mismatch", beforeIds, afterIds, normalizedQuery, meta: first.meta }
        );
    }
}

/**
 * 两查询在 Mongo 上应给出相同 _id 序列；各自 normalize 后仍与原始执行一致且彼此一致（用于变形测试）。
 */
async function assertPairedSemanticEquivalence({
    collection,
    queryA,
    queryB,
    normalizeOptions,
    sort,
    skip,
    limit,
    seed,
    docs,
    label = "pair",
}) {
    const baseCtx = {
        seed,
        rawQuery: { label, queryA, queryB },
        normalizeOptions,
        sort,
        skip,
        limit,
        docsSummary: docs ? summarizeDocs(docs) : undefined,
    };

    let na;
    let nb;
    try {
        na = normalizeQuery(queryA, normalizeOptions);
        nb = normalizeQuery(queryB, normalizeOptions);
    } catch (err) {
        throw new SemanticEquivalenceError(
            `normalizeQuery threw (${label}): ${err.message}\n${formatFailureContext({ ...baseCtx, reason: "normalize_threw", normalizedQuery: null, meta: null })}`,
            { ...baseCtx, reason: "normalize_threw", cause: err }
        );
    }

    for (const [name, first, raw] of [
        ["A", na, queryA],
        ["B", nb, queryB],
    ]) {
        let second;
        try {
            second = normalizeQuery(first.query, normalizeOptions);
        } catch (err) {
            throw new SemanticEquivalenceError(
                `second normalize threw (${name}): ${err.message}`,
                { ...baseCtx, reason: "normalize_second_threw", cause: err }
            );
        }
        try {
            assert.deepStrictEqual(second.query, first.query, `idempotency ${name}`);
        } catch (err) {
            throw new SemanticEquivalenceError(`${err.message}\n${formatFailureContext({ ...baseCtx, reason: "idempotency_failed" })}`, {
                ...baseCtx,
                reason: "idempotency_failed",
            });
        }
    }

    let idsA;
    let idsB;
    let idsNa;
    let idsNb;
    try {
        idsA = await runFindIds(collection, queryA, { sort, skip, limit });
        idsB = await runFindIds(collection, queryB, { sort, skip, limit });
        idsNa = await runFindIds(collection, na.query, { sort, skip, limit });
        idsNb = await runFindIds(collection, nb.query, { sort, skip, limit });
    } catch (err) {
        throw new SemanticEquivalenceError(
            `Mongo find failed (${label}): ${err.message}`,
            { ...baseCtx, reason: "mongo_threw", cause: err }
        );
    }

    const same = (x, y) => x.length === y.length && x.every((id, i) => id === y[i]);

    if (!same(idsA, idsB)) {
        throw new SemanticEquivalenceError(
            `raw queries differ (${label})\n${formatFailureContext({ ...baseCtx, reason: "raw_mismatch", beforeIds: idsA, afterIds: idsB })}`,
            { ...baseCtx, reason: "raw_mismatch", beforeIds: idsA, afterIds: idsB }
        );
    }
    if (!same(idsNa, idsNb)) {
        throw new SemanticEquivalenceError(
            `normalized queries differ (${label})\n${formatFailureContext({ ...baseCtx, reason: "norm_mismatch", beforeIds: idsNa, afterIds: idsNb })}`,
            { ...baseCtx, reason: "norm_mismatch", beforeIds: idsNa, afterIds: idsNb }
        );
    }
    if (!same(idsA, idsNa)) {
        throw new SemanticEquivalenceError(
            `normalize changed results for A (${label})\n${formatFailureContext({ ...baseCtx, reason: "semantic_mismatch_a", beforeIds: idsA, afterIds: idsNa })}`,
            { ...baseCtx, reason: "semantic_mismatch_a", beforeIds: idsA, afterIds: idsNa }
        );
    }
    if (!same(idsB, idsNb)) {
        throw new SemanticEquivalenceError(
            `normalize changed results for B (${label})\n${formatFailureContext({ ...baseCtx, reason: "semantic_mismatch_b", beforeIds: idsB, afterIds: idsNb })}`,
            { ...baseCtx, reason: "semantic_mismatch_b", beforeIds: idsB, afterIds: idsNb }
        );
    }
}

module.exports = {
    assertSemanticEquivalence,
    assertPairedSemanticEquivalence,
    SemanticEquivalenceError,
    formatFailureContext,
};
