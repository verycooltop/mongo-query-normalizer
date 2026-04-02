import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { valuesEqual } from "../../utils/value-equality";

function collectEqAtoms(predicates: PredicateAtom[]): Extract<PredicateAtom, { kind: "eq" }>[] {
    return predicates.filter((a): a is Extract<PredicateAtom, { kind: "eq" }> => a.kind === "eq");
}

export const eqEqCapability: PredicateCapability = {
    id: "eq.eq",
    description: "Merge duplicate $eq conservatively on the same field",
    riskLevel: "safe",
    supportedAtomKinds: ["eq"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable) {
            return false;
        }
        return collectEqAtoms(ctx.bundle.predicates).length >= 2;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const eqs = collectEqAtoms(ctx.bundle.predicates);
        if (eqs.length < 2) {
            return base;
        }

        const dedupedEqs: Extract<PredicateAtom, { kind: "eq" }>[] = [];
        for (let i = 0; i < eqs.length; i += 1) {
            const current = eqs[i];
            const alreadyIncluded = dedupedEqs.some((eq) => valuesEqual(eq.value, current.value));
            if (!alreadyIncluded) {
                dedupedEqs.push(current);
            }
        }

        const rest = ctx.bundle.predicates.filter((a) => a.kind !== "eq");
        const covered = eqs.filter(
            (candidate) => !dedupedEqs.some((kept) => kept === candidate)
        );
        const next = refreshBundleMetadata({
            ...ctx.bundle,
            predicates: [...dedupedEqs, ...rest],
        });

        return {
            bundle: next,
            changed: true,
            contradiction: false,
            coveredAtoms: covered,
            skippedAtoms: [],
            warnings: [],
        };
    },
};
