import { falseNode, fieldNode } from "../../ast/builders";
import { isFieldNode } from "../../ast/guards";
import { hashPredicate } from "../../ast/hash";
import type { QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";
import { isMergeFalse, mergePredicates } from "./merge-predicates-internal";

export const RULE_ID = "predicate.mergeComparablePredicates";

export function mergeComparablePredicates(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isFieldNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not field");
        return node;
    }

    const merged = mergePredicates(node.predicates, normalizeContext, node.field);

    if (isMergeFalse(merged)) {
        markRuleApplied(normalizeContext, RULE_ID);
        return merged;
    }

    const unchanged =
        merged.length === node.predicates.length &&
        merged.every((p, i) => hashPredicate(p) === hashPredicate(node.predicates[i]));

    if (unchanged) {
        markRuleSkipped(normalizeContext, RULE_ID, "no comparable predicate merge applied");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return fieldNode(node.field, merged);
}
