# Decision Engine Learning Validation Harness

## Overview

A comprehensive long-term simulation harness designed to validate the Decision Engine's learning stability and weight convergence. This system runs continuous simulations to verify:

✅ **Weight Convergence** - Confidence weights stabilize over time  
✅ **System Learning** - Accuracy improves as patterns are learned  
✅ **Stability** - No oscillation or instability (swings < 10%)  
✅ **Calibration** - Confidence aligns with actual outcomes  
✅ **Adaptation** - System adapts to new patterns without instability  

## Architecture

The harness consists of modular, independent components:

```
┌─────────────────────────────────────────────────────────────┐
│                     Simulation Runner                        │
│  Orchestrates decisions through engine with feedback loop   │
└──────────────┬──────────────────────────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
   ┌────▼────┐   ┌───▼──────┐
   │ Incident│   │Confidence│
   │Generator│   │ Service  │
   └────┬────┘   └───┬──────┘
        │             │
        └──────┬──────┘
               │
        ┌──────▼──────────────┐
        │  Weight Optimizer   │
        │ (Records outcomes   │
        │  & optimizes)       │
        └──────┬──────────────┘
               │
   ┌───────────┴────────────────────┐
   │                                 │
┌──▼─────────────────┐    ┌─────────▼────────────┐
│ Convergence        │    │ Calibration          │
│ Analyzer           │    │ Validator            │
│ (Weight trends)    │    │ (Confidence align)   │
└──────┬─────────────┘    └─────────┬────────────┘
       │                            │
       └────────────┬───────────────┘
                    │
             ┌──────▼──────┐
             │  Reporter   │
             │ (JSON, MD)  │
             └─────────────┘
```

## Components

### 1. **IncidentGenerator.js**
Generates realistic incident streams for simulation.

**Features:**
- 1000+ configurable incidents
- Three learning phases:
  - **Phase 1** (0-60%): Recurring patterns the system can learn
  - **Phase 2** (60-70%): New unseen pattern introduced
  - **Phase 3** (70-100%): Mixed patterns with drift detection
- Configurable success rate (default 70%)
- Synthetic confidence factors (pattern_match, historical_success, etc.)
- Ground truth outcomes for validation

```javascript
const generator = new IncidentGenerator({ totalIncidents: 1000 });
const incidents = generator.generateIncidentStream();
```

### 2. **SimulationRunner.js**
Orchestrates the simulation by processing incidents through the decision engine.

**What it does:**
- Processes each incident through confidence calculation
- Makes decisions based on confidence scores
- Records outcomes and feeds them to weight optimizer
- Periodically attempts weight optimization (every 10 decisions)
- Tracks accuracy over time
- Validates calibration (confidence vs outcomes)

```javascript
const runner = new SimulationRunner(confidenceService, weightOptimizer);
const results = await runner.runSimulation(incidents);
```

**Output:**
- `decisionHistory` - All decisions with confidence, factors, outcomes
- `weightSnapshots` - Weight changes at each optimization point
- `accuracyHistory` - Accuracy metrics over time
- `confidenceCalibrationData` - Confidence vs outcome correlation

### 3. **ConvergenceAnalyzer.js**
Validates that confidence weights converge and stabilize.

**Checks:**
- ✅ Weight convergence score (0-1, 1 = fully converged)
- ✅ Oscillation analysis (detects swings > 10%)
- ✅ Dominant factors emergence (which factors become most important)
- ✅ Trend analysis (increasing, decreasing, stable)

```javascript
const analyzer = new ConvergenceAnalyzer();
const analysis = analyzer.analyzeConvergence(
  simulationResults.weightSnapshots,
  simulationResults.decisionHistory
);

console.log(analysis.hasConverged); // true/false
console.log(analysis.convergenceScore); // 0.85
```

**Output metrics:**
```javascript
{
  hasConverged: true,
  convergenceScore: 0.85,
  oscillationAnalysis: {
    overallStability: 'STABLE',
    unstableFactors: []
  },
  dominantFactors: {
    topFactor: 'pattern_match',
    emergentPattern: 'CONCENTRATED'
  },
  trends: { /* factor trends */ }
}
```

### 4. **CalibrationValidator.js**
Validates that confidence scores align with actual outcomes.

**Checks:**
- HIGH confidence → HIGH success rate? ✅
- LOW confidence → LOWER success rate? ✅
- Proper ordering (high > low)? ✅
- Mean absolute error < 10%? ✅

```javascript
const validator = new CalibrationValidator();
const calibration = validator.validateCalibration(
  simulationResults.confidenceCalibrationData,
  simulationResults.decisionHistory
);

console.log(calibration.status); // EXCELLENT, GOOD, ACCEPTABLE, POOR
console.log(calibration.calibrationScore); // 0.92
```

