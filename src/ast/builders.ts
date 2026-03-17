import type {
    FalseNode,
    FieldCondition,
    FieldNode,
    LogicalNode,
    LogicalOperator,
    SelectorAST,
    TrueNode,
} from "./types";

export class ASTNodeBuilder {
    static logical(op: LogicalOperator, children: SelectorAST[]): LogicalNode {
        return { type: "logical", op, children };
    }

    static field(fieldName: string, conditions: FieldCondition[]): FieldNode {
        return { type: "field", field: fieldName, conditions };
    }

    static trueNode(): TrueNode {
        return { type: "true" };
    }

    static falseNode(): FalseNode {
        return { type: "false" };
    }
}