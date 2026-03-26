import { fieldNode } from "../../ast/builders";
import { isFieldNode } from "../../ast/guards";
import type { FieldPredicate, QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";
import { deepEqual } from "../../utils/deep-equal";

export const RULE_ID = "predicate.dedupeSameFieldPredicates";

function uniquePredicates(predicates: FieldPredicate[]): FieldPredicate[] {
    const result: FieldPredicate[] = [];

    for (const predicate of predicates) {
        const exists = result.some((item) => item.op === predicate.op && deepEqual(item.value, predicate.value));

        if (!exists) {
            result.push(predicate);
        }
    }

    return result;
}

export function dedupeSameFieldPredicates(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isFieldNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not field");
        return node;
    }

    const nextPredicates = uniquePredicates(node.predicates);

    if (nextPredicates.length === node.predicates.length) {
        markRuleSkipped(normalizeContext, RULE_ID, "no duplicate predicates");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return fieldNode(node.field, nextPredicates);
}
