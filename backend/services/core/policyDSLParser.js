/**
 * Policy DSL Parser & Evaluator
 * Parses and executes declarative policy rules
 * Supports: logical operators (AND, OR, NOT), time conditions, nested rules
 * 
 * Syntax Examples:
 * 
 * rule: "action=restart AND severity=high AND confidence>0.7"
 * rule: "service=database OR service=cache"
 * rule: "NOT (time_window=night AND severity=low)"
 * rule: "confidence>0.8 AND (service=api OR service=gateway)"
 * 
 * Policy rules are declarative and fully auditable
 */

class PolicyDSLParser {
  constructor() {
    // Token types
    this.TOKEN_TYPES = {
      CONDITION: "condition",
      OPERATOR: "operator",
      PARENTHESIS: "paren",
      COMPARATOR: "comparator",
      VALUE: "value",
      EOF: "eof",
    };

    // Supported operators
    this.OPERATORS = ["AND", "OR", "NOT"];
    this.COMPARATORS = ["=", ">", "<", ">=", "<=", "==", "!="];
  }

  /**
   * Parse a DSL rule string into an evaluable AST
   * Example: "action=restart AND severity=high"
   */
  parse(ruleString) {
    if (!ruleString || typeof ruleString !== "string") {
      return this._buildErrorNode("Invalid rule: must be a non-empty string");
    }

    try {
      const tokens = this._tokenize(ruleString);
      const ast = this._parseTokens(tokens);
      return {
        success: true,
        ast,
        rule: ruleString,
      };
    } catch (error) {
      return this._buildErrorNode(`Parse error: ${error.message}`);
    }
  }

