import { andNode, orNode } from "../ast/builders";
import { isLogicalNode } from "../ast/guards";
import type { QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import { collapseSingleChildLogical } from "../rules/shape/collapse-single-child-logical";
import { dedupeLogicalChildren } from "../rules/shape/dedupe-logical-children";
import { flattenLogical } from "../rules/shape/flatten-logical";
import { removeEmptyLogical } from "../rules/shape/remove-empty-logical";

export function normalizeShape(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    return normalizeShapeRecursive(node, normalizeContext);
}

function normalizeShapeRecursive(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (isLogicalNode(node)) {
        const normalizedChildren = node.children.map((child) => normalizeShapeRecursive(child, normalizeContext));

        const rebuilt = node.op === "$and" ? andNode(normalizedChildren) : orNode(normalizedChildren);

        return applyShapeRules(rebuilt, normalizeContext);
    }

    return node;
}

function applyShapeRules(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    let current = node;

    if (normalizeContext.options.rules.flattenLogical) {
        current = flattenLogical(current, normalizeContext);
    }

    if (normalizeContext.options.rules.removeEmptyLogical) {
        current = removeEmptyLogical(current, normalizeContext);
    }

    if (normalizeContext.options.rules.collapseSingleChildLogical) {
        current = collapseSingleChildLogical(current, normalizeContext);
    }

    if (normalizeContext.options.rules.dedupeLogicalChildren) {
        current = dedupeLogicalChildren(current, normalizeContext);
    }

    return current;
}
