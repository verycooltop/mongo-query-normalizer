import type { NormalizeContext } from "../normalize-context";
import type { NormalizeLevel } from "../types";

const warnedPreviewLevelsInProcess = new Set<NormalizeLevel>();

/** Clears process-wide console dedupe state; for unit tests only. */
export function resetLevelPreviewConsoleStateForTests(): void {
    warnedPreviewLevelsInProcess.clear();
}

export function formatPreviewOnlyWarningMessage(level: NormalizeLevel): string {
    return `[mongo-query-normalizer] level "${level}" is preview-only in v0.1.0 and is not recommended for general production use. Prefer level "shape" for production traffic.`;
}

function shouldEmitConsoleWarning(): boolean {
    if (typeof process === "undefined") {
        return false;
    }
    return process.env.NODE_ENV !== "production";
}

/**
 * Records a v0.1.0 boundary hint for non-`shape` levels in `meta.warnings`, and may emit a
 * one-time-per-level `console.warn` in non-production environments.
 */
export function applyPreviewLevelBoundaryHints(normalizeContext: NormalizeContext): void {
    const level = normalizeContext.options.level;
    if (level === "shape") {
        return;
    }

    const message = formatPreviewOnlyWarningMessage(level);
    if (!normalizeContext.warnings.includes(message)) {
        normalizeContext.warnings.push(message);
    }

    if (!shouldEmitConsoleWarning()) {
        return;
    }
    if (warnedPreviewLevelsInProcess.has(level)) {
        return;
    }
    warnedPreviewLevelsInProcess.add(level);
    console.warn(message);
}
