# AIRA Phase 21.10D — Recovery, Resilience & Capacity Report

Generated: 2026-08-31T10:54:06.577Z

Status: **PASS**

Safety class: **LAB_ONLY**

Production certified: **false**

Execution authorized: **false**

## Evidence Sources

- Phase 21.10B: 21.10B-final-v2
- Phase 21.10C: 21.10C-final-v1

## Integration Capacity

| Provider | Safe sustained req/s | Highest tested req/s | Degradation | Breaking point | Recovery |
|---|---:|---:|---|---|---|
| webhook_incoming | 1998.6506 | 2000 | NOT_OBSERVED | NOT_OBSERVED | PASS |
| prometheus_alertmanager | 4996.6029 | 5000 | NOT_OBSERVED | NOT_OBSERVED | PASS |
| grafana_alerting | 4996.2687 | 5000 | NOT_OBSERVED | NOT_OBSERVED | PASS |
| opentelemetry | 4996.2674 | 5000 | NOT_OBSERVED | NOT_OBSERVED | PASS |
| webhook_outgoing | 1998.6676 | 2000 | NOT_OBSERVED | NOT_OBSERVED | PASS |
| kubernetes | 124.8128 | 150 | SATURATED @ 150/s | NOT_OBSERVED | PASS |

## Multi-Tenant Isolation

- Tenant scales tested: 1, 10, 25, 50, 100
- Cross-tenant boundary violations: 0
- Redis idempotency collisions: 0
- RabbitMQ envelope leaks: 0
- Starved control tenants: 0
- Recovery: PASS
- Maximum measured Tenant Interference Factor: NOT_MEASURED

## Recovery Timing

- ttdMs: NOT_MEASURED
- ttcMs: NOT_MEASURED
- ttDiagnoseMs: NOT_MEASURED
- ttDecisionMs: NOT_MEASURED
- ttExecuteMs: NOT_MEASURED
- ttvMs: NOT_MEASURED
- mttrMs: NOT_MEASURED
- infrastructureRecoveryMs: NOT_MEASURED
- queueDrainMs: NOT_MEASURED
- baselineRestorationMs: NOT_MEASURED

## Derived Resilience Metrics

- degradationFactor: NOT_MEASURED
- recoveryEfficiency: NOT_MEASURED
- recoveryAmplification: NOT_MEASURED
- baselineRestored: NOT_MEASURED
- dataLoss: NOT_MEASURED
- duplicateProcessingRate: NOT_MEASURED
- recoveryOutcome: NOT_MEASURED

## Interpretation Boundaries

- Measured capacity envelope is not a universal maximum.
- This report does not establish a production SLO.
- External provider quota limits are not inferred from local measurements.
- Missing measurements remain NOT_MEASURED rather than being estimated.
- Reliability evidence does not grant execution authorization or autonomy.
- Results apply to the tested Reliability Lab hardware, dependencies and configuration.

## Authority

- Production certified: false
- Execution authorized: false
- Can grant autonomy: false
- Can modify production authority: false
- Phase 22 consumes evidence: true
