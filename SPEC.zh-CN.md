# Mongo Query Rewriter Specification

形式化规格：将 `mongo-query-rewriter` 的行为从「实现驱动」转为**规则驱动 + 可验证**。内容保持可执行和可测试。

---

## 1. Overview

`mongo-query-rewriter` 的目标：

1. 将 MongoDB selector 转换为 **AST**
2. 对 AST 进行 **语义等价重写**
3. 输出 **canonical selector**

重写必须满足：

```
match(query, doc) == match(rewrite(query), doc)
```

除非 **query 不可满足**，此时：

```
rewrite(query) = IMPOSSIBLE_SELECTOR
```

---

## 2. Core Concepts

### 2.1 Selector

Selector 定义为：

```
Selector = Document → Boolean
```

例如 `{ a: { $gt: 5 } }` 等价于 `doc => doc.a > 5`。

### 2.2 Impossible Selector

系统唯一不可满足 selector：

```
IMPOSSIBLE_SELECTOR = { _id: { $exists: false } }
```

要求：对所有 doc 有 `match(IMPOSSIBLE_SELECTOR, doc) = false`。

---

## 3. Pipeline

重写流程：

```
rewrite(query):
  parse
  → normalize
  → predicateMerge
  → simplify
  → canonicalize
  → compile
```

每一步必须保持语义等价：`match(step_i(query)) == match(query)`，除非 simplify 产生 falseNode。

---

## 4. AST Specification

AST Node 类型：`Node = LogicalNode | FieldNode | TrueNode | FalseNode`。

### 4.1 LogicalNode

- `type: "logical"`
- `op: "$and" | "$or" | "$nor"`
- `children: Node[]`
- 约束：`children.length ≥ 0`

### 4.2 FieldNode

- `type: "field"`
- `field: string`
- `conditions: Condition[]`
- 约束：`conditions.length ≥ 1`，否则退化为 TrueNode。

### 4.3 TrueNode

- `type: "true"`
- 语义：`match(TrueNode, doc) = true`

### 4.4 FalseNode

- `type: "false"`
- 语义：`match(FalseNode, doc) = false`

---

## 5. Condition Model

`Condition = { op: Operator, value: any }`。

### 5.1 Supported Operators

`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`。

### 5.2 Opaque / Fallback Operators

以下 operator **当前不做语义级建模**：`$regex`, `$elemMatch`, `$size`, `$type`, `$mod` 以及其他未知 `$` 前缀运算符。

当前实现的约定：

- **parse**：
    - 已知的 `$regex` 直接建模为 `RegexCondition`；
    - 其他未显式支持的 `$` 运算符统一**降级为 `$eq` 包装的字面量值**，例如：

      ```js
      { a: { $elemMatch: { x: 1 } } }
      // ↓ parse 后视为
      { field: "a", conditions: [{ op: "$eq", value: { $elemMatch: { x: 1 } } }] }
      ```

- **simplify / conflict / tighten**：
    - 仅对已建模的运算符集合（`$eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$exists`）做收紧与冲突检测；
    - 对上述 fallback 条件**视作普通 `$eq` 字面量**处理，不做额外推理。

- **compile**：
    - 将 `RegexCondition` 编译回 `{ field: { $regex: ... } }`；
    - 其他 fallback 条件则原样以字面量形式输出。

> 未来若要对 `$elemMatch` / `$size` / `$type` / `$mod` 建模，需要：
> 1）扩展 `FieldCondition` 类型；2）在 parse / simplify / conflicts / canonicalize / compile 中补齐语义；3）移除相应“退化为 `$eq` 包装”的逻辑与测试。

---

## 6. Normalization Rules

### 6.1 AND Flatten

`$and([a, $and([b,c])])` → `$and([a,b,c])`。

### 6.2 Empty Logic

- `$and([])` → true
- `$or([])` → false
- `$nor([])` → true

### 6.3 Single Child

- `$and([x])` → x
- `$or([x])` → x

---

## 7. Predicate Merge

仅在 `$and` 中执行：**same field → merge**。

例：`$and([{a: {$gt:5}}, {a: {$lt:10}}])` → `a: {$gt:5, $lt:10}`。

---

## 8. Conflict Detection

冲突定义：对所有 doc 有 `match(selector, doc) = false`。

- **8.1 Equality**：`$eq:5` 与 `$eq:6` 冲突。
- **8.2 Range**：`$gt:10` 与 `$lt:5` 冲突。
- **8.3 Exists**：`$exists:false` 与 `$eq:5` 冲突。
- **8.4 IN**：`$in:[1,2]` 与 `$in:[3]` 冲突。
- **8.5 EQ vs NIN**：`$eq:5` 与 `$nin:[5]` 冲突。

---

## 9. Simplification Rules

Simplify 包含：**tighten**、**prune**、**conflict detect**。

