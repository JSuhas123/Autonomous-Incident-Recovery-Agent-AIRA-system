/**
 * Unit Tests: Policy DSL Parser
 * Tests parsing and evaluation of declarative policy rules
 */

const { policyDSLParser: PolicyDSLParser } = require('../../services/core');

describe('PolicyDSLParser', () => {
  let parser;

  beforeEach(() => {
    parser = new PolicyDSLParser();
  });

  describe('parsing', () => {
    test('should parse simple condition', () => {
      const result = parser.parse('action=restart');
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('CONDITION');
    });

    test('should parse AND conditions', () => {
      const result = parser.parse('action=restart AND severity=high');
      expect(result.success).toBe(true);
      expect(result.ast.type).toBe('AND');
    });

    test('should parse OR conditions', () => {
      const result = parser.parse('service=api OR service=gateway');
      expect(result.success).toBe(true);
      expect(result.ast.type).toBe('OR');
    });

    test('should parse NOT conditions', () => {
      const result = parser.parse('NOT severity=low');
      expect(result.success).toBe(true);
      expect(result.ast.type).toBe('NOT');
    });

    test('should parse complex nested expressions', () => {
      const result = parser.parse(
        '(action=restart AND severity=high) OR (action=alert AND confidence>0.8)'
      );
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });

    test('should handle all comparison operators', () => {
      const operators = ['>', '<', '>=', '<=', '==', '!='];
      
      operators.forEach((op) => {
        const result = parser.parse(`confidence${op}0.7`);
        expect(result.success).toBe(true);
      });
    });

    test('should report parse errors', () => {
      const result = parser.parse('action restart'); // Missing =
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle missing closing parenthesis', () => {
      const result = parser.parse('(action=restart AND severity=high');
      expect(result.success).toBe(false);
    });
  });

  describe('evaluation', () => {
    test('should evaluate simple conditions', () => {
      const parsed = parser.parse('action=restart');
      const result = parser.evaluate(parsed.ast, { action: 'restart' });

      expect(result.result).toBe(true);
    });

    test('should evaluate with comparison operators', () => {
      const parsed = parser.parse('confidence>0.7');
      
      const resultHigh = parser.evaluate(parsed.ast, { confidence: 0.8 });
      expect(resultHigh.result).toBe(true);

      const resultLow = parser.evaluate(parsed.ast, { confidence: 0.6 });
      expect(resultLow.result).toBe(false);
    });

    test('should evaluate AND logic', () => {
      const parsed = parser.parse('action=restart AND severity=high');

      const resultBoth = parser.evaluate(parsed.ast, {
        action: 'restart',
        severity: 'high',
      });
      expect(resultBoth.result).toBe(true);

      const resultPartial = parser.evaluate(parsed.ast, {
        action: 'restart',
        severity: 'low',
      });
      expect(resultPartial.result).toBe(false);
    });

    test('should evaluate OR logic', () => {
      const parsed = parser.parse('service=api OR service=gateway');

      const resultFirst = parser.evaluate(parsed.ast, { service: 'api' });
      expect(resultFirst.result).toBe(true);

      const resultSecond = parser.evaluate(parsed.ast, { service: 'gateway' });
      expect(resultSecond.result).toBe(true);

      const resultNeither = parser.evaluate(parsed.ast, { service: 'database' });
      expect(resultNeither.result).toBe(false);
    });

    test('should evaluate NOT logic', () => {
      const parsed = parser.parse('NOT severity=low');

      const resultHigh = parser.evaluate(parsed.ast, { severity: 'high' });
      expect(resultHigh.result).toBe(true);

      const resultLow = parser.evaluate(parsed.ast, { severity: 'low' });
      expect(resultLow.result).toBe(false);
    });

    test('should handle operator precedence', () => {
      // AND has higher precedence than OR
      // should parse as: (a OR b) AND c
      const parsed = parser.parse('action=log OR action=retry AND severity=high');

      const result1 = parser.evaluate(parsed.ast, {
        action: 'log',
        severity: 'low',
      });
      expect(result1.result).toBe(false);

      const result2 = parser.evaluate(parsed.ast, {
        action: 'retry',
        severity: 'high',
      });
      expect(result2.result).toBe(true);
    });
  });

  describe('context handling', () => {
    test('should support dot notation for nested properties', () => {
      const parsed = parser.parse('decision.confidence>0.7');

      const result = parser.evaluate(parsed.ast, {
        decision: { confidence: 0.8 },
      });
      expect(result.result).toBe(true);
    });

    test('should handle missing context values gracefully', () => {
      const parsed = parser.parse('unknown_field=value');

      const result = parser.evaluate(parsed.ast, { action: 'restart' });
      expect(result.result).toBe(false);
    });

    test('should build evaluation trace', () => {
      const parsed = parser.parse('action=restart AND severity=high');

      const result = parser.evaluate(parsed.ast, {
        action: 'restart',
        severity: 'high',
      });

      expect(result.trace).toBeDefined();
      expect(result.trace.action).toBeDefined();
      expect(result.trace.severity).toBeDefined();
    });
  });

  describe('parseAndEvaluate', () => {
    test('should parse and evaluate in one call', () => {
      const result = parser.parseAndEvaluate('action=restart AND confidence>0.7', {
        action: 'restart',
        confidence: 0.8,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
    });

    test('should report errors from parse stage', () => {
      const result = parser.parseAndEvaluate('bad syntax here', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('complex scenarios', () => {
    test('should evaluate real-world policy rule', () => {
      const rule = '(action=restart AND severity=high AND confidence>0.7) OR (action=alert AND time_of_day=business_hours)';

      const parsed = parser.parse(rule);
      expect(parsed.success).toBe(true);

      const resultRestart = parser.evaluate(parsed.ast, {
        action: 'restart',
        severity: 'high',
        confidence: 0.8,
        time_of_day: 'night',
      });
      expect(resultRestart.result).toBe(true);

      const resultAlert = parser.evaluate(parsed.ast, {
        action: 'alert',
        severity: 'low',
        confidence: 0.5,
        time_of_day: 'business_hours',
      });
      expect(resultAlert.result).toBe(true);

      const resultNeither = parser.evaluate(parsed.ast, {
        action: 'retry',
        severity: 'low',
        confidence: 0.3,
        time_of_day: 'weekend',
      });
      expect(resultNeither.result).toBe(false);
    });

    test('should handle numeric comparisons', () => {
      const parsed = parser.parse(
        'incident_count>=3 AND (age_minutes<60 OR severity=critical)'
      );

      const result = parser.evaluate(parsed.ast, {
        incident_count: 5,
        age_minutes: 30,
        severity: 'high',
      });
      expect(result.result).toBe(true);
    });

    test('should support string equality checks', () => {
      const parsed = parser.parse(
        '(incident_type==database_timeout OR incident_type==connection_error) AND environment==production'
      );

      const result = parser.evaluate(parsed.ast, {
        incident_type: 'database_timeout',
        environment: 'production',
      });
      expect(result.result).toBe(true);
    });
  });

  describe('whitespace handling', () => {
    test('should handle variable amounts of whitespace', () => {
      const rules = [
        'action=restart',
        'action = restart',
        'action  =  restart',
        'action=restart AND severity=high',
        'action=restart   AND   severity=high',
      ];

      rules.forEach((rule) => {
        const result = parser.parse(rule);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('edge cases', () => {
    test('should handle empty input', () => {
      const result = parser.parse('');
      expect(result.success).toBe(false);
    });

    test('should handle null input', () => {
      const result = parser.parse(null);
      expect(result.success).toBe(false);
    });

    test('should evaluate with empty context', () => {
      const parsed = parser.parse('action=restart');
      const result = parser.evaluate(parsed.ast, {});

      expect(result.result).toBe(false);
    });

    test('should handle deeply nested parentheses', () => {
      const result = parser.parse(
        '(((action=restart)))'
      );
      expect(result.success).toBe(true);
    });
  });
});
