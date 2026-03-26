"use strict";

function deepClone(obj) {
    return structuredClone(obj);
}

function mulberry32(a) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleWithSeed(items, seed) {
    const rng = mulberry32(Number(seed) >>> 0);
    const a = items.map((x) => deepClone(x));
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}

/** 外层单元素 $and 包裹（与 Mongo 语义等价） */
function wrapSingleElementAnd(query) {
    return { $and: [deepClone(query)] };
}

/** 顶层 $and 子句顺序重排 */
function shuffleTopLevelAnd(query, seed) {
    if (!query || !Array.isArray(query.$and) || query.$and.length < 2) {
        return null;
    }
    return { $and: shuffleWithSeed(query.$and, seed) };
}

/** 在顶层 $and 中重复一条已有子句 */
function duplicateTopLevelAndChild(query, childIndex) {
    if (!query || !Array.isArray(query.$and) || query.$and.length === 0) {
        return null;
    }
    const q = deepClone(query);
    const i = childIndex % q.$and.length;
    q.$and.push(deepClone(q.$and[i]));
    return q;
}

/** 冗余嵌套：{$and:[{$and:[...]}]} */
function redundantNestedAnd(query) {
    if (!query || !Array.isArray(query.$and)) {
        return null;
    }
    return { $and: [deepClone(query)] };
}

/**
 * 在可应用时返回变形后的查询；否则返回 null（调用方应跳过）。
 * @param {"wrap"|"shuffle"|"dup"|"nest"} kind
 */
/**
 * 同字段范围：单对象多算子 ↔ 拆成 $and 多子句（Mongo 语义等价，用于压 normalize 合并路径）。
 */
function sameFieldRangeCombinedVersusSplit(field, gt, lt) {
    const combined = { [field]: { $gt: gt, $lt: lt } };
    const split = { $and: [{ [field]: { $gt: gt } }, { [field]: { $lt: lt } }] };
    return { combined, split };
}

/**
 * 同字段范围：合并写法 ↔ 带重复子句的 $and（仍等价）。
 */
function sameFieldRangeCombinedVersusRedundantAnd(field, gte, lte) {
    const combined = { [field]: { $gte: gte, $lte: lte } };
    const redundant = {
        $and: [{ [field]: { $gte: gte } }, { [field]: { $lte: lte } }, { [field]: { $gte: gte } }],
    };
    return { combined, redundant };
}

/**
 * 标量等值 ↔ 显式 $eq（等价构造）。
 */
function sameFieldScalarVersusEq(field, value) {
    return {
        scalar: { [field]: value },
        explicit: { [field]: { $eq: value } },
    };
}

/**
 * 路径冲突查询外再包一层等价 $and（结构性变形，语义不变）。
 */
function wrapTopLevelAndIfApplicable(query) {
    if (!query || typeof query !== "object") {
        return null;
    }
    return { $and: [deepClone(query)] };
}

function morphQuery(query, kind, seed) {
    switch (kind) {
        case "wrap":
            return wrapSingleElementAnd(query);
        case "shuffle":
            return shuffleTopLevelAnd(query, seed);
        case "dup": {
            const dup = duplicateTopLevelAndChild(query, seed);
            return dup && dup.$and.length > query.$and.length ? dup : null;
        }
        case "nest":
            return redundantNestedAnd(query);
        default:
            return null;
    }
}

module.exports = {
    deepClone,
    wrapSingleElementAnd,
    shuffleTopLevelAnd,
    duplicateTopLevelAndChild,
    redundantNestedAnd,
    sameFieldRangeCombinedVersusSplit,
    sameFieldRangeCombinedVersusRedundantAnd,
    sameFieldScalarVersusEq,
    wrapTopLevelAndIfApplicable,
    morphQuery,
    shuffleWithSeed,
};
