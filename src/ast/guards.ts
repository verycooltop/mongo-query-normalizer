import type { FieldNode, LogicalNode, SelectorAST } from "./types";

export function isLogicalNode(node: SelectorAST): node is LogicalNode {
    return node != null && node.type === "logical";
}

export function isFieldNode(node: SelectorAST): node is FieldNode {
    return node != null && node.type === "field";
}

export function isTrueNode(node: SelectorAST): node is { type: "true" } {
    return node != null && node.type === "true";
}

export function isFalseNode(node: SelectorAST): node is { type: "false" } {
    return node != null && node.type === "false";
}
