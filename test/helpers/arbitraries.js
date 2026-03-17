 "use strict";

 const fc = require("fast-check");

 /**
  * 公共随机构造器：
  * - 字段名
  * - 原子值
  * - 单字段条件对象 / 带逻辑组合的 selector
  *
  * 供 property-based / differential 等测试复用，从而把“数据生成层”和“断言层”拆开。
  */

 const fieldNameArb = fc.constantFrom("a", "b", "c", "x", "y");

 const primitiveValueArb = fc.oneof(
     fc.integer(-100, 100),
     fc.double({ next: true, noNaN: true, min: -1000, max: 1000 }),
     fc.boolean(),
     fc.string({ maxLength: 8 }),
     fc.constant(null)
 );

 function fieldConditionObjectArb() {
     return fc
         .oneof(
             // 字面量：{ a: 5 }
             fc.record({
                 field: fieldNameArb,
                 kind: fc.constant("literal"),
                 value: primitiveValueArb,
             }),
             // 操作符对象：{ a: { $op: value } }
             fc.record({
                 field: fieldNameArb,
                 kind: fc.constant("op"),
                 op: fc.constantFrom("$eq", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists"),
                 value: primitiveValueArb,
             })
         )
         .map((spec) => {
             if (spec.kind === "literal") {
                 return { [spec.field]: spec.value };
             }
             let rawValue = spec.value;
             if (spec.op === "$exists") {
                 rawValue = Boolean(rawValue);
             }
             const v = spec.op === "$in" || spec.op === "$nin" ? [rawValue] : rawValue;
             return { [spec.field]: { [spec.op]: v } };
         });
 }

 function selectorArb(maxDepth = 3) {
     function build(depth) {
         if (depth <= 0) {
             return fieldConditionObjectArb();
         }
         return fc.oneof(
             fieldConditionObjectArb(),
             // $and
             fc.record({
                 $and: fc.array(build(depth - 1), { minLength: 1, maxLength: 3 }),
             }),
             // $or
             fc.record({
                 $or: fc.array(build(depth - 1), { minLength: 1, maxLength: 3 }),
             }),
             // $nor
             fc.record({
                 $nor: fc.array(build(depth - 1), { minLength: 1, maxLength: 3 }),
             })
         );
     }
     return build(maxDepth);
 }

 /**
  * differentialSelectorArb：用于 differential 测试的“富 selector” 生成器
  * - 覆盖数值 / 布尔 / null / 字符串数组 / 嵌套字段（含点路径）
  * - 支持 $and / $or / $nor 组合
  */
 function differentialSelectorArb(maxDepth = 3) {
     const numericFieldArb = fc.constantFrom("a", "b", "c", "meta.score");
     const boolFieldArb = fc.constantFrom("flag");
     const levelFieldArb = fc.constantFrom("meta.level");
     const tagsFieldArb = fc.constantFrom("tags");

     const numericValueArb = fc.integer(-20, 40);
     const levelValueArb = fc.constantFrom("gold", "silver");
     const tagValueArb = fc.constantFrom("red", "green", "blue", "hot", "cold", "large", "small");

     function leafPredicateArb() {
         return fc.oneof(
             // 数值字段范围 / 等值
             fc
                 .record({
                     field: numericFieldArb,
                     op: fc.constantFrom("$eq", "$gt", "$gte", "$lt", "$lte"),
                     value: numericValueArb,
                 })
                 .map(({ field, op, value }) => ({ [field]: { [op]: value } })),

             // 布尔字段 + $exists
             fc
                 .record({
                     field: boolFieldArb,
                     op: fc.constantFrom("$eq", "$exists"),
                     value: fc.boolean(),
                 })
                 .map(({ field, op, value }) => {
                     if (op === "$exists") {
                         return { [field]: { [op]: value } };
                     }
                     return { [field]: value };
                 }),

             // level 字段枚举 + $in / $nin
             fc
                 .record({
                     field: levelFieldArb,
                     kind: fc.constantFrom("$eq", "$in", "$nin"),
                 })
                 .chain(({ field, kind }) => {
                     if (kind === "$eq") {
                         return levelValueArb.map((v) => ({ [field]: v }));
                     }
                     return fc
                         .array(levelValueArb, { minLength: 1, maxLength: 3 })
                         .map((arr) => ({ [field]: { [kind]: arr } }));
                 }),

             // tags 数组字段的 $in/$nin/$exists
             fc
                 .record({
                     field: tagsFieldArb,
                     kind: fc.constantFrom("$in", "$nin", "$exists"),
                 })
                 .chain(({ field, kind }) => {
                     if (kind === "$exists") {
                         return fc.boolean().map((v) => ({ [field]: { $exists: v } }));
                     }
                     return fc
                         .array(tagValueArb, { minLength: 1, maxLength: 4 })
                         .map((arr) => ({ [field]: { [kind]: arr } }));
                 })
         );
     }

     function build(depth) {
         if (depth <= 0) {
             return leafPredicateArb();
         }
         return fc.oneof(
             leafPredicateArb(),
             fc.record({
                 $and: fc.array(build(depth - 1), { minLength: 1, maxLength: 4 }),
             }),
             fc.record({
                 $or: fc.array(build(depth - 1), { minLength: 1, maxLength: 4 }),
             }),
             fc.record({
                 $nor: fc.array(build(depth - 1), { minLength: 1, maxLength: 3 }),
             })
         );
     }

     return build(maxDepth);
 }

 module.exports = {
     fc,
     fieldNameArb,
     primitiveValueArb,
     fieldConditionObjectArb,
     selectorArb,
     differentialSelectorArb,
 };

