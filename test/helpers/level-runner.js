"use strict";

const { normalizeQuery } = require("../../dist/index.js");

/** @param {"shape"|"predicate"|"logical"|"experimental"} level */
function runAtLevel(level, query, options = {}) {
    return normalizeQuery(query, { ...options, level });
}

module.exports = { runAtLevel };
