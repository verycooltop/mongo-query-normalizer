import { hashNode } from "./ast/hash";
import type { QueryNode } from "./ast/types";
import { compileQuery } from "./compile/compile";
import type { NormalizeContext } from "./normalize-context";
import { createNormalizeContext } from "./normalize-context";
import { collectNodeStats } from "./observe/metrics";
import { applyPreviewLevelBoundaryHints } from "./observe/level-boundary-hints";
import { resolveNormalizeOptions } from "./options/resolve";
import { canonicalize } from "./passes/canonicalize";
import { normalizePredicate } from "./passes/normalize-predicate";
import { normalizeShape } from "./passes/normalize-shape";
import { simplify } from "./passes/simplify";
import { parseQuery } from "./parse/parse";
import { hoistCommonPredicatesFromOr } from "./rules/experimental/hoist-common-predicates-from-or";
import { detectCommonPredicatesInOr } from "./rules/logical/detect-common-predicates-in-or";
import type { NormalizeOptions, NormalizeResult, Query } from "./types";

/**
 * 主入口：parse →（shape / predicate 直至稳定）→（可选 logical / experimental）→ canonicalize → compile。
 */
export function normalizeQuery(query: Query, options?: NormalizeOptions): NormalizeResult {
    const normalizeContext = createNormalizeContext(resolveNormalizeOptions(options));
    applyPreviewLevelBoundaryHints(normalizeContext);

    const beforeNode = parseQuery(query, normalizeContext);
    recordBeforeObservation(normalizeContext, beforeNode);

    let workingNode = beforeNode;
    workingNode = runNormalizePipeline(workingNode, normalizeContext);

    const afterNode = normalizeContext.bailedOut ? beforeNode : workingNode;
    recordAfterObservation(normalizeContext, afterNode);

    const finalQuery = compileQuery(afterNode, normalizeContext);

    return buildNormalizeResult(query, finalQuery, beforeNode, afterNode, normalizeContext);
}

function recordBeforeObservation(normalizeContext: NormalizeContext, node: QueryNode): void {
    if (normalizeContext.options.observe.collectMetrics) {
        normalizeContext.beforeStats = collectNodeStats(node);
    }
    normalizeContext.beforeHash = hashNode(node);
}

function recordAfterObservation(normalizeContext: NormalizeContext, node: QueryNode): void {
    if (normalizeContext.options.observe.collectMetrics) {
        normalizeContext.afterStats = collectNodeStats(node);
    }
    normalizeContext.afterHash = hashNode(node);
}

const MAX_NORMALIZE_STABLE_ROUNDS = 8;

function runNormalizePipeline(root: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    let node = root;

    const shouldRunPredicate =
        normalizeContext.options.level === "predicate" ||
        normalizeContext.options.level === "logical" ||
        normalizeContext.options.level === "experimental";

    for (let o = 0; o < MAX_NORMALIZE_STABLE_ROUNDS; o++) {
        const outerStart = hashNode(node);

        for (let r = 0; r < MAX_NORMALIZE_STABLE_ROUNDS; r++) {
            const beforeRound = hashNode(node);
            node = normalizeShape(node, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            if (hashNode(node) === beforeRound) {
                break;
            }
        }

        if (shouldRunPredicate) {
            for (let r = 0; r < MAX_NORMALIZE_STABLE_ROUNDS; r++) {
                const beforeRound = hashNode(node);
                node = normalizePredicate(node, normalizeContext);
                if (normalizeContext.bailedOut) {
                    return root;
                }
                node = simplify(node, normalizeContext);
                if (normalizeContext.bailedOut) {
                    return root;
                }
                if (hashNode(node) === beforeRound) {
                    break;
                }
            }
        }

        if (hashNode(node) === outerStart) {
            break;
        }
    }

    const shouldRunLogicalDetect = normalizeContext.options.level === "logical" || normalizeContext.options.level === "experimental";

    if (shouldRunLogicalDetect && normalizeContext.options.rules.detectCommonPredicatesInOr) {
        node = detectCommonPredicatesInOr(node, normalizeContext);
        if (normalizeContext.bailedOut) {
            return root;
        }
    }

    const shouldRunExperimental =
        normalizeContext.options.level === "experimental" && normalizeContext.options.rules.hoistCommonPredicatesFromOr;

    if (shouldRunExperimental) {
        node = hoistCommonPredicatesFromOr(node, normalizeContext);
        if (normalizeContext.bailedOut) {
            return root;
        }
    }

    node = canonicalize(node, normalizeContext);

    return node;
}

function buildNormalizeResult(
    _originalQuery: Query,
    finalQuery: Query,
    _beforeNode: QueryNode,
    _afterNode: QueryNode,
    normalizeContext: NormalizeContext
): NormalizeResult {
    const changed = normalizeContext.beforeHash !== normalizeContext.afterHash;

    return {
        query: finalQuery,
        meta: {
            changed,
            level: normalizeContext.options.level,
            appliedRules: normalizeContext.appliedRules,
            skippedRules: normalizeContext.skippedRules,
            warnings: normalizeContext.warnings,
            bailedOut: normalizeContext.bailedOut,
            bailoutReason: normalizeContext.bailoutReason,
            beforeHash: normalizeContext.beforeHash,
            afterHash: normalizeContext.afterHash,
            stats:
                normalizeContext.options.observe.collectMetrics && normalizeContext.beforeStats && normalizeContext.afterStats
                    ? {
                        before: normalizeContext.beforeStats,
                        after: normalizeContext.afterStats,
                    }
                    : undefined,
        },
    };
}
