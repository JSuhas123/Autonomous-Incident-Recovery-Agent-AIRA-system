# Policies: YAML DSL Reference

**Version**: 1.0  
**Last Updated**: March 29, 2026  
**Type**: YAML-based policy engine (replaces hardcoded logic)

---

## Overview

Policies define **what actions are allowed** under **what conditions**. This is a deterministic, audit-friendly alternative to hardcoded decision logic or ML models.

**Key Property**: Safe-by-default - actions denied unless explicitly approved by policy.

---

## Policy Structure

```yaml
version: "1.0"                    # Policy format version
tenantId: "default"               # Tenant ID (can override per tenant)
effectiveFrom: "2026-03-26"       # Policy effective date

rules: [...]                      # Rule definitions
actions: [...]                    # Action configurations
escalation: {...}                 # Escalation rules
```

---

## Rules Section

Rules define when actions are allowed. Evaluated in order, first match wins.

### Rule Format

```yaml
rules:
  - id: "restart_allowed"                      # Unique rule ID
    description: "Restart service for severe incidents"
    actions: ["restart"]                       # Which actions does this apply to?
    allowedIf:                                 # Conditions that must ALL be true
      - severity: ["HIGH", "CRITICAL"]         # Severity must be HIGH or CRITICAL
      - confidence: { min: 0.65 }              # Confidence must be ≥ 65%
    denialReason: "Restart requires HIGH/CRITICAL severity and 65%+ confidence"
    requiresApproval: false                    # Must this be approved?
```

### Condition Types

**Severity Condition**:
```yaml
- severity: ["HIGH", "CRITICAL"]  # Allowed severity levels
```

Valid values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

**Confidence Condition**:
```yaml
- confidence: { min: 0.65 }        # Minimum confidence required
```

Range: 0.0 - 1.0

**Pattern Condition**:
```yaml
- patternType: ["timeout", "memory-leak"]  # Specific patterns allowed
```

**Service Condition**:
```yaml
- services: ["payment-api", "checkout"]    # Only apply to these services
```

**Blast Radius Condition**:
```yaml
- blastRadius: { max: 5 }          # Max number of affected services
```

**Time Window Condition** (upcoming):
```yaml
- timeWindow:
    start: "09:00"                 # Only during business hours
    end: "17:00"
    timezone: "America/New_York"
```

---

## Actions Section

Defines how each action behaves - risk level, reversibility, approvals required, etc.

### Action Format

```yaml
actions:
  - name: "restart"                    # Action identifier
    description: "Service restart"
    riskLevel: "medium"                # low, medium, high, critical
    reversible: true                   # Can be undone?
    dryRunAvailable: true              # Can be simulated?
    maxRetries: 2                      # Retry up to N times
    retryBackoff: "exponential"        # exponential, linear, fixed
    
    cooldowns:                         # Rate limiting
      - service: "any"                 # Which services?
        duration: "10m"                # Wait this long between actions
        maxPerDay: 2                   # Max 2 restarts per day
    
    requiresApproval:                  # Approval requirements
      blastRadius:
        minServices: 2                 # Require approval if affects 2+ services
      approvers: ["admin"]             # Who can approve?
      
    dryRunNotes: "Simulates restart without actual impact"
```

### Risk Levels

| Level | Description | Approval Required |
|-------|-------------|-------------------|
| `low` | Cache clear, configuration reload | No |
| `medium` | Service restart, rolling restart | If blast radius > threshold |
| `high` | Force restart, emergency scale | Always |
| `critical` | Dangerous action (rarely used) | CEO approval? |

---

## Complete Policy Example

