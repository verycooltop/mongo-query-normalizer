import { falseNode, trueNode } from "../../ast/builders";
import { isLogicalNode } from "../../ast/guards";
import type { QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";

export const RULE_ID = "shape.removeEmptyLogical";

export function removeEmptyLogical(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not logical");
        return node;
    }

    if (node.children.length > 0) {
        markRuleSkipped(normalizeContext, RULE_ID, "logical node is not empty");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return node.op === "$and" ? trueNode() : falseNode();
}
