"use strict";

const { inspect } = require("node:util");
const { ObjectId } = require("mongodb");

/** JSON.stringify 的 replacer：Date / ObjectId / RegExp 可读的近似形态 */
function jsonReplacer(_key, val) {
    if (val instanceof RegExp) {
        return { __type: "RegExp", source: val.source, flags: val.flags };
    }
    if (val instanceof Date) {
        return { __type: "Date", iso: val.toISOString() };
    }
    if (val instanceof ObjectId) {
        return { __type: "ObjectId", hex: val.toString() };
    }
    return val;
}

function safeJsonStringify(value) {
    try {
        return JSON.stringify(value, jsonReplacer, 2);
    } catch {
        return inspect(value, { depth: 6, colors: false });
    }
}

/**
 * 文档样本摘要：控制体积，便于失败时复制为回归用例
 * @param {object[]} docs
 * @param {number} maxDocs
 */
function summarizeDocs(docs, maxDocs = 8) {
    const slice = docs.slice(0, maxDocs);
    return {
        total: docs.length,
        shown: slice.length,
        sample: slice.map((d) => safeJsonStringify(d)),
    };
}

module.exports = { safeJsonStringify, summarizeDocs, jsonReplacer };