```yaml
version: "1.0"
tenantId: "production"
effectiveFrom: "2026-03-26"

# ===== RULES =====
rules:
  # Rule 1: Restart for severe incidents
  - id: "restart_high_severity"
    description: "Allow restart for HIGH/CRITICAL incidents with confidence ≥ 65%"
    actions: ["restart"]
    allowedIf:
      - severity: ["HIGH", "CRITICAL"]
      - confidence: { min: 0.65 }
    denialReason: "Restart requires HIGH/CRITICAL severity + 65%+ confidence"
    requiresApproval: false

  # Rule 2: Scale for load issues
  - id: "scale_load_issues"
    description: "Allow scaling for load-related incidents (low risk)"
    actions: ["scale-replicas"]
    allowedIf:
      - patternType: ["high-load", "cpu-spike"]
      - confidence: { min: 0.60 }
    denialReason: "Scaling requires 60%+ confidence for load pattern"
    requiresApproval: false

  # Rule 3: Rolling restart (high risk)
  - id: "rolling_restart_approval"
    description: "Rolling restart always requires approval"
    actions: ["rolling-restart"]
    allowedIf: []  # No conditions, but approval required
    requiresApproval: true
    approvers: ["admin", "on-call-engineer"]
    denialReason: "Rolling restart requires explicit approval"

  # Rule 4: Business hours only for non-critical
  - id: "business_hours_only"
    description: "Non-critical actions only during business hours"
    actions: ["cache-clear", "config-reload"]
    allowedIf:
      - severity: ["LOW", "MEDIUM"]
      # Time window would be enforced here (future enhancement)
    denialReason: "Non-critical actions restricted outside business hours"

  # Rule 5: Catch-all alert (always allowed)
  - id: "alert_always_allowed"
    description: "Alerting human never denied"
    actions: ["alert-human"]
    allowedIf: []
    denialReason: "Alerts always allowed"

# ===== ACTIONS =====
actions:
  # Restart action
  - name: "restart"
    description: "Service restart"
    riskLevel: "medium"
    reversible: true
    dryRunAvailable: true
    maxRetries: 2
    retryBackoff: "exponential"
    cooldowns:
      - service: "any"
        duration: "10m"
        maxPerDay: 2
    requiresApproval:
      blastRadius:
        minServices: 2
      approvers: ["admin"]
    dryRunNotes: "Simulates restart without actual impact"

  # Scale replicas
  - name: "scale-replicas"
    description: "Scale replica count to handle load"
    riskLevel: "low"
    reversible: true
    dryRunAvailable: true
    maxRetries: 3
    retryBackoff: "linear"
    dryRunNotes: "Simulates scaling logic, verifies capacity"

  # Rolling restart
  - name: "rolling-restart"
    description: "Rolling restart with zero-downtime"
    riskLevel: "high"
    reversible: true
    dryRunAvailable: true
    maxRetries: 1
    requiresApproval:
      blastRadius:
        minServices: 1  # ALWAYS requires approval
      approvers: ["admin", "on-call-engineer"]
    dryRunNotes: "Simulates rolling sequence without impact"

  # Cache clear
  - name: "clear-cache"
    description: "Clear application cache"
    riskLevel: "low"
    reversible: true
    maxRetries: 3
    dryRunNotes: "No impact, cache automatically repopulates"

  # Alert action
  - name: "alert-human"
    description: "Alert human operator"
    riskLevel: "none"
    reversible: true
    maxRetries: 1

# ===== ESCALATION =====
escalation:
  # Escalate to on-call if initial action fails
  levels:
    - level: 1
      action: "restart"
      maxRetries: 2
      nextEscalation: "alert-human"
    
    - level: 2
      action: "alert-human"
      maxRetries: 1
      nextEscalation: "manual-intervention"

  # Define escalation contacts
  contacts:
    admin: "admin@company.com"
    on-call-engineer: "oncall@pagerduty.com"
    incident-commander: "incident-commander@company.com"
```

---

## Condition Logic

### AND Logic (all conditions must pass)
```yaml
allowedIf:
  - severity: ["HIGH", "CRITICAL"]      # AND
  - confidence: { min: 0.65 }           # AND
  - services: ["payment-api"]           # All must be true
```

### OR Logic (within a condition)
```yaml
allowedIf:
  - severity: ["HIGH", "CRITICAL"]      # OR: HIGH or CRITICAL
```

---

## Cool-Down Rules

Prevent action thrashing (too many retries):

```yaml
cooldowns:
  - service: "any"               # Apply to all services
    duration: "10m"              # Wait 10 minutes between attempts
    maxPerDay: 2                 # Max 2 in 24 hours

  - service: "payment-api"       # Service-specific cooldown
    duration: "30m"              # Stricter for critical services
    maxPerDay: 1
```

**How it works**:
1. Action executes
2. If it fails, system checks cooldown
3. If 10 minutes haven't passed, deny retry
4. If 2+ restarts today, deny another

---

## Multi-Tenant Policies

Each tenant can override default policy:

```bash
# Store tenant-specific policy
/policies/tenant-acme.yaml
/policies/tenant-techcorp.yaml
/policies/default-policy.yaml
```

**Load order**:
1. Check tenant-specific policy
2. Fall back to default policy
3. If neither, use hardcoded default