- **9.1 AND**：`$and([... true ...])` → 移除 true；`$and([... false ...])` → false。
- **9.2 OR**：`$or([... true ...])` → true；`$or([... false ...])` → 移除 false。
- **9.3 NOR**：`$nor([true])` → false；`$nor([false])` → true。

---

## 10. Tightening

父约束可收紧子约束。例：parent `a > 5`、child `a > 1` → child 变为 `a > 5`。

---

## 11. Canonical Form

### 11.1 AND Node Ordering

fields 在前，logical nodes 在后。

### 11.2 FieldNode Order

按 `indexSpecs` 排序；无 index 时按字母序。

### 11.3 Unique FieldNode

一个 field 对应一个 FieldNode。

### 11.4 Condition Ordering

Condition 顺序：`$eq` → `$gt` → `$gte` → `$lt` → `$lte` → `$in` → `$nin` → `$exists` → `$ne`。

---

## 12. Compile Rules

- **12.1 Equality Shortcut**：`{a: {$eq:5}}` → `{a: 5}`。
- **12.2 Logical**：`$and` / `$or` / `$nor` 保持结构。
- **12.3 TrueNode** → `{}`。
- **12.4 FalseNode** → `IMPOSSIBLE_SELECTOR`。

---

## 13. Invariants

- **13.1 Semantic Preservation**：`match(query, doc) == match(rewrite(query), doc)`。
- **13.2 Idempotency**：`rewrite(rewrite(q)) == rewrite(q)`。
- **13.3 Canonical Stability**：`canonicalize(rewrite(q)) == rewrite(q)`。
- **13.4 Structural Safety**：优化不得 **mutate input query**。

---

## 14. Complexity Guarantees

- 优化复杂度：**O(N log N)**，N 为 AST node count。
- 最大支持：depth ≤ 1000，nodes ≤ 10000。

---

## 15. Unsupported Behavior

不保证优化：`$geo`, `$text`, `$where`, `$jsonSchema`。这些 operator 按 **opaque** 处理。

---

## 16. Testing Requirements

- **Unit**：parse、normalize、merge、conflicts、simplify、canonicalize、compile。
- **Property**：随机 selector 1000+，验证 semantic preservation。
- **Fuzz**：10000 selectors，验证 no crash、idempotent。
- **Differential**：使用 MongoDB 验证 `find(query) == find(rewrite(query))`。

### 16.1 Operator Coverage Matrix

每个操作符在各阶段的支持情况必须在测试中被覆盖：


| Operator       | parse                | merge | conflict | simplify | compile             |
| -------------- | -------------------- | ----- | -------- | -------- | ------------------- |
| `$eq`          | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$ne`          | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$gt`          | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$gte`         | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$lt`          | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$lte`         | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$in`          | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$nin`         | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$exists`      | ✓                    | ✓     | ✓        | ✓        | ✓                   |
| `$regex`       | ✓（专用条件类型）    | -     | -        | -        | ✓（原样输出）       |
| 其他未知 `$op` | ✓（降级为 `$eq` 包装） | -     | （按 `$eq`） | （按 `$eq`） | ✓（字面量形式输出） |


> 说明：本表反映的是**当前实现**而非最终目标。未来若对 `$elemMatch` / `$size` / `$type` 等做语义建模，再将它们从“未知 `$op`”行中拆出，按正式支持的运算符维护。

要求：

> 每个 `✓` 必须有至少一条单元测试或端到端测试覆盖。

### 16.2 AST Invariants

AST 层必须满足以下不变量（可通过 `ast.test.js` 等测试验证）：

- LogicalNode：
  - `type === "logical"` 时，`children` 必为数组，且元素均为 `SelectorAST`。
- FieldNode：
  - `conditions.length > 0`；若优化过程中产生空 `conditions`，必须在 simplify 阶段转为 TrueNode 或被 prune。
- Visitor：
  - `visit(node, fn)` 对 logical 节点返回 **新对象**（结构不变），不修改输入节点；
  - 对非 logical 节点 **不递归** children。

### 16.3 Test Architecture（建议）

测试结构建议遵循：

1. `parse.test.js`：AST 建模与解析不变量。
2. `normalize.test.js`：结构等价变换（不涉及谓词语义）。
3. `predicate-merge.test.js`：同字段条件合并。
4. `conflicts.test.js`：冲突/不可满足判定完整矩阵。
5. `simplify.test.js`：tighten + prune + context 传播。
6. `canonicalize.test.js`：规范顺序与幂等性。
7. `compile.test.js`：AST → selector 的语义保持。
8. `rewrite.test.js` / `roundtrip.test.js`：端到端 + 全局不变量（§13）。
9. `robustness.test.js` / `invariants.test.js`：栈安全、输入不变性、极端用例。

---

## 17. Future Extensions

规划支持：`$elemMatch`, `$size`, `$type`, `$all`, `$not`。支持后需更新 parse、merge、conflict、simplify、compile 与 tests。
