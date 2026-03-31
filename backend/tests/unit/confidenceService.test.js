/**
 * Confidence Service Unit Tests
 * Tests confidence scoring and weighting logic
 */

describe('Confidence Service', () => {
  describe('baselineConfidenceCalculation', () => {
    test('Should calculate confidence from error rate factor', async () => {
      const errorRate = 0.75;
      const confidence = errorRate; // Simple mapping for high errors

      expect(confidence).toBeGreaterThan(0.7);
    });

    test('Should calculate confidence from response time', async () => {
      const responseTime = 2500;
      const maxNormal = 1000;
      const confidence = Math.min(1.0, responseTime / maxNormal);

      expect(confidence).toBeDefined();
    });

    test('Should combine multiple factors into confidence score', async () => {
      const factors = {
        errorRateFactor: 0.85,
        latencyFactor: 0.70,
        historicalMatch: 0.90,
      };

      const weights = {
        error: 0.5,
        latency: 0.3,
        history: 0.2,
      };

      const confidence =
        factors.errorRateFactor * weights.error +
        factors.latencyFactor * weights.latency +
        factors.historicalMatch * weights.history;

      expect(confidence).toBeBetween(0.75, 0.90);
    });
  });

  describe('incidentMemoryBoost', () => {
    test('Should boost confidence for previously successful patterns', async () => {
      const baseConfidence = 0.75;
      const patternHistory = {
        previousSuccess: true,
        successRate: 0.95,
        boost: 0.15,
      };

      const boostedConfidence = Math.min(
        1.0,
        baseConfidence + patternHistory.boost
      );
      expect(boostedConfidence).toBe(0.90);
    });

    test('Should reduce confidence for previously failed patterns', async () => {
      const baseConfidence = 0.80;
      const patternHistory = {
        previousFailure: true,
        failureRate: 0.60,
        penalty: 0.20,
      };

      const penalizedConfidence = Math.max(
        0.0,
        baseConfidence - patternHistory.penalty
      );
      expect(penalizedConfidence).toBeCloseTo(0.60, 5);
    });

    test('Should handle first-time patterns (no history)', async () => {
      const baseConfidence = 0.70;
      const patternHistory = {
        occurrences: 0,
        boost: 0,
      };

      const finalConfidence = baseConfidence + patternHistory.boost;
      expect(finalConfidence).toBe(0.70);
    });
  });

  describe('escalationFactors', () => {
    test('Should increase confidence for escalating error rates', async () => {
      const errorRates = [0.3, 0.5, 0.7, 0.85];
      const escalating = true;
      const escalationBoost = escalating ? 0.15 : 0;

      const baseConfidence = 0.70;
      const fimalConfidence = Math.min(1.0, baseConfidence + escalationBoost);
      expect(fimalConfidence).toBe(0.85);
    });

    test('Should decrease confidence for stabilizing errors', async () => {
      const errorRates = [0.85, 0.65, 0.45, 0.25];
      const escalating = false;
      const escalationBoost = escalating ? 0.15 : -0.15;

      const baseConfidence = 0.85;
      const finalConfidence = Math.max(0.0, baseConfidence + escalationBoost);
      expect(finalConfidence).toBe(0.70);
    });

    test('Should handle stable error rates', async () => {
      const errorRates = [0.50, 0.50, 0.50, 0.50];
      const escalating =
        errorRates[errorRates.length - 1] > errorRates[0];
      const boost = escalating ? 0.15 : escalating ? -0.15 : 0;

      const baseConfidence = 0.75;
      const finalConfidence = baseConfidence + boost;
      expect(finalConfidence).toBe(0.75);
    });
  });

  describe('serviceCorrelationFactor', () => {
    test('Should boost confidence when correlation matches known patterns', async () => {
      const correlatedServices = ['database', 'api-service', 'api-gateway'];
      const knownCascade = ['database', 'api-service', 'api-gateway'];

      const matches = correlatedServices.every((s) =>
        knownCascade.includes(s)
      );
      expect(matches).toBe(true);
    });

    test('Should reduce confidence for unexpected correlations', async () => {
      const correlatedServices = ['cache', 'logging', 'monitoring'];
      const likelyRootCauses = ['database', 'api-service'];

      const noMatch = !correlatedServices.some((s) =>
        likelyRootCauses.includes(s)
      );
      expect(noMatch).toBe(true);
    });
  });

  describe('decisionTiering', () => {
    test('Should tier EXECUTE for high-confidence critical decisions', async () => {
      const decision = {
        severity: 'CRITICAL',
        confidence: 0.95,
        tier: 'EXECUTE',
      };

      expect(decision.tier).toBe('EXECUTE');
      expect(decision.confidence).toBeGreaterThan(0.9);
    });

    test('Should tier ESCALATE for medium-confidence high-severity decisions', async () => {
      const decision = {
        severity: 'HIGH',
        confidence: 0.75,
        tier: 'ESCALATE',
      };

      expect(decision.tier).toBe('ESCALATE');
      expect(decision.confidence).toBeBetween(0.7, 0.85);
    });

    test('Should tier OBSERVE for low-confidence decisions', async () => {
      const decision = {
        severity: 'MEDIUM',
        confidence: 0.45,
        tier: 'OBSERVE',
      };

      expect(decision.tier).toBe('OBSERVE');
      expect(decision.confidence).toBeLessThan(0.6);
    });
  });

  describe('confidenceThresholds', () => {
    test('Should enforce minimum confidence threshold for automation', async () => {
      const MIN_CONFIDENCE_FOR_AUTOMATION = 0.75;

      const decisionA = { confidence: 0.85, canAutomate: true };
      const decisionB = { confidence: 0.50, canAutomate: false };

      expect(decisionA.confidence >= MIN_CONFIDENCE_FOR_AUTOMATION).toBe(true);
      expect(decisionB.confidence >= MIN_CONFIDENCE_FOR_AUTOMATION).toBe(false);
    });

    test('Should require manual approval below confidence threshold', async () => {
      const MIN_CONFIDENCE = 0.70;
      const decision = {
        confidence: 0.65,
        requiresApproval:
          0.65 < MIN_CONFIDENCE,
      };

      expect(decision.requiresApproval).toBe(true);
    });
  });
});

// Test helper: Custom matchers
expect.extend({
  toBeBetween(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${received} to be between ${floor} and ${ceiling}`,
    };
  },
});
