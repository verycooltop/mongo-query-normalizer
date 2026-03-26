# 回归与 property 失败沉淀（简短说明）

## 如何复现 fast-check / 语义测试失败

1. 查看失败输出中的 **seed** 与 **counterexample**（或 `formatFailureContext` 打印的字段）。
2. 使用与 `test/helpers/fc-config.js` 一致的环境变量重跑：
   - `FC_SEED=<整数>`：与日志中 seed 对齐。
   - `FC_RUNS`：可适当增大以稳定复现（例如 `500`）。
3. 示例：

```bash
FC_SEED=123456789 FC_RUNS=300 npm run test:semantic
```

配置入口统一为 **`getFcConfig()`**（定义在 `test/helpers/fc-config.js`，并由 `arbitraries.js` 再导出）。

## 何时把 seed 沉淀成固定用例

- 同一类失败在 **缩小后的查询/文档** 上仍可稳定触发。
- 属于 **高风险语义区**（同字段合并、路径冲突、排序分页、数组算子等），值得长期盯防。
- 已修 bug：务必加 **handcrafted** 用例防止再犯。

## 命名建议

- 文件：`test/regression/cases/<主题>.test.js`（如 `same-field-merge.test.js`、`path-conflicts.test.js`）。
- `it` 描述：**断言类型 + 场景**（例：`范围：$gt+$lt 矛盾时结果集仍与 Mongo 一致`）。

## 按维度分类（推荐目录/文件职责）

| 维度 | 示例文件 |
|------|-----------|
| same-field merge | `cases/same-field-merge.test.js` |
| path conflict | `cases/path-conflicts.test.js` |
| arrays | `property/semantic-equivalence.arrays-paths.test.js` |
| sort / pagination | `cases/sort-pagination.test.js` |
| opaque contracts | `contracts/opaque-operators.test.js` |
| dirty documents | `property/semantic-equivalence.dirty-documents.test.js` |

更多流程说明见 `test/regression/cases/seeded-failure-template.js` 顶部注释。
