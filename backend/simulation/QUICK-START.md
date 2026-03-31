# Quick Start Guide - Learning Validation Harness

## 5-Minute Setup

### 1. Run Default Simulation (1000 incidents)

```bash
cd backend/simulation
node run-learning-validation.js
```

**Output**:
```
✅ Generated 1000 incidents
✅ Simulation complete (1000 decisions in 2.3s)
✅ Weights updated at checkpoint 10, 20, 30...

📋 OVERALL SYSTEM STATUS: HEALTHY - System learned, converged, and improved accuracy
✅ VALIDATION PASSED
```

### 2. View Results

Results are saved to `simulation-results/`:

```bash
# View summary report
cat simulation-results/SIMULATION-{timestamp}-summary.md

# View raw JSON data
cat simulation-results/SIMULATION-{timestamp}-report.json

# View graph data for visualization
cat simulation-results/SIMULATION-{timestamp}-graphs.json
```

### 3. Check Validation Status

The final output shows:

```
Validation Results:
✅ Convergence:  PASSED (0.87/1.0)
✅ Calibration:  PASSED (0.89/1.0)
✅ Learning:     PASSED (15 updates)

🎯 OVERALL: ✅ VALIDATION PASSED
```

---

## Usage Scenarios

### Scenario 1: Quick Validation (< 1 minute)

Fast test to verify system is working:

```bash
node run-learning-validation.js --incidents=200
```

**Good for**: CI/CD pipelines, quick smoke tests  
**Execution time**: ~0.5s  
**Trade-off**: Less thorough, smaller sample size

---

### Scenario 2: Standard Validation (2-3 minutes)

Balanced test with good coverage:

```bash
npm run test:standard
# or
node run-learning-validation.js --incidents=1000
```

**Good for**: Regular validation, development work  
**Execution time**: ~3s  
**Recommended**: DEFAULT CHOICE

---

### Scenario 3: Extended Validation (10+ minutes)

Deep test to verify behavior at scale:

```bash
npm run test:extended
# or
node run-learning-validation.js --incidents=5000
```

**Good for**: Pre-deployment, major changes  
**Execution time**: ~15s  
**Trade-off**: Longer execution, more thorough

---

### Scenario 4: Stress Test (30+ minutes)

Maximum load test:

```bash
npm run test:stress
# or
node run-learning-validation.js --incidents=10000
```

**Good for**: Performance validation, edge case testing  
**Execution time**: ~30s  
**Trade-off**: Time-consuming, only when necessary

---

### Scenario 5: Custom Configuration

Specific testing needs:

```bash
node run-learning-validation.js --incidents=3000 --output=./custom-results --verbose
```

**Options**:
- `--incidents=N` - Customize incident count
- `--output=PATH` - Custom output directory
- `--verbose` - Enable detailed logging

---

## Interpreting Results

### ✅ Validation PASSED

System is healthy and learning correctly:

```
📋 OVERALL SYSTEM STATUS: HEALTHY
✅ Convergence: PASSED (scores > 0.7)
✅ Calibration: PASSED (scores > 0.8)
✅ Learning: PASSED (weights updated)

Result: Safe to deploy
```

**Next steps**:
- Review graphs to understand convergence
- Optional: Increase incidents for deeper validation
- Deploy with confidence

### ⚠️ Validation WARNING

System is mostly healthy but with some concern:

```
📋 OVERALL SYSTEM STATUS: MIXED - System converged but limited improvement
⚠️ Convergence: PASSED (0.72)
⚠️ Calibration: ACCEPTABLE (0.78)
✅ Learning: PASSED

Result: Investigate before deployment
```

**Next steps**:
- Review calibration metrics
- Check if confidence factors are predictive
- Consider adjusting weight optimization thresholds
- Run extended test (5000 incidents)

### ❌ Validation FAILED

System has issues that need investigation:

```
📋 OVERALL SYSTEM STATUS: NEEDS_REVIEW
❌ Convergence: FAILED (0.45)
❌ Calibration: FAILED (0.62)
⚠️ Learning: PASSED

Result: DO NOT deploy, investigate
```

**Troubleshooting**:
1. Check oscillation analysis for instability
2. Verify confidence factor calculations
3. Review incident generation (are outcomes realistic?)
4. Increase max weight change constraint
5. Verify ground truth in incident outcomes

---

## Report Navigation

### Key Metrics to Check

```
executive_summary.json:
├── systemLearned: true/false
├── convergenceScore: 0.0-1.0 (higher = better)
├── calibrationScore: 0.0-1.0 (higher = better)
├── accuracyImprovement: percentage
└── overallSystemStatus: String

convergence_analysis.json:
├── hasConverged: true/false
├── oscillationAnalysis: stability status
├── dominantFactors: which factors matter most
└── trends: how factors evolved

calibration_analysis.json:
├── calibrationStatus: EXCELLENT/GOOD/ACCEPTABLE/POOR
├── reliabilityStatus: RELIABLE/UNRELIABLE
└── successRateDifference: high_conf_success - low_conf_success

graph_data.json:
├── weight_evolution: line chart data
├── accuracy_over_time: line chart data
├── confidence_vs_outcome: scatter with trend
├── calibration_curve: expected vs actual
└── factor_effectiveness: multi-line chart
```

