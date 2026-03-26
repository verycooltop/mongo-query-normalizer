import { falseNode } from "../../ast/builders";
import { isFieldNode } from "../../ast/guards";
import type { FieldPredicate, QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";
import { deepEqual } from "../../utils/deep-equal";

export const RULE_ID = "predicate.collapseContradictions";

function hasExplicitContradiction(predicates: FieldPredicate[], field: string, _normalizeContext: NormalizeContext): boolean {
    const eq = predicates.find((p) => p.op === "$eq");
    const neList = predicates.filter((p) => p.op === "$ne");
    const inList = predicates.filter((p) => p.op === "$in");

    if (eq) {
        for (const ne of neList) {
            if (deepEqual(eq.value, ne.value)) {
                return true;
            }
        }

        for (const inPredicate of inList) {
            if (!Array.isArray(inPredicate.value)) {
                continue;
            }
            const found = (inPredicate.value as unknown[]).some((item) => deepEqual(item, eq.value));
            if (!found) {
                return true;
            }
        }
    }

    return false;
}

export function collapseContradictions(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isFieldNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not field");
        return node;
    }

    const hasConflict = hasExplicitContradiction(node.predicates, node.field, normalizeContext);

    if (!hasConflict) {
        markRuleSkipped(normalizeContext, RULE_ID, "no explicit contradiction");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return falseNode();
}
