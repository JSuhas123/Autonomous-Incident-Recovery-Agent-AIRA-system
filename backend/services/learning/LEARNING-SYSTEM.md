# INCIDENT LEARNING SYSTEM - PRODUCTION GUIDE

> This is the **"Learn"** phase of the incident loop. Unlike simple pattern counting, this system **learns from outcomes** to improve future decisions.

## What's Different from Pattern Counting?

| Aspect | Pattern Counter | Learning System |
|--------|-----------------|-----------------|
| **Input** | How many incidents? | **Did the action work?** |
| **Storage** | "5 latency incidents happened" | "Restart fixed latency 80% of time in 30s" |
| **Learning** | "More incidents = more risky" | **"This action works. Use it more."** |
| **Decision** | "Choose popular action" | "Choose proven-effective action" |
| **Improvement** | Static over time | Continuous improvement |

---

## Architecture

### 1. **IncidentLearningService** - Core learning engine

```javascript
// Record outcome of incident after resolution
await learning.recordIncidentOutcome(tenantId, incidentId, decisionId, {
  resolved: true,                    // Did action fix it?
  recoveryTimeMs: 2000,             // How long until healthy?
  hasSideEffects: false,            // Did action cause new problems?
  cost: 5.02                        // Total cost (compute + time)
});
```

**What it does:**
- Calculates effectiveness score (0-1)
- Updates confidence for future decisions
- Alerts if action is ineffective (<30%)
- Suggests alternatives

**Effectiveness Formula:**
```
score = (resolved ? 1.0 : 0.0)         // Did it work?
      - recoveryPenalty                 // How fast?
      - (hasSideEffects ? 0.2 : 0)     // Did it cause new problems?
```

### 2. **IncidentLifecycleWithLearning** - Event tracking

Tracks incident from detection → resolution:

```
Incident Detected
       ↓
Decision Made
       ↓
Action Executed           ← Learning records this
       ↓
Recovery Started          ← Learning measures this
       ↓
Incident Resolved         ← Learning records outcome
       ↓
[System Learns]           ← Confidence updated for next time
```

**Learning Triggers:**
- `incident:registered` - Start tracking
- `action:executed` - Record action details
- `recovery:started` - Measure recovery time
- `incident:resolved` - Record success, update confidence
- `incident:failed` - Record failure, reduce confidence

### 3. **Playbook** - Best actions by pattern

```javascript
const playbook = await learning.buildPlaybook(tenantId);

// Result:
{
  'high-latency': [
    { action: 'scale', effectiveness: 0.92, sampleSize: 50 },
    { action: 'retry', effectiveness: 0.45, sampleSize: 40 },
    { action: 'restart', effectiveness: 0.35, sampleSize: 30 }
  ],
  'high-error-rate': [
    { action: 'restart', effectiveness: 0.89, sampleSize: 45 },
    ...
  ]
}
```

---

## Integration Points

### Step 1: Register Decision

```javascript
const incident = { id, severity, pattern };
const decision = await decisionService.decide(incident);

lifecycle.registerIncident(tenantId, incident, decision);
```

### Step 2: Execute Action

```javascript
const action = decision.recommendedAction;
await actionService.execute(action, ...)
  .then(() => {
    lifecycle.recordActionExecution(tenantId, incident.id, action);
  });
```

### Step 3: Monitor Recovery

```javascript
// When error rate starts dropping:
lifecycle.recordRecoveryStart(tenantId, incident.id, metrics);

// When service is fully healthy:
await lifecycle.recordIncidentResolved(tenantId, incident.id, metrics);
```

### Step 4: Learning Automatic

```javascript
// recordIncidentResolved() triggers:
// 1. Calculate effectiveness
// 2. Update confidence
// 3. Save to audit trail
// 4. Nothing else needed!
```

---

## Usage Patterns

### Pattern 1: Build a decision confidence boost