### CSV Export (Optional)

Extract data for Excel/Tableau:

```bash
# Weight evolution
jq '.convergence_analysis.metrics.weightVariances' simulation-results/*.json

# Accuracy over time
jq '.graph_data.accuracy_over_time.dataPoints' simulation-results/*.json

# Calibration by bin
jq '.calibration_analysis.binAnalysis' simulation-results/*.json
```

---

## Understanding the Three Learning Phases

### Phase 1: Pattern Learning (0-60%)
System encounters recurring patterns and learns to recognize them.

**Expected behavior**:
- ✅ Weight updates start around decision 10-20
- ✅ Accuracy improves 5-15%
- ✅ Historical_success weight increases
- ✅ Pattern_match weight stabilizes

### Phase 2: Adaptation (60-70%)
System encounters a new unseen pattern and adapts to it.

**Expected behavior**:
- ✅ Slight decrease in accuracy (new pattern)
- ✅ Weight adjustments as system learns new pattern
- ✅ Recovery by end of phase
- ✅ No severe oscillation

### Phase 3: Drift Resilience (70-100%)
System continues with mixed patterns, testing stability.

**Expected behavior**:
- ✅ Weights stabilize (convergence)
- ✅ No more large updates
- ✅ Consistent accuracy
- ✅ Robust to pattern changes

---

## Comparing Runs Over Time

Track validation improvements across code changes:

```bash
# Run 1 (baseline)
node run-learning-validation.js --output=./results/baseline-v1

# Make code changes...

# Run 2 (after improvements)
node run-learning-validation.js --output=./results/improved-v2

# Compare metrics
cat results/baseline-v1/*-summary.md
cat results/improved-v2/*-summary.md

# Use jq to compare JSON metrics
jq '.executive_summary | {convergence, calibration, improvement}' results/baseline-v1/*-report.json
jq '.executive_summary | {convergence, calibration, improvement}' results/improved-v2/*-report.json
```

---

## Advanced: Custom Incident Patterns

Edit `IncidentGenerator.js` to test specific pattern combinations:

```javascript
const generator = new IncidentGenerator({
  totalIncidents: 1000,
  successRate: 0.75,  // 75% success rate
  patternTypes: [
    'database_timeout',
    'cache_miss',
    'api_degradation',
    'novel_failure_type',  // New pattern at 60%
  ],
});
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Learning Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: cd backend/simulation && npm install
      - run: npm run test:standard
      - uses: actions/upload-artifact@v2
        if: failure()
        with:
          name: validation-results
          path: backend/simulation/simulation-results/
```

### Pre-Deployment Check

```bash
#!/bin/bash
set -e

echo "🔍 Running Decision Engine Validation..."
node backend/simulation/run-learning-validation.js

# Check if passed
if grep -q "VALIDATION PASSED" simulation-results/*-summary.md; then
  echo "✅ Validation passed - safe to deploy"
  exit 0
else
  echo "❌ Validation failed - DO NOT deploy"
  exit 1
fi
```

---

## Performance Tuning

### Faster Runs (for smoke tests)

```bash
node run-learning-validation.js --incidents=100
# ~0.2s, very basic validation
```

### Deeper Analysis

```bash
# Increase time-intensive analysis
# Edit SimulationRunner.js:
checkpointInterval: 5  // Check weights more frequently
```

### Memory Optimization

For very large simulations (50k+ incidents):

```bash
# Node.js memory increase
node --max-old-space-size=4096 run-learning-validation.js --incidents=50000
```

---

## Troubleshooting

### No Results Generated

**Error**: `simulation-results/` directory not created

**Solution**:
```bash
mkdir -p backend/simulation/simulation-results
node run-learning-validation.js
```

### Low Accuracy in Validation

**Possible causes**:
1. Confidence factors not predictive
2. Decision logic too simplistic
3. Incident generation unrealistic

**Solutions**:
```javascript
// 1. Verify factor calculations in IncidentGenerator
// 2. Check confidence service math
// 3. Increase successRate for recurring patterns
```

### Weights Not Updating

**Cause**: `updateThreshold` not reached

**Solution**:
```javascript
// In MockWeightOptimizer:
this.updateThreshold = 5;  // Lower from 10
```

---

## Next Steps

1. **Store baseline results**: Save initial validation as reference
2. **Monitor over time**: Run validation on each deployment
3. **Create dashboards**: Use `graphs.json` in Grafana/Tableau
4. **Automate checks**: Integrate into CI/CD pipeline
5. **Document patterns**: Record what each validation tells you

---

## Additional Resources

- [Full Harness Documentation](./README.md)
- [Architecture Overview](../ARCHITECTURE.md)
- [Confidence Service Code](../services/confidenceService.js)
- [Weight Optimizer Code](../services/confidenceWeightOptimizer.js)

---

**Ready to validate?**

```bash
node run-learning-validation.js
```

🚀 Happy validating!
