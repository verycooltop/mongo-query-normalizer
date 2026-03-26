# Mongo Query Normalizer — 规格说明

`mongo-query-normalizer` 的**行为向**规格：可测试、可分层，定位为 **normalizer**，不是执行计划优化器。

---

## 1. 目标

1. 将 MongoDB **查询对象**解析为内部 **AST**。  
2. 按 **level** 启用规范化步骤，**默认最保守**。  
3. 编译回普通对象并附带 **可观测 meta**。

对已建模算子（§7），在满足条件下追求：

```
match(query, doc) == match(normalized(query), doc)
```

若在 `predicate` 及以上层级下可证明**不可满足**，编译结果可为：

```
normalized(query) = IMPOSSIBLE_SELECTOR
```

当前实现中 `IMPOSSIBLE_SELECTOR` 为：`{ $expr: { $eq: [1, 0] } }`。

---

## 2. 对外边界

对外契约仅 **`normalizeQuery`**、**`resolveNormalizeOptions`** 及包入口导出的**类型**。AST、parse、compile、规则与 pass **不**保证 semver 稳定。

**默认：** `resolveNormalizeOptions()` 的 `level` 为 **`"shape"`**。

---

## 3. 固定管线

单次 `normalizeQuery`：

```
parseQuery
→ normalizeShape
→ normalizePredicate   （level 为 predicate / logical / experimental 时）
→ simplify             （同上）
→ （logical / experimental 下的 $or 公共谓词检测，受规则开关控制）
→ （experimental 下的 hoist，受规则开关控制）
→ canonicalize
→ compileQuery
```

---

## 4. 熔断策略

一旦 **bailout**，最终用于 compile 的节点 **回退为 beforeNode**（该次调用的 parse 结果），即：

- `meta.bailedOut === true` 时，**不**采用中间规范化结果作为输出基础。

---

## 5. AST 模型（摘要）

- `LogicalNode` — `$and` / `$or` 与子节点列表  
- `FieldNode` — 字段名与谓词列表  
- `TrueNode` / `FalseNode`  
- `OpaqueNode` — 原始片段透传  

（具体字段属实现细节，行为以本文与测试为准。）

---

## 6. Level 与规则

### 6.1 `shape`（默认）

仅安全结构规范化；**不**做谓词级合并；**不**将矛盾收敛为 `FalseNode`。

### 6.2 `predicate`

在 `shape` 上增加：同字段去重、可合并谓词合并、矛盾检测等。

**特别说明：** 在 `normalizePredicate` 中，`$and` 下**同名 field 的直接子 `FieldNode`** 可能先合并，再进入谓词规范化，从而能检出 `{ $and: [{ a: 1 }, { a: 2 }] }` 这类矛盾。

### 6.3 `logical`

在 `predicate` 上增加对 `$or` 中公共谓词的**检测**（规则开启时）；**默认不上提**。

### 6.4 `experimental`

可开启从 `$or` **hoist** 公共谓词等实验能力；**不应**作为线上无差别默认。

---

## 7. 已建模 vs opaque

**已建模**（可走合并/矛盾路径）：至少包含实现所支持的 `$eq`、`$ne`、`$gt`、`$gte`、`$lt`、`$lte`、`$in`、`$nin`、`$exists` 等。

**opaque / 支持有限**：尤其 **`$nor`**、**`$regex`**、**`$elemMatch`**、**`$expr`**、**`$not`**、geo/text、未知 `$` 算子等——以透传或部分处理为主，**不保证**完整语义改写。

---

## 8. compile 策略

- `TrueNode` → `{}`  
- `FalseNode` → `IMPOSSIBLE_SELECTOR`  
- `OpaqueNode` → 按实现原样透传  
- `FieldNode` / `LogicalNode` → 对应 BSON 查询形状  

---

## 9. 非目标

- 不做 MongoDB **planner** 或索引优化。  
- 不追求覆盖全部 Mongo 算子。  
- **默认**不做复杂逻辑上提。  

---

## 10. 不变量（无熔断时）

- 已建模算子上对可满足查询的**语义保持**（§1）。  
- **幂等性**：相同 options 下多次规范化应稳定。  
- **不修改**调用方传入的 query 对象。  

---

## 11. 测试要求

应覆盖：默认 `shape`、`predicate` 显式开启、`meta` 字段、熔断回退、基础幂等。可选：对接真实 MongoDB 做差分回归。
