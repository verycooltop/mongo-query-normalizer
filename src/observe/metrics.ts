import { isLogicalNode } from "../ast/guards";
import type { QueryNode } from "../ast/types";
import type { NodeStats } from "../types";

export function collectNodeStats(node: QueryNode): NodeStats {
    const acc: NodeStats = {
        nodeCount: 0,
        maxDepth: 0,
        andCount: 0,
        orCount: 0,
    };
    walkNode(node, 1, acc);
    return acc;
}

function walkNode(node: QueryNode, depth: number, acc: NodeStats): void {
    acc.nodeCount += 1;
    acc.maxDepth = Math.max(acc.maxDepth, depth);

    if (isLogicalNode(node)) {
        if (node.op === "$and") {
            acc.andCount += 1;
        }
        if (node.op === "$or") {
            acc.orCount += 1;
        }

        for (const child of node.children) {
            walkNode(child, depth + 1, acc);
        }
    }
}