```javascript
// After first incident resolves:
const effectiveness = await learning.getActionEffectiveness(
  tenantId, 
  'restart',
  'high-error-rate'
);

console.log(effectiveness);
// {
//   action: 'restart',
//   pattern: 'high-error-rate',
//   effectiveness: 0.95,         // I.e., 95% effective!
//   sampleSize: 5,               // Based on 5 similar incidents
//   sideEffectRate: 0.0,         // No side effects
//   recommendations: [...]
// }

// Next time, boost confidence in decision:
decision.confidence += 0.15;  // Add learning boost
```

### Pattern 2: Block ineffective actions

```javascript
const effectiveness = await learning.getActionEffectiveness(tenantId, 'isolate', '...');

if (effectiveness.effectiveness < 0.3) {
  // After 3+ attempts, stop suggesting this action
  decision.blacklistActions = ['isolate'];
}
```

### Pattern 3: Suggest better alternatives

```javascript
const recommendations = effectiveness.recommendations;

// Show to operator:
recommendations.forEach(rec => {
  console.log(`[${rec.level}] ${rec.message}`);
});

// Example output:
// [CRITICAL] isolate is ineffective (20% success rate). Consider alternatives.
// [INFO] Try 'scale' instead (92% effective)
```

### Pattern 4: Track cost-effectiveness

```javascript
const effectiveness = await learning.getActionEffectiveness(tenantId, 'scale', '...');

console.log(`
  Action: scale
  Effectiveness: 92%
  Avg Recovery: 2.1 seconds
  Typical Cost: $5.02
`);

// Decide: is 92% effectiveness worth $5 per incident?
```

---

## Key Metrics

### Effectiveness Score (0-1)
- **1.0** = Incident resolved immediately, no side effects
- **0.8** = Incident resolved, minimal side effects
- **0.5** = Incident resolved but took long time or caused issues
- **0.2** = Incident barely resolved or caused new problems
- **0.0** = Action failed completely

### Confidence Boost/Penalty
- **+15%** for excellent actions (≥90% effective)
- **+5%** for good actions (70-89% effective)
- **0%** for fair actions (50-69% effective)
- **-10%** for poor actions (<50% effective)

### Recommendations
Automatic alerts when:
- Effectiveness drops below 30% → "CRITICAL: Consider alternatives"
- Side effects occur >30% of time → "WARNING: Causes issues"
- Effectiveness above 80% → "INFO: Use this more often"

---

## Deployment Considerations

### 1. Memory Persistence

The learning data must survive process restarts:

```javascript
// Save periodically
setInterval(async () => {
  await persistence.backup(learningService.getAllLearnedData());
}, 3600000); // Every hour

// Or use database:
class MongoMemoryService {
  async save(tenantId, key, data) {
    await db.collection('learning').updateOne(
      { tenantId, key },
      { $set: data },
      { upsert: true }
    );
  }
}
```

### 2. Tenant Isolation

Learning is per-tenant (each org has different incident patterns):

```javascript
// NOT shared:
learning.getActionEffectiveness('tenant-a', 'scale', '...');  // Tenant A's data only
learning.getActionEffectiveness('tenant-b', 'scale', '...');  // Different!
```

### 3. Cold Start Problem

New incidents have no history. Solutions:

```javascript
// 1. Start with neutral confidence (0.5)
const effectiveness = await learning.getActionEffectiveness(...);
if (effectiveness.sampleSize === 0) {
  return { effectiveness: 0.5, confidence: 0.5 };  // Neutral
}

// 2. Use industry defaults for new tenants
const defaults = {
  'high-latency': { scale: 0.85, retry: 0.4 },
  'high-error-rate': { restart: 0.8, isolate: 0.3 }
};
```

### 4. Feedback Loops

```javascript
// SCENARIO: Action works but is slow
recordIncidentOutcome(
  resolved: true,      // ✓ Fixed the incident
  recoveryTimeMs: 30000 // ✗ But took 30 seconds
);
// Result: effectiveness = 0.7 (good, not great)
// Decision: Next time, try faster action

// SCENARIO: Action works but breaks something else
recordIncidentOutcome(
  resolved: true,      // ✓ Fixed the incident  
  hasSideEffects: true // ✗ But caused errors
);
// Result: effectiveness = 0.8 (effective but risky)
// Decision: Use only as last resort
```

---

