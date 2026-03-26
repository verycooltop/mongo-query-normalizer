import { andNode, fieldNode, orNode, trueNode } from "../../ast/builders";
import { containsOpaqueNode } from "../../ast/contains-opaque";
import { hashPredicate } from "../../ast/hash";
import { isFieldNode, isLogicalNode } from "../../ast/guards";
import type { FieldNode, FieldPredicate, LogicalNode, QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { collectNodeStats } from "../../observe/metrics";
import { bailout, markRuleApplied, markRuleSkipped } from "../../observe/warnings";

export const RULE_ID = "experimental.hoistCommonPredicatesFromOr";

export function hoistCommonPredicatesFromOr(node: QueryNode, normalizeContext: NormalizeContext, depth = 0): QueryNode {
    if (!isLogicalNode(node)) {
        return node;
    }

    const rewrittenChildren = node.children.map((child) => hoistCommonPredicatesFromOr(child, normalizeContext, depth + 1));

    const rebuilt = node.op === "$and" ? andNode(rewrittenChildren) : orNode(rewrittenChildren);

    if (rebuilt.op !== "$or") {
        return rebuilt;
    }

    if (!canHoistFromOr(rebuilt, normalizeContext, depth)) {
        markRuleSkipped(normalizeContext, RULE_ID, "cannot hoist safely");
        return rebuilt;
    }

    return tryHoistCommonPredicates(rebuilt, normalizeContext);
}

function canHoistFromOr(node: LogicalNode, normalizeContext: NormalizeContext, depth: number): boolean {
    if (normalizeContext.options.level !== "experimental") {
        return false;
    }
    if (!normalizeContext.options.rules.hoistCommonPredicatesFromOr) {
        return false;
    }
    if (depth > normalizeContext.options.safety.maxNormalizeDepth) {
        return false;
    }

    for (const child of node.children) {
        if (containsOpaqueNode(child)) {
            return false;
        }
    }

    return true;
}

function tryHoistCommonPredicates(node: LogicalNode, normalizeContext: NormalizeContext): QueryNode {
    const split = splitCommonPredicatesFromBranches(node.children, normalizeContext);

    if (!split || split.common.length === 0) {
        markRuleSkipped(normalizeContext, RULE_ID, "no hoistable common predicates");
        return node;
    }

    const nextOr = orNode(split.branches);
    const result = andNode([...split.common, nextOr]);

    const oldCount = collectNodeStats(node).nodeCount;
    const newCount = collectNodeStats(result).nodeCount;
    const ratio = oldCount === 0 ? 0 : newCount / oldCount;

    if (ratio > normalizeContext.options.safety.maxNodeGrowthRatio) {
        bailout(normalizeContext, `node growth ratio exceeded: ${ratio}`);
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return result;
}

function splitCommonPredicatesFromBranches(
    branches: QueryNode[],
    _normalizeContext: NormalizeContext
): { common: FieldNode[]; branches: QueryNode[] } | null {
    const normalizedBranches: FieldNode[][] = [];
    const maps: Map<string, FieldPredicate[]>[] = [];

    for (const branch of branches) {
        const fields = extractHoistableFieldNodes(branch);
        if (!fields) {
            return null;
        }

        normalizedBranches.push(fields);
        maps.push(toPredicateMap(fields));
    }

    const commonMap = intersectFieldPredicateMaps(maps);
    if (commonMap.size === 0) {
        return null;
    }

    const commonFieldNodes = commonFieldNodesFrom(commonMap);

    const nextBranches = normalizedBranches.map((fields) => {
        const remaining = removeCommonPredicates(fields, commonMap);

        if (remaining.length === 0) {
            return trueNode();
        }
        if (remaining.length === 1) {
            return remaining[0];
        }
        return andNode(remaining);
    });

    return {
        common: commonFieldNodes,
        branches: nextBranches,
    };
}

function extractHoistableFieldNodes(branch: QueryNode): FieldNode[] | null {
    if (isFieldNode(branch)) {
        return [branch];
    }

    if (isLogicalNode(branch) && branch.op === "$and") {
        if (!branch.children.every(isFieldNode)) {
            return null;
        }
        return branch.children as FieldNode[];
    }

    return null;
}

function toPredicateMap(fields: FieldNode[]): Map<string, FieldPredicate[]> {
    const m = new Map<string, FieldPredicate[]>();
    for (const f of fields) {
        m.set(f.field, [...f.predicates]);
    }
    return m;
}

function intersectFieldPredicateMaps(maps: Map<string, FieldPredicate[]>[]): Map<string, FieldPredicate[]> {
    if (maps.length === 0) {
        return new Map();
    }

    const result = new Map<string, FieldPredicate[]>();

    for (const [field, preds0] of maps[0]) {
        let common: FieldPredicate[] = preds0;
        for (let i = 1; i < maps.length; i += 1) {
            const other = maps[i].get(field);
            if (!other) {
                common = [];
                break;
            }
            common = common.filter((p) => other.some((q) => hashPredicate(p) === hashPredicate(q)));
        }
        if (common.length > 0) {
            result.set(field, common);
        }
    }

    return result;
}

function commonFieldNodesFrom(commonMap: Map<string, FieldPredicate[]>): FieldNode[] {
    return [...commonMap.entries()].map(([field, preds]) => fieldNode(field, preds));
}

function removeCommonPredicates(fields: FieldNode[], commonMap: Map<string, FieldPredicate[]>): FieldNode[] {
    const out: FieldNode[] = [];

    for (const f of fields) {
        const commonPreds = commonMap.get(f.field);
        if (!commonPreds || commonPreds.length === 0) {
            out.push(f);
            continue;
        }
        const commonHashes = new Set(commonPreds.map((p) => hashPredicate(p)));
        const remaining = f.predicates.filter((p) => !commonHashes.has(hashPredicate(p)));
        if (remaining.length === 0) {
            continue;
        }
        out.push(fieldNode(f.field, remaining));
    }

    return out;
}
