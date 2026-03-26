"use strict";

/**
 * 全仓库 fast-check 的统一入口：语义 / property 测试应通过此模块读取配置，避免各处硬编码 seed、runs。
 *
 * 环境变量：
 * - FC_SEED（number）：随机种子，默认 42。失败日志与 fast-check 输出中的 seed 应与此一致以便复现。
 * - FC_RUNS（number）：property 的 numRuns，默认 200。`npm run test:semantic:quick` 会设为较小值。
 * - FC_QUICK（可选 "1"）：若未显式设置 FC_RUNS，则将默认 numRuns 降为 50（供本地脚本使用）。
 *
 * 复现示例：
 *   FC_SEED=123456789 FC_RUNS=200 npm run test:semantic
 *
 * 沉淀固定用例：见 test/REGRESSION.md
 */

function getFcConfig() {
    const seedRaw = process.env.FC_SEED;
    const runsRaw = process.env.FC_RUNS;
    const quick = process.env.FC_QUICK === "1" || process.env.FC_QUICK === "true";

    const seed = seedRaw !== undefined && seedRaw !== "" ? Number(seedRaw) : 42;
    let numRuns = 200;
    if (runsRaw !== undefined && runsRaw !== "") {
        numRuns = Number(runsRaw);
    } else if (quick) {
        numRuns = 50;
    }

    return {
        seed: Number.isFinite(seed) ? seed : 42,
        numRuns: Number.isFinite(numRuns) && numRuns > 0 ? numRuns : 200,
    };
}

/**
 * @param {object} [overrides] 合并进 fc.assert / fc.asyncProperty 的选项
 */
function getFcAssertOptions(overrides = {}) {
    const { seed, numRuns } = getFcConfig();
    return { seed, numRuns, ...overrides };
}

module.exports = {
    getFcConfig,
    getFcAssertOptions,
};