**Output metrics:**
```javascript
{
  calibrationScore: 0.92,
  status: 'EXCELLENT',
  binAnalysis: { /* confidence bins */ },
  reliability: {
    highConfidenceDecisions: { avgSuccessRate: 0.87 },
    lowConfidenceDecisions: { avgSuccessRate: 0.62 },
    orderingType: 'PROPER',
    reliability: 'RELIABLE'
  }
}
```

### 5. **SimulationReporter.js**
Generates comprehensive reports and graph-ready data.

**Output files:**
- `{reportId}-report.json` - Complete raw data for analysis
- `{reportId}-summary.md` - Human-readable markdown report
- `{reportId}-graphs.json` - Graph-ready datasets

**Graph datasets included:**
- Weight evolution (line chart)
- Accuracy over time (line chart)
- Confidence vs outcomes (scatter plot)
- Calibration curve (Expected vs Actual)
- Factor effectiveness (multi-line chart)

```javascript
const reporter = new SimulationReporter('./results');
const report = reporter.generateReport(
  incidentStats,
  simulationResults,
  convergenceAnalysis,
  calibrationAnalysis
);
```

## Usage

### Basic Usage

```bash
node run-learning-validation.js
```

Default: 1000 incidents, results in `./backend/simulation/simulation-results`

### Custom Configuration

```bash
node run-learning-validation.js --incidents=5000 --output=./custom-results
```

### Options
- `--incidents=N` - Number of incidents to simulate (default: 1000)
- `--output=PATH` - Output directory for results (default: ./simulation-results)
- `--verbose` - Enable verbose logging

## Sample Output

### Console Output

```
╔════════════════════════════════════════════════════════════════╗
║          DECISION ENGINE LEARNING VALIDATION HARNESS           ║
│  Validating: Convergence, Calibration, Stability, Adaptation  │
╚════════════════════════════════════════════════════════════════╝

📋 STEP 1: Generating Incident Stream
✅ Generated 1000 incidents
   Pattern breakdown:
   - database_connection_timeout: 200 incidents (72% success rate)
   - cache_invalidation_cascading: 200 incidents (68% success rate)
   ...

📊 STEP 4: Analyzing Weight Convergence
✅ Convergence Status: CONVERGED
   Convergence Score: 0.87
   Stability: STABLE
   Dominant Factor: pattern_match

📈 STEP 5: Validating Confidence Calibration
✅ Calibration Status: GOOD
   Calibration Score: 0.89
   High Confidence Success Rate: 87%
   Low Confidence Success Rate: 62%

🎯 STEP 7: Final Validation Summary
📋 OVERALL SYSTEM STATUS: HEALTHY: System learned, converged, and improved accuracy

   Validation Results:
   ✅ Convergence:  PASSED (0.87)
   ✅ Calibration:  PASSED (0.89)
   ✅ Learning:     PASSED (15 updates)

   🎯 OVERALL: ✅ VALIDATION PASSED
```

### Report Files

#### summary.md Excerpt

```markdown
# Decision Engine Learning Validation Report

| Metric | Value |
|--------|-------|
| Overall Status | HEALTHY |
| System Learned | YES |
| Convergence Achieved | ✅ YES |
| Final Accuracy | 85.42% |
| Accuracy Improvement | **+12.3%** |
| Weight Updates Applied | 15 |
| Total Decisions Processed | 1000 |

## Convergence Analysis

**Converged**: ✅ YES
**Convergence Score**: 0.87 / 1.0

### Weight Changes
| Factor | Mean | StdDev | CoeffVar |
|--------|------|--------|----------|
| pattern_match | 0.4210 | 0.0145 | 0.0344 |
| historical_success | 0.3150 | 0.0089 | 0.0282 |
```

#### graphs.json Structure

```json
{
  "weight_evolution": [
    {
      "factor": "pattern_match",
      "dataPoints": [
        { "decisionCount": 0, "weight": 0.4 },
        { "decisionCount": 10, "weight": 0.415 },
        { "decisionCount": 20, "weight": 0.428 }
      ]
    }
  ],
  "accuracy_over_time": {
    "type": "line",
    "dataPoints": [
      { "decisionNumber": 100, "accuracy": 0.73, "accuracyPercent": "73.00" },
      { "decisionNumber": 200, "accuracy": 0.78 }
    ]
  },
  "confidence_vs_outcome": {
    "type": "scatter",
    "scatterPoints": [
      { "confidence": 0.75, "outcome": 1 },
      { "confidence": 0.65, "outcome": 0 }
    ],
    "trendLine": [
      { "confidenceBin": "0.05", "avgOutcomeRate": "0.62" }
    ]
  }
}
```

