import { andNode, fieldNode, orNode } from "../ast/builders";
import { isFieldNode, isLogicalNode } from "../ast/guards";
import { hashNode, hashPredicate } from "../ast/hash";
import type { FieldPredicate, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import { stableSort } from "../utils/stable-sort";

export function canonicalize(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    return canonicalizeRecursive(node, normalizeContext);
}

function canonicalizeRecursive(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (isLogicalNode(node)) {
        let children = node.children.map((child) => canonicalizeRecursive(child, normalizeContext));

        if (normalizeContext.options.rules.sortLogicalChildren) {
            children = sortChildren(children);
        }

        return node.op === "$and" ? andNode(children) : orNode(children);
    }

    if (isFieldNode(node)) {
        let predicates: FieldPredicate[] = node.predicates;

        if (normalizeContext.options.rules.sortFieldPredicates) {
            predicates = sortPredicates(predicates);
        }

        return fieldNode(node.field, predicates);
    }

    return node;
}

function sortPredicates(predicates: FieldPredicate[]): FieldPredicate[] {
    return stableSort(predicates, (a, b) => {
        const opCmp = a.op.localeCompare(b.op);
        if (opCmp !== 0) {
            return opCmp;
        }
        return hashPredicate(a).localeCompare(hashPredicate(b));
    });
}

function sortChildren(children: QueryNode[]): QueryNode[] {
    return stableSort(children, (a, b) => hashNode(a).localeCompare(hashNode(b)));
}