  /**
   * Tokenize the rule string
   */
  _tokenize(input) {
    const tokens = [];
    let i = 0;

    while (i < input.length) {
      const char = input[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Parentheses
      if (char === "(" || char === ")") {
        tokens.push({
          type: this.TOKEN_TYPES.PARENTHESIS,
          value: char,
        });
        i++;
        continue;
      }

      // Numbers and decimal values
      if (/[0-9]/.test(char)) {
        let number = "";
        while (i < input.length && /[0-9\.]/.test(input[i])) {
          number += input[i];
          i++;
        }
        tokens.push({
          type: this.TOKEN_TYPES.VALUE,
          value: number,
        });
        continue;
      }

      // Word (operator, condition, or value)
      if (/[a-zA-Z_]/.test(char)) {
        let word = "";
        while (i < input.length && /[a-zA-Z0-9_\.]/.test(input[i])) {
          word += input[i];
          i++;
        }

        // Check if it's an operator
        if (this.OPERATORS.includes(word.toUpperCase())) {
          tokens.push({
            type: this.TOKEN_TYPES.OPERATOR,
            value: word.toUpperCase(),
          });
        } else {
          // It's a condition name
          tokens.push({
            type: this.TOKEN_TYPES.CONDITION,
            value: word,
          });
        }
        continue;
      }

      // Comparator
      let comp = char;
      if (i + 1 < input.length && /[=<>!]/.test(input[i + 1])) {
        comp += input[i + 1];
        i += 2;
      } else {
        i++;
      }

      if (this.COMPARATORS.includes(comp)) {
        tokens.push({
          type: this.TOKEN_TYPES.COMPARATOR,
          value: comp,
        });
      }
    }

    tokens.push({ type: this.TOKEN_TYPES.EOF });
    return tokens;
  }

  /**
   * Parse tokens into AST (recursive descent parser)
   */
  _parseTokens(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    return this._parseAND();
  }

  /**
   * AND has lowest precedence (evaluated last, appears at top of tree)
   */
  _parseAND() {
    let left = this._parseOR();

    while (this._peek()?.value === "AND") {
      this._consume();
      const right = this._parseOR();
      left = {
        type: "AND",
        left,
        right,
      };
    }

    return left;
  }

  /**
   * OR has higher precedence than AND (evaluated first, appears deeper in tree)
   */
  _parseOR() {
    let left = this._parseNOT();

    while (this._peek()?.value === "OR") {
      this._consume();
      const right = this._parseNOT();
      left = {
        type: "OR",
        left,
        right,
      };
    }

    return left;
  }

  /**
   * NOT has highest precedence
   */
  _parseNOT() {
    if (this._peek()?.value === "NOT") {
      this._consume();
      const operand = this._parsePrimary();
      return {
        type: "NOT",
        operand,
      };
    }

    return this._parsePrimary();
  }

  /**
   * Primary: condition or parenthesized expression
   */
  _parsePrimary() {
    const token = this._peek();

    // Parenthesized expression
    if (token?.value === "(") {
      this._consume(); // consume (
      const expr = this._parseAND(); // Parse from lowest precedence inside parentheses
      if (this._peek()?.value !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      this._consume(); // consume )
      return expr;
    }

    // Condition: name comparator value
    if (token?.type === this.TOKEN_TYPES.CONDITION) {
      const conditionName = this._consume().value;
      const comparator = this._peek();

      if (!comparator || !this.COMPARATORS.includes(comparator.value)) {
        throw new Error(`Expected comparator after condition, got ${comparator?.value}`);
      }

      const comparatorValue = this._consume().value;
      const valueToken = this._peek();

      if (!valueToken || valueToken.type === this.TOKEN_TYPES.EOF) {
        throw new Error("Expected value after comparator");
      }

      const value = this._consume().value;

      return {
        type: "CONDITION",
        name: conditionName,
        comparator: comparatorValue,
        value,
      };
    }

    throw new Error(`Unexpected token: ${token?.value}`);
  }

  /**
   * Peek at current token without consuming
   */
  _peek() {
    return this.tokens[this.pos];
  }

  /**
   * Consume and return current token
   */
  _consume() {
    return this.tokens[this.pos++];
  }

  /**
   * Evaluate a parsed AST against a context
   * Context contains decision/signal data
   */
  evaluate(ast, context) {
    if (!ast || ast.error) {
      return {
        result: false,
        reason: "Invalid AST",
        explanation: ast?.error || "Unknown error",
      };
    }

    try {
      const result = this._evaluateNode(ast, context);
      return {
        result,
        context: context,
        trace: this._buildEvaluationTrace(ast, context),
      };
    } catch (error) {
      return {
        result: false,
        reason: "Evaluation failed",
        error: error.message,
      };
    }
  }

  /**
   * Evaluate AST node recursively
   */
  _evaluateNode(node, context) {
    if (!node) {
      return false;
    }

    switch (node.type) {
      case "OR":
        return this._evaluateNode(node.left, context) || this._evaluateNode(node.right, context);

      case "AND":
        return (
          this._evaluateNode(node.left, context) &&
          this._evaluateNode(node.right, context)
        );

      case "NOT":
        return !this._evaluateNode(node.operand, context);

      case "CONDITION":
        return this._evaluateCondition(node, context);

      default:
        return false;
    }
  }

  /**
   * Evaluate a single condition
   */
  _evaluateCondition(condition, context) {
    const contextValue = this._getContextValue(condition.name, context);

    if (contextValue === undefined) {
      console.warn(
        `[PolicyDSL] Condition value not found: ${condition.name}`
      );
      return false;
    }

    // Parse numeric values
    const left =
      isNaN(contextValue) || contextValue === true || contextValue === false
        ? contextValue
        : Number(contextValue);
    const right = isNaN(condition.value)
      ? condition.value
      : Number(condition.value);

    switch (condition.comparator) {
      case "=":
      case "==":
        return left == right; // eslint-disable-line eqeqeq
      case "!=":
        return left != right; // eslint-disable-line eqeqeq
      case ">":
        return Number(left) > Number(right);
      case "<":
        return Number(left) < Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "<=":
        return Number(left) <= Number(right);
      default:
        return false;
    }
  }

  /**
   * Get value from context (supports dot notation)
   */
  _getContextValue(path, context) {
    const parts = path.split(".");
    let current = context;

    for (const part of parts) {
      if (current && typeof current === "object") {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Build evaluation trace for auditing
   */
  _buildEvaluationTrace(ast, context) {
    const trace = {};

    // Extract all conditions and their values
    this._extractConditions(ast, context, trace);

    return trace;
  }

  /**
   * Recursively extract conditions for trace
   */
  _extractConditions(node, context, trace) {
    if (!node) {
      return;
    }

    if (node.type === "CONDITION") {
      const value = this._getContextValue(node.name, context);
      trace[node.name] = {
        expected: `${node.comparator} ${node.value}`,
        actual: value,
        met: this._evaluateCondition(node, context),
      };
    } else if (node.left) {
      this._extractConditions(node.left, context, trace);
    } else if (node.operand) {
      this._extractConditions(node.operand, context, trace);
    }

    if (node.right) {
      this._extractConditions(node.right, context, trace);
    }
  }

  /**
   * Build error node
   */
  _buildErrorNode(message) {
    return {
      success: false,
      error: message,
      ast: null,
    };
  }

  /**
   * Parse and evaluate in one call
   */
  parseAndEvaluate(ruleString, context) {
    const parsed = this.parse(ruleString);
    if (!parsed.success) {
      return parsed;
    }

    const evaluation = this.evaluate(parsed.ast, context);
    return Object.assign(parsed, evaluation);
  }
}

module.exports = PolicyDSLParser;