## Monitoring & Alerts

### What to Monitor

```javascript
// 1. Action Effectiveness Trends
lifecycle.on('incident:resolved', async (event) => {
  const { action, pattern } = event;
  const effectiveness = await learning.getActionEffectiveness(
    event.tenantId, 
    action, 
    pattern
  );
  
  metrics.gauge('action.effectiveness', effectiveness.effectiveness, {
    action, pattern
  });
  
  if (effectiveness.effectiveness < 0.4) {
    alerts.warn(`Action ${action} effectiveness dropped to ${effectiveness.effectiveness}`);
  }
});

// 2. Recovery Time Trends
lifecycle.on('incident:resolved', ({ recoveryTimeMs, pattern }) => {
  metrics.histogram('recovery.time', recoveryTimeMs, { pattern });
  
  if (recoveryTimeMs > 60000) {
    alerts.warn(`Slow recovery (${recoveryTimeMs}ms) for ${pattern}`);
  }
});

// 3. Side Effects
lifecycle.on('side-effect:detected', ({ effect, action }) => {
  metrics.increment('side-effects', { action });
  alerts.warn(`Side effect from ${action}: ${effect}`);
});
```

### Example Alert Query

```sql
-- Alert: Action stopped working
SELECT action, pattern, AVG(effectiveness) as avg_eff
FROM incident_outcomes
WHERE timestamp > now() - interval '7 days'
  AND action = 'restart'
  AND pattern = 'high-error-rate'
GROUP BY action, pattern
HAVING AVG(effectiveness) < 0.4
```

---

## Testing

### Test Effectiveness Learning

```javascript
test('System learns action effectiveness', async () => {
  // 3 incidents, all resolved
  for (let i = 0; i < 3; i++) {
    await recordIncident({
      action: 'scale',
      resolved: true,
      recoveryTimeMs: 2000
    });
  }
  
  const effectiveness = await learning.getActionEffectiveness(...);
  expect(effectiveness.effectiveness).toBeGreaterThan(0.8);
  expect(effectiveness.sampleSize).toBe(3);
});
```

### Test Confidence Adjustment

```javascript
test('System boosts confidence for effective actions', async () => {
  const before = initialDecision.confidence;  // 0.7
  
  await recordIncidentOutcome({
    resolved: true,
    recoveryTimeMs: 1000
  });
  
  const after = decision.confidence;  // 0.85 (+0.15 from learning)
  expect(after).toBeGreaterThan(before);
});
```

### Test Failure Learning

```javascript
test('System reduces confidence for ineffective actions', async () => {
  // 3 incidents, all failed
  for (let i = 0; i < 3; i++) {
    await recordIncidentOutcome({
      resolved: false,
      recoveryTimeMs: 0
    });
  }
  
  const effectiveness = await learning.getActionEffectiveness(...);
  expect(effectiveness.effectiveness).toBeLessThan(0.2);
});
```

---

## Limitations & Future Work

### Current Limitations
- **Single Factor**: Effectiveness = resolved or not
- **No Causality**: Learns correlation, not if action actually caused fix
- **Cold Start**: No data for new patterns
- **Manual Feedback**: Outcomes recorded by operator

### Future Enhancements
- **Causal Analysis**: ML model to infer if action caused recovery
- **Context**: Learn "scale works better at night" or "restart fails on high load"
- **Multistep**: Learn sequences ("restart then scale usually works better")
- **Automatic Outcomes**: Detect recovery automatically from metrics
- **Simulation Training**: Pre-train on simulated incidents
- **Cross-Tenant Learning**: Optional sharing of patterns across orgs

---

## Summary

| Phase | System Component | What It Does |
|-------|-----------------|-------------|
| **Monitor** | Observability | Detects incidents |
| **Detect** | Thresholds | Triggers alert |
| **Analyze** | Incident Memory | Identifies pattern |
| **Decide** | Decision Service + **Learning** | **Uses proven actions** |
| **Act** | Action Service | Executes action |
| **Learn** | **IncidentLearningService** | **Records outcome, updates confidence** |

The system improves with every incident. Each resolved incident makes the next decision better. 🚀
