import { andNode, falseNode, orNode, trueNode } from "../ast/builders";
import { isFalseNode, isLogicalNode, isTrueNode } from "../ast/guards";
import type { QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";

export function simplify(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    return simplifyRecursive(node, normalizeContext);
}

function simplifyRecursive(node: QueryNode, _normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        return node;
    }

    const simplifiedChildren = node.children.map((child) => simplifyRecursive(child, _normalizeContext));

    const rebuilt = node.op === "$and" ? andNode(simplifiedChildren) : orNode(simplifiedChildren);

    return simplifyLogicalNode(rebuilt, _normalizeContext);
}

function simplifyLogicalNode(node: QueryNode, _normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        return node;
    }

    if (node.op === "$and") {
        if (node.children.some(isFalseNode)) {
            return falseNode();
        }

        const filtered = node.children.filter((child) => !isTrueNode(child));

        if (filtered.length === 0) {
            return trueNode();
        }
        if (filtered.length === 1) {
            return filtered[0];
        }
        return andNode(filtered);
    }

    if (node.op === "$or") {
        if (node.children.some(isTrueNode)) {
            return trueNode();
        }

        const filtered = node.children.filter((child) => !isFalseNode(child));

        if (filtered.length === 0) {
            return falseNode();
        }
        if (filtered.length === 1) {
            return filtered[0];
        }
        return orNode(filtered);
    }

    return node;
}
