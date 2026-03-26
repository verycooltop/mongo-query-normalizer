import type { NormalizeContext } from "../normalize-context";

export function addWarning(normalizeContext: NormalizeContext, message: string): void {
    if (!normalizeContext.options.observe.collectWarnings) {
        return;
    }
    normalizeContext.warnings.push(message);
}

export function markRuleApplied(normalizeContext: NormalizeContext, ruleId: string): void {
    normalizeContext.appliedRules.push(ruleId);
}

export function markRuleSkipped(normalizeContext: NormalizeContext, ruleId: string, reason?: string): void {
    normalizeContext.skippedRules.push(reason ? `${ruleId}: ${reason}` : ruleId);
}

export function bailout(normalizeContext: NormalizeContext, reason: string): void {
    normalizeContext.bailedOut = true;
    normalizeContext.bailoutReason = reason;
    addWarning(normalizeContext, `bailout: ${reason}`);
}
