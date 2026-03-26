import { isLogicalNode, isOpaqueNode } from "./guards";
import type { QueryNode } from "./types";

export function containsOpaqueNode(node: QueryNode): boolean {
    if (isOpaqueNode(node)) {
        return true;
    }
    if (isLogicalNode(node)) {
        return node.children.some(containsOpaqueNode);
    }
    return false;
}
