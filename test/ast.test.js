const assert = require("node:assert/strict");

/**
 * ast/builders + guards 单元测试
 * 目的：builders 构造的 AST 严格符合 types；guards 对边界（空 children、null、普通对象）正确；builders 节点被 guards 识别。
 */
const {
    ASTNodeBuilder,
    isLogicalNode,
    isFieldNode,
    isTrueNode,
    isFalseNode,
    visit,
} = require("../dist/ast/index.js");

const { logical, field, trueNode, falseNode } = (() => {
    const B = ASTNodeBuilder;
    return {
        logical: B.logical.bind(B),
        field: B.field.bind(B),
        trueNode: B.trueNode.bind(B),
        falseNode: B.falseNode.bind(B),
    };
})();

describe("ast module", () => {
    describe("7.1 builders 符合 types", () => {
        it("logical() 构造 LogicalNode 含 type/op/children", () => {
            const n = logical("$and", [{ type: "true" }]);
            assert.strictEqual(n.type, "logical");
            assert.strictEqual(n.op, "$and");
            assert.ok(Array.isArray(n.children));
            assert.deepStrictEqual(n, { type: "logical", op: "$and", children: [{ type: "true" }] });
        });

        it("field() 构造 FieldNode 含 type/field/conditions", () => {
            const n = field("a", [{ op: "$eq", value: 5 }]);
            assert.strictEqual(n.type, "field");
            assert.strictEqual(n.field, "a");
            assert.ok(Array.isArray(n.conditions));
            assert.deepStrictEqual(n, { type: "field", field: "a", conditions: [{ op: "$eq", value: 5 }] });
        });

        it("trueNode()/falseNode() 构造 TrueNode/FalseNode", () => {
            assert.deepStrictEqual(trueNode(), { type: "true" });
            assert.deepStrictEqual(falseNode(), { type: "false" });
        });

        it("logical 支持空 children", () => {
            const n = logical("$and", []);
            assert.strictEqual(n.type, "logical");
            assert.strictEqual(n.children.length, 0);
        });
    });

    describe("builders", () => {
        it("logical() builds a logical node", () => {
            const n = logical("$and", [{ type: "true" }]);
            assert.deepEqual(n, { type: "logical", op: "$and", children: [{ type: "true" }] });
        });

        it("field() builds a field node", () => {
            const n = field("a", [{ op: "$eq", value: 5 }]);
            assert.deepEqual(n, { type: "field", field: "a", conditions: [{ op: "$eq", value: 5 }] });
        });

        it("trueNode()/falseNode() build boolean nodes", () => {
            assert.deepEqual(trueNode(), { type: "true" });
            assert.deepEqual(falseNode(), { type: "false" });
        });
    });

    describe("7.2 guards 边界：null、空 children、普通对象", () => {
        it("null 不是任何节点类型", () => {
            assert.strictEqual(isLogicalNode(null), false);
            assert.strictEqual(isFieldNode(null), false);
            assert.strictEqual(isTrueNode(null), false);
            assert.strictEqual(isFalseNode(null), false);
        });

        it("普通对象无 type 不是任何节点", () => {
            const plain = { foo: 1 };
            assert.strictEqual(isLogicalNode(plain), false);
            assert.strictEqual(isFieldNode(plain), false);
            assert.strictEqual(isTrueNode(plain), false);
            assert.strictEqual(isFalseNode(plain), false);
        });

        it("空 children 的 logical 仍为 logical", () => {
            const n = logical("$or", []);
            assert.strictEqual(isLogicalNode(n), true);
            assert.strictEqual(isFieldNode(n), false);
        });

        it("type 为字符串 'logical'/'field'/'true'/'false' 才匹配", () => {
            assert.strictEqual(isLogicalNode({ type: "logical", op: "$and", children: [] }), true);
            assert.strictEqual(isTrueNode({ type: "true" }), true);
            assert.strictEqual(isFalseNode({ type: "false" }), true);
        });
    });

    describe("guards", () => {
        it("type guards match node kinds", () => {
            const l = logical("$or", [{ type: "false" }]);
            const f = field("x", [{ op: "$eq", value: 1 }]);
            const t = trueNode();
            const ff = falseNode();

            assert.equal(isLogicalNode(l), true);
            assert.equal(isFieldNode(l), false);

            assert.equal(isLogicalNode(f), false);
            assert.equal(isFieldNode(f), true);

            assert.equal(isTrueNode(t), true);
            assert.equal(isFalseNode(t), false);

            assert.equal(isTrueNode(ff), false);
            assert.equal(isFalseNode(ff), true);
        });
    });

    describe("7.3 builders 构造的节点被 guards 正确识别", () => {
        it("logical/field/true/false 构造后 guards 全对", () => {
            assert.strictEqual(isLogicalNode(logical("$and", [trueNode()])), true);
            assert.strictEqual(isFieldNode(field("x", [])), true);
            assert.strictEqual(isTrueNode(trueNode()), true);
            assert.strictEqual(isFalseNode(falseNode()), true);
        });
    });

    describe("visitor", () => {
        it("visit() applies fn pre-order and returns a new tree for logical nodes", () => {
            const input = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                logical("$or", [field("b", [{ op: "$eq", value: 2 }])]),
            ]);

            const seen = [];
            const out = visit(input, (node) => {
                seen.push(node.type);
                // 把所有 field 节点的字段名改大写
                if (node.type === "field") {
                    return { ...node, field: node.field.toUpperCase() };
                }
                return node;
            });

            // 访问顺序：根 -> 第一个 child -> 第二个 child(逻辑) -> 其 child(field)
            assert.deepEqual(seen, ["logical", "field", "logical", "field"]);

            // input 不应被修改
            assert.equal(input.children[0].field, "a");
            assert.equal(input.children[1].children[0].field, "b");

            // out 应反映变换
            assert.equal(out.children[0].field, "A");
            assert.equal(out.children[1].children[0].field, "B");

            // logical 节点应返回新对象
            assert.notEqual(out, input);
            assert.notEqual(out.children[1], input.children[1]);

            // field 节点被替换（新对象）
            assert.notEqual(out.children[0], input.children[0]);
        });

        it("visit() does not recurse into non-logical nodes", () => {
            const input = field("a", [{ op: "$eq", value: 1 }]);
            let count = 0;

            const out = visit(input, (node) => {
                count += 1;
                return node;
            });

            assert.equal(count, 1);
            assert.deepEqual(out, input);
        });
    });
});

