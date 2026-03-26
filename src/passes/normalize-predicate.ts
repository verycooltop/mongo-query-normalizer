import { andNode, fieldNode, orNode } from "../ast/builders";
import { isFieldNode, isLogicalNode } from "../ast/guards";
import type { FieldNode, FieldPredicate, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import { collapseContradictions } from "../rules/predicate/collapse-contradictions";
import { dedupeSameFieldPredicates } from "../rules/predicate/dedupe-same-field-predicates";
import { mergeComparablePredicates } from "../rules/predicate/merge-comparable-predicates";

export function normalizePredicate(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    return normalizePredicateRecursive(node, normalizeContext);
}

function normalizePredicateRecursive(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (isLogicalNode(node)) {
        const nextChildren = node.children.map((child) => normalizePredicateRecursive(child, normalizeContext));
        const mergedChildren =
            node.op === "$and" ? mergeAndSiblingFieldNodesUnderAnd(nextChildren, normalizeContext) : nextChildren;

        return node.op === "$and" ? andNode(mergedChildren) : orNode(mergedChildren);
    }

    if (isFieldNode(node)) {
        return applyPredicateRulesToField(node, normalizeContext);
    }

    return node;
}

/**
 * 同一 `$and` 层上合并同名字段子句，再跑谓词规则（可检出 `{ $and: [{ a: 1 }, { a: 2 }] }` 等矛盾）。
 */
function mergeAndSiblingFieldNodesUnderAnd(children: QueryNode[], normalizeContext: NormalizeContext): QueryNode[] {
    const byField = new Map<string, FieldPredicate[]>();
    const rest: QueryNode[] = [];

    for (const child of children) {
        if (isFieldNode(child)) {
            const cur = byField.get(child.field) ?? [];
            byField.set(child.field, [...cur, ...child.predicates]);
        } else {
            rest.push(child);
        }
    }

    const merged: QueryNode[] = [];
    for (const [field, preds] of byField) {
        merged.push(applyPredicateRulesToField(fieldNode(field, preds), normalizeContext));
    }

    return [...rest, ...merged];
}

function applyPredicateRulesToField(node: FieldNode, normalizeContext: NormalizeContext): QueryNode {
    let current: QueryNode = node;

    if (normalizeContext.options.rules.dedupeSameFieldPredicates) {
        current = dedupeSameFieldPredicates(current, normalizeContext);
    }

    if (isFieldNode(current) && normalizeContext.options.rules.mergeComparablePredicates) {
        current = mergeComparablePredicates(current, normalizeContext);
    }

    if (isFieldNode(current) && normalizeContext.options.rules.collapseContradictions) {
        current = collapseContradictions(current, normalizeContext);
    }

    return current;
}
