import {
    isRangeAtom,
    mergeRangeBoundsFromRangeAtoms,
    mergedBoundsContradict,
    type RangeLower,
    type RangeUpper,
} from "../../analysis/merge-range-bounds";
import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";

function rangeAtomFromLower(lower: RangeLower): PredicateAtom {
    if (lower.kind === "gt") {
        return { kind: "gt", value: lower.value };
    }
    return { kind: "gte", value: lower.value };
}

function rangeAtomFromUpper(upper: RangeUpper): PredicateAtom {
    if (upper.kind === "lt") {
        return { kind: "lt", value: upper.value };
    }
    return { kind: "lte", value: upper.value };
}

export const eqRangeCapability: PredicateCapability = {
    id: "eq.range",
    description:
        "When $eq/$in share a field with range atoms, canonicalize self-contradictory merged bounds only (no $in tightening)",
    riskLevel: "safe",
    supportedAtomKinds: ["eq", "in", "gt", "gte", "lt", "lte"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable) {
            return false;
        }
        const hasEq = ctx.bundle.predicates.some((a) => a.kind === "eq");
        const hasIn = ctx.bundle.predicates.some((a) => a.kind === "in");
        const hasRange = ctx.bundle.predicates.some(isRangeAtom);
        return (hasEq && hasRange) || (hasIn && hasRange);
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const predicates = ctx.bundle.predicates;
        const rangeAtoms = predicates.filter(isRangeAtom);
        const inAtoms = predicates.filter((a): a is Extract<PredicateAtom, { kind: "in" }> => a.kind === "in");
        const otherAtoms = predicates.filter((a) => !isRangeAtom(a) && a.kind !== "in");

        if (rangeAtoms.length === 0) {
            return base;
        }

        const merged = mergeRangeBoundsFromRangeAtoms(rangeAtoms);
        const hasContradictoryRangeBounds = mergedBoundsContradict(merged.lower, merged.upper);

        if (!hasContradictoryRangeBounds) {
            return base;
        }

        const rangeOut: PredicateAtom[] = [];
        if (merged.lower) {
            rangeOut.push(rangeAtomFromLower(merged.lower));
        }
        if (merged.upper) {
            rangeOut.push(rangeAtomFromUpper(merged.upper));
        }

        const nextPredicates = [...otherAtoms, ...inAtoms, ...rangeOut];
        const bundle = refreshBundleMetadata({
            ...ctx.bundle,
            predicates: nextPredicates,
        });

        return {
            bundle,
            changed: true,
            contradiction: false,
            coveredAtoms: [],
            skippedAtoms: [],
            warnings: [],
        };
    },
};