## Interpretation Guide

### Convergence Analysis

**Convergence Score** (0-1):
- **0.8-1.0**: Excellent convergence
- **0.6-0.8**: Good convergence
- **0.4-0.6**: Partial convergence, monitor
- **<0.4**: Poor convergence, review weights

**Oscillation Status**:
- **STABLE**: No large swings (< 10%)
- **MOSTLY_STABLE**: Minor oscillations acceptable
- **UNSTABLE**: Excessive swings indicate instability

**Dominant Factor**:
- Should logically align with incident types
- Example: For latency issues, `signal_strength` might dominate
- Concentration indicates confidence in key factors

### Calibration Analysis

**Calibration Score** (0-1):
- **0.9-1.0**: Excellent - confidence = outcomes
- **0.8-0.9**: Good - minor gaps
- **0.65-0.8**: Acceptable - notable gaps
- **<0.65**: Poor - confidence misaligned

**Reliability Status**:
- **RELIABLE**: High confidence → high success ✅
- **UNRELIABLE**: High confidence → low success ❌ (inverted)

**Success Rate Ordering**:
- High confidence decisions should have > 70% success
- Low confidence decisions should have < 60% success
- Difference > 15% is healthy

### Learning Validation

**Weight Updates Applied**:
- 0 updates → System remained at baseline (good data? insufficient outcomes?)
- 1-5 updates → Slow learning
- 5-15 updates → Healthy learning
- 15+ updates → Continuous adaptation

**Accuracy Improvement**:
- +10% or more → Strong learning signal
- +5-10% → Moderate learning
- +0-5% → Minimal impact
- Negative → System degraded (rare)

## Advanced Usage

### Integration with Real Engine

To use with your actual Decision Engine:

```javascript
// Replace mocks with real services
const ConfidenceService = require('../services/confidenceService');
const ConfidenceWeightOptimizer = require('../services/confidenceWeightOptimizer');

const confidenceService = new ConfidenceService();
const weightOptimizer = new ConfidenceWeightOptimizer();

// Run simulation with real engine
const runner = new SimulationRunner(confidenceService, weightOptimizer);
const results = await runner.runSimulation(incidents);
```

### Custom Incident Patterns

```javascript
const generator = new IncidentGenerator({
  totalIncidents: 2000,
  successRate: 0.75,
  patternTypes: [
    'custom_pattern_1',
    'custom_pattern_2',
    'custom_pattern_3',
  ],
});
```

## Validation Criteria

A system passes validation when:

1. ✅ **Convergence**: Score > 0.7 AND Stability = STABLE
2. ✅ **Calibration**: Score > 0.8 AND Proper ordering
3. ✅ **Learning**: Weight updates > 0 AND Accuracy improvement > 5%
4. ✅ **Stability**: No excessive oscillations (< 10% swings)

## Performance Benchmarks

Typical execution times (1000 incidents):
- Incident generation: ~0.5s
- Simulation execution: ~2-3s
- Analysis: ~0.5s
- Report generation: ~0.3s
- **Total**: ~3-4 seconds

## Files Generated

```
simulation-results/
├── SIMULATION-{timestamp}-report.json      # Raw data
├── SIMULATION-{timestamp}-summary.md       # Human readable
└── SIMULATION-{timestamp}-graphs.json      # Visualization data
```

## Troubleshooting

### No Weight Updates
**Cause**: Insufficient outcomes or changes below threshold  
**Solution**: Increase incidents, reduce `updateThreshold`

### Poor Calibration
**Cause**: Confidence factors not predictive  
**Solution**: Verify `_calculateConfidence` formula, check factor weights

### Oscillation Instability
**Cause**: Weights changing too much per update  
**Solution**: Reduce `maxWeightChange` constraint

### Low Accuracy
**Cause**: Decision logic or factors not aligned  
**Solution**: Review `_makeDecision` logic, verify incident generation

## Future Enhancements

- [ ] Stress test with adversarial patterns
- [ ] Multi-tenant isolation validation
- [ ] Real-time monitoring dashboard
- [ ] Automated regression detection
- [ ] A/B testing framework for weight optimization strategies
- [ ] Ensemble model evaluation
- [ ] Anomaly detection in learning curves

## References

- [Architecture Overview](../ARCHITECTURE.md)
- [Confidence System](../services/confidenceService.js)
- [Weight Optimizer](../services/confidenceWeightOptimizer.js)
- [Feedback Loop](../services/feedbackLoopService.js)

---

**Last Updated**: 2026-03-29  
**Harness Version**: 1.0  
**Test Framework**: Node.js with Mock Services
