import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { uniqueUnknownArray } from "../../utils/set-ops";
import { valuesEqual } from "../../utils/value-equality";

function normalizeInAtoms(predicates: PredicateAtom[]): { next: PredicateAtom[]; changed: boolean } {
    let changed = false;
    const next: PredicateAtom[] = [];
    for (const atom of predicates) {
        if (atom.kind === "in") {
            const uniq = uniqueUnknownArray(atom.values);
            if (uniq.length !== atom.values.length) {
                changed = true;
                next.push({ kind: "in", values: uniq });
            } else {
                next.push(atom);
            }
        } else {
            next.push(atom);
        }
    }
    return { next, changed };
}

export const eqInCapability: PredicateCapability = {
    id: "eq.in",
    description:
        "Deduplicate $in values; when $eq value is contained in every $in list, drop redundant $in atoms (safe collapse only)",
    riskLevel: "guarded",
    supportedAtomKinds: ["eq", "in"],
    isApplicable(ctx: RelationContext): boolean {
        const hasIn = ctx.bundle.predicates.some((a) => a.kind === "in");
        if (!hasIn) {
            return false;
        }
        const needsMerge = ctx.engine.mergeComparable;
        if (!needsMerge) {
            return false;
        }
        return true;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        let predicates = ctx.bundle.predicates;
        let changed = false;
        const coveredAtoms: PredicateAtom[] = [];

        const normalized = normalizeInAtoms(predicates);
        predicates = normalized.next;
        changed = normalized.changed;

        let ins = predicates.filter((a): a is Extract<PredicateAtom, { kind: "in" }> => a.kind === "in");

        const eq = predicates.find((a) => a.kind === "eq");

        if (eq && eq.kind === "eq" && ins.length > 0) {
            const eqIsInEveryInList = ins.every((inAtom) => inAtom.values.some((item) => valuesEqual(item, eq.value)));
            if (eqIsInEveryInList) {
                coveredAtoms.push(...ins);
                predicates = predicates.filter((a) => a.kind !== "in");
                changed = true;
                ins = [];
            }
        }

        if (!changed) {
            return base;
        }

        return {
            bundle: refreshBundleMetadata({ ...ctx.bundle, predicates }),
            changed: true,
            contradiction: false,
            coveredAtoms,
            skippedAtoms: [],
            warnings: [],
        };
    },
};
