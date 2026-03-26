import type {
    FalseNode,
    FieldNode,
    LogicalNode,
    OpaqueNode,
    QueryNode,
    TrueNode,
} from "./types";

export function isLogicalNode(node: QueryNode): node is LogicalNode {
    return node.type === "logical";
}

export function isFieldNode(node: QueryNode): node is FieldNode {
    return node.type === "field";
}

export function isTrueNode(node: QueryNode): node is TrueNode {
    return node.type === "true";
}

export function isFalseNode(node: QueryNode): node is FalseNode {
    return node.type === "false";
}

export function isOpaqueNode(node: QueryNode): node is OpaqueNode {
    return node.type === "opaque";
}
