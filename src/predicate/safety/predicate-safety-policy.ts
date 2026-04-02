export type PredicateSafetyPolicy = {
    /**
     * @deprecated Deprecated: This option no longer provides reliable semantic guarantees, and will be removed in a future release.
     *
     * Notes:
     * - This library cannot prove whether a field is multikey (an array) without schema knowledge.
     * - As a result, this option no longer affects "eq.in" unsatisfiable (unsat) detection; even if set to true,
     *   it will not restore logic such as "eq ∉ in ⇒ IMPOSSIBLE_SELECTOR".
     */
    allowArraySensitiveRewrite: boolean;
    allowNullSemanticRewrite: boolean;
    allowExistsSemanticRewrite: boolean;
    allowPathConflictRewrite: boolean;
    bailoutOnUnsupportedMix: boolean;
};

export const DEFAULT_PREDICATE_SAFETY_POLICY: PredicateSafetyPolicy = {
    allowArraySensitiveRewrite: false,
    allowNullSemanticRewrite: false,
    allowExistsSemanticRewrite: false,
    allowPathConflictRewrite: false,
    bailoutOnUnsupportedMix: true,
};