---

## Policy Versioning

Track policy changes over time:

```yaml
version: "1.0"
effectiveFrom: "2026-03-26"
predecessor: "0.9"
changes:
  - "Increased restart confidence threshold to 65%"
  - "Added maxPerDay limit of 2 restarts"
```

All decisions record which policy version was used → full auditability.

---

## Common Policy Patterns

### Conservative (HR/Finance Systems)

```yaml
rules:
  - id: "restart_only_critical"
    actions: ["restart"]
    allowedIf:
      - severity: ["CRITICAL"]
      - confidence: { min: 0.95 }
    requiresApproval: true
    
  # Default deny all other actions
  - id: "alert_only"
    actions: ["alert-human"]
    allowedIf: []
```

**Effect**: Almost no automation, mostly alerts humans.

### Moderate (E-Commerce)

```yaml
rules:
  - id: "restart_high_severity"
    actions: ["restart"]
    allowedIf:
      - severity: ["HIGH", "CRITICAL"]
      - confidence: { min: 0.70 }
    
  - id: "scale_load_issues"
    actions: ["scale-replicas"]
    allowedIf:
      - patternType: ["high-load"]
      - confidence: { min: 0.65 }
    
  - id: "cache_clear_anytime"
    actions: ["clear-cache"]
    allowedIf: []  # Always allowed, low risk
```

**Effect**: Balanced automation, critical actions need confirmation.

### Aggressive (SaaS / Always-Available)

```yaml
rules:
  - id: "restart_medium_plus"
    actions: ["restart"]
    allowedIf:
      - severity: ["MEDIUM", "HIGH", "CRITICAL"]
      - confidence: { min: 0.60 }
    requiresApproval: false
    
  - id: "scale_aggressively"
    actions: ["scale-replicas"]
    allowedIf:
      - confidence: { min: 0.55 }
    
  - id: "rolling_restart_approved"
    actions: ["rolling-restart"]
    requiresApproval: true
```

**Effect**: High automation, most things happen automatically.

---

## Policy Testing

### Dry-Run an Action

```bash
curl -X POST http://localhost:5000/api/v1/tenants/default/actions/:id/dry-run
# Returns: simulated outcome without execution
```

### Audit Which Policy Applied

```bash
curl http://localhost:5000/api/v1/tenants/default/decisions/dec-123
# Response includes: policyVersion, ruleId, policyEvaluation
```

### Find Decisions Blocked by Policy

```bash
# Query for denials
curl http://localhost:5000/api/v1/tenants/default/decisions?status=DENIED
# Returns: decisions rejected by policy rules
```

---

## Best Practices

1. **Start Conservative**: Begin with high confidence thresholds, relax over time
2. **Require Approval for High-Risk**: Rolling restarts, multi-service actions
3. **Set Cooldowns**: Prevent action thrashing (restart every 10+ minutes)
4. **Version Policies**: Document why rules changed
5. **Audit Everything**: Every decision records which rule applied
6. **Test in Staging**: Soak-test policies before production
7. **Monitor Success Rate**: Track whether actions actually fix incidents

---

## Troubleshooting

### Action Denied "Confidence Too Low"

```yaml
# Current policy requires 65%+ confidence
allowedIf:
  - confidence: { min: 0.65 }

# Solution: Lower threshold (riskier) or improve signal quality
allowedIf:
  - confidence: { min: 0.60 }  # More permissive
```

### "Max Retries Exceeded"

```yaml
# Check cooldown and maxPerDay
cooldowns:
  - service: "any"
    duration: "10m"      # Must wait 10 minutes
    maxPerDay: 2         # Only 2 attempts per 24h

# Solution: Increase limits if safe
cooldowns:
  - service: "any"
    duration: "5m"       # Shorter wait
    maxPerDay: 3         # More attempts
```

### "Approval Required"

```yaml
requiresApproval: true
approvers: ["admin"]

# Solution: Request approval from admin, or change policy to auto-approve
requiresApproval: false  # Allow without approval
```

---

## Future Enhancements

Planned policy features:

- [ ] Time windows (business hours only)
- [ ] Geolocation-based rules (different policies by region)
- [ ] Machine learning confidence weights
- [ ] Custom condition functions (JavaScript expressions)
- [ ] Policy composition (rules inherit from parent policies)
- [ ] Real-time policy hot-reloading (no redeploy needed)

---
