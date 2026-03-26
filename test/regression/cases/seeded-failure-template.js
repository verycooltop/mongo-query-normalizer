"use strict";

/**
 * 将 fast-check / 语义测试失败时的上下文人工固化到此目录下的 *.test.js。
 *
 * 推荐流程：
 * 1. 失败断言已打印 `formatFailureContext`（含 seed、rawQuery、sort/skip/limit、beforeIds/afterIds）。
 * 2. 用相同 seed 复现：`FC_SEED=<seed> FC_RUNS=300 npm run test:semantic`（runs 可调大）。
 * 3. 在本目录新增或扩展用例：insertMany 最小文档集 + assertSemanticEquivalence({ ... })。
 *
 * 统一配置入口：`test/helpers/fc-config.js`（`FC_SEED` / `FC_RUNS` / `FC_QUICK`）。
 * 简短规范全文：`test/REGRESSION.md`。
 *
 * 注释请写明：问题类型（数组 / 路径冲突 / opaque / 幂等 / 排序 等）与原始 PR 或 issue（如有）。
 */

module.exports = {
    SEEDED_FAILURE_TEMPLATE_README: true,
};
