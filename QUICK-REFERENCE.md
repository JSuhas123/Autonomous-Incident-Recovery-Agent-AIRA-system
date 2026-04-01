# AIRA Quick Reference Guide

## 📋 Phases at a Glance

| # | Phase | Purpose | Status |
|---|-------|---------|--------|
| 1 | Reality Layer | Realistic infrastructure simulation | ✅ Complete |
| 2 | Policy System | Policy management with versioning | ✅ Complete |
| 3 | Effectiveness | Measure decision impact (ROI) | ✅ Complete |
| 4 | Confidence | Adaptive learning system | ✅ Complete |
| 5 | Integrations | Slack + Webhooks | ✅ Complete |
| 6 | Deployment | Docker + Kubernetes | ✅ Complete |
| 7 | Failure Tests | 8 robustness scenarios | ✅ Complete |
| 8 | Execution Modes | AUTO/APPROVAL/SUGGEST_ONLY | ✅ Complete |
| 9 | Documentation | Complete guides | ✅ Complete |
| 10 | Reports | Effectiveness + Analysis | ✅ Complete |

---

## 🚀 Quick Start (5 minutes)

```bash
# Clone and install
git clone <repo> && cd backend
npm install

# Start server
npm start

# Test it
curl http://localhost:5000/health
```

---

## 📦 Docker & Kubernetes

```bash
# Build image
docker build -t aira:latest .

# Run container
docker run -p 5000:5000 aira:latest

# Deploy to K8s
kubectl apply -f k8s/deployment.yaml

# Scale
kubectl scale deployment aira --replicas=10
```

---

## 🎯 Key API Endpoints

### Make a Decision
```bash
curl -X POST http://localhost:5000/api/v1/tenants/acme/decisions \
  -d '{
    "incidentId": "INC-123",
    "pattern": "HighCPU",
    "severity": "high",
    "data": {"cpuUsage": 95}
  }'
```

### Execute Decision
```bash
curl -X POST http://localhost:5000/api/v1/tenants/acme/decisions/dec-123/execute \
  -d '{"executorId": "user-123"}'
```

### Get Effectiveness
```bash
curl "http://localhost:5000/api/v1/effectiveness?limit=50"
```

### Record Confidence
```bash
curl -X POST http://localhost:5000/api/v1/confidence/record-prediction \
  -d '{
    "decisionTraceId": "trace-123",
    "predicted_confidence": 0.87,
    "confidence_factors": {
      "historical_success_rate": 0.85,
      "similarity_to_past": 0.90,
      "policy_alignment": 0.88,
      "risk_level": 0.80,
      "resource_availability": 0.92
    }
  }'
```

### Register Webhook
```bash
curl -X POST http://localhost:5000/api/v1/integrations/webhooks/register \
  -d '{
    "sourceConfig": {
      "name": "datadog",
      "type": "datadog",
      "enabled": true
    }
  }'
```

### Approve Execution
```bash
curl -X POST http://localhost:5000/api/v1/execution/requests/trace-123/approve \
  -d '{"approverId": "user-456"}'
```

### Generate Report
```bash
curl -X POST http://localhost:5000/api/v1/reports/effectiveness \
  -d '{
    "startDate": "2026-03-01T00:00:00Z",
    "endDate": "2026-03-31T23:59:59Z"
  }'
```

---

## ⚙️ Configuration

### Environment Variables
```bash
# Core
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/aira
REDIS_URL=redis://localhost:6379

# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret

# Execution
DEFAULT_EXECUTION_MODE=APPROVAL
APPROVAL_TIMEOUT_MS=300000
```

### Execution Modes
```bash
# Set default
curl -X POST http://localhost:5000/api/v1/execution/config/default-mode \
  -d '{"tenantId": "acme", "mode": "APPROVAL"}'

# Override for action
curl -X POST http://localhost:5000/api/v1/execution/config/action-mode \
  -d '{"tenantId": "acme", "action": "restart", "mode": "AUTO"}'
```

---

## 📊 Metrics to Monitor

### Effectiveness
- ✅ Success Rate: Target 87%+
- ✅ Avg Resolution: Target 5-15 min
- ✅ Cost Savings: ROI tracking
- ✅ Improvement %: Action effectiveness

### Confidence
- ✅ Accuracy: Target 80%+
- ✅ Overconfidence: < 25%
- ✅ Underconfidence: < 20%
- ✅ Factor performance: By confidence_factors

### Operations
- ✅ Approval time: 3-8 min avg
- ✅ Pod restarts: < 2/month
- ✅ Response time P95: < 500ms
- ✅ Error rate: < 0.5%

---

## 🔗 Integration Checklist

### Slack Setup
- [ ] Create app at https://api.slack.com/apps
- [ ] Add `chat:write` permission
- [ ] Copy bot token (xoxb-...)
- [ ] Set `SLACK_BOT_TOKEN` environment variable
- [ ] Add bot to workspace
- [ ] Test with `/integrations/slack/notify`

### Datadog
- [ ] Go to Integrations → Webhooks
- [ ] Create webhook: `https://your-domain/api/v1/integrations/webhooks/datadog`
- [ ] Add in monitors: `@webhook-aira`
- [ ] Test webhook ingestion

### Prometheus
- [ ] Configure AlertManager: `alertmanager.yml`
- [ ] Add webhook: `http://aira-backend:5000/api/v1/integrations/webhooks/prometheus`
- [ ] Set `send_resolved: true`
- [ ] Restart AlertManager

---

## 🐛 Troubleshooting

### Pod keeps restarting
```bash
# Check logs
kubectl logs deployment/aira-backend --tail=100

# Common cause: Memory (512Mi limit)
# Solution: Increase in k8s/deployment.yaml
```

### Webhooks not processing
```bash
# Check webhook stats
curl "http://localhost:5000/api/v1/integrations/webhooks/stats"

# Check event history
curl "http://localhost:5000/api/v1/integrations/webhooks/history"
```

### Confidence scores seem wrong
```bash
# Trigger recalibration
curl -X POST http://localhost:5000/api/v1/confidence/recalibrate \
  -d '{"tenantId": "acme", "lookBackDays": 30}'

# Check accuracy
curl "http://localhost:5000/api/v1/confidence/accuracy/by-action"
```

### Approval requests stuck
```bash
# List pending approvals
curl "http://localhost:5000/api/v1/execution/approvals/pending"

# Approve or reject manually
curl -X POST http://localhost:5000/api/v1/execution/requests/trace-xyz/approve \
  -d '{"approverId": "admin"}'
```

---

## 📚 Document Quick Links

| Document | Purpose |
|----------|---------|
| [PHASES-4-10-COMPLETE.md](PHASES-4-10-COMPLETE.md) | Phase implementation details |
| [DEPLOYMENT-INTEGRATION-GUIDE.md](DEPLOYMENT-INTEGRATION-GUIDE.md) | Deployment + integration steps |
| [API-REFERENCE.md](API-REFERENCE.md) | Complete API endpoints reference |
| [AIRA-TRANSFORMATION-FINAL-SUMMARY.md](AIRA-TRANSFORMATION-FINAL-SUMMARY.md) | Overview + getting started |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues + solutions |

---

## 🎓 Learning Path

### Day 1: Foundation
- Read: [AIRA-TRANSFORMATION-FINAL-SUMMARY.md](AIRA-TRANSFORMATION-FINAL-SUMMARY.md)
- Do: Quick start (npm install → npm start)
- Test: Make a decision via API

### Day 2: Integration
- Read: [DEPLOYMENT-INTEGRATION-GUIDE.md](DEPLOYMENT-INTEGRATION-GUIDE.md)
- Do: Setup Slack bot
- Do: Register Datadog webhook

### Day 3: Deployment
- Read: [DEPLOYMENT-INTEGRATION-GUIDE.md](DEPLOYMENT-INTEGRATION-GUIDE.md)
- Do: Build Docker image
- Do: Deploy to Kubernetes

### Day 4: API Deep Dive
- Read: [API-REFERENCE.md](API-REFERENCE.md)
- Do: Test all 55+ endpoints
- Do: Create policies

### Day 5: Operations
- Read: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Do: Monitor metrics
- Do: Review reports

---

## 💡 Pro Tips

### 1. Start with APPROVAL Mode
```bash
# Safe start: require approval for all actions
curl -X POST http://localhost:5000/api/v1/execution/config/default-mode \
  -d '{"tenantId": "acme", "mode": "APPROVAL"}'
```

### 2. Move to AUTO for High Confidence
```bash
# After validating 20+ restarts succeed:
curl -X POST http://localhost:5000/api/v1/execution/config/action-mode \
  -d '{
    "tenantId": "acme",
    "action": "restart",
    "mode": "AUTO"
  }'
```

### 3. Monitor Confidence Calibration
```bash
# Check weekly
curl "http://localhost:5000/api/v1/confidence/accuracy/by-action"

# Recalibrate monthly
curl -X POST http://localhost:5000/api/v1/confidence/recalibrate \
  -d '{"tenantId": "acme"}'
```

### 4. Review Effectiveness Reports
```bash
# Generate monthly report
curl -X POST http://localhost:5000/api/v1/reports/effectiveness \
  -d '{
    "startDate": "2026-03-01T00:00:00Z",
    "endDate": "2026-03-31T23:59:59Z"
  }' | jq .
```

### 5. Test with Failure Scenarios
```bash
# Use failureScenarios.js in development
# Tests AIRA robustness: cascading failures, race conditions, etc
const { failureScenarios } = require('./failureScenarios');
failureScenarios.cascadingFailure // Test cascading failure handling
```

---

## 📈 Success Metrics

Track these for proof of value:

```
Week 1
├─ Deployment successful
├─ Webhooks ingesting
└─ First 10 decisions made

Week 2
├─ 50+ decisions made
├─ 3-5 policies created
└─ Effectiveness reports generated

Week 3
├─ 87%+ success rate
├─ 40%+ automation (AUTO mode)
└─ $10K+ cost savings identified

Month 1
├─ 200+ decisions made
├─ 95%+ effectiveness in AUTO mode
├─ $100K+ cost savings
└─ Team trained on operations
```

---

## 🎯 Common Workflows

### Workflow 1: Alert → Decision → Slack → Approve → Execute
```
Datadog Alert
  ↓ [POST /integrations/webhooks/datadog]
AIRA Decision (90% confidence)
  ↓ [POST /integrations/slack/notify]
Slack Message with [Approve] button
  ↓ [Operator clicks Approve]
AIRA Detects Reaction
  ↓ [POST /execution/requests/.../approve]
Action Executes
  ↓ [POST /execution/requests/.../complete]
Effectiveness Measured & Reported
```

### Workflow 2: Policy Review → Dry-Run → Activation
```
New Policy Created
  ↓ [POST /policy/create-version]
Dry-Run Test
  ↓ [POST /policy/dry-run]
Compare with Previous
  ↓ [POST /policy/dry-run/compare]
Activate New Version
  ↓ [POST /policy/activate-version]
Monitor Effectiveness
  ↓ [GET /effectiveness]
Auto-Rollback if Needed
  ↓ [POST /policy/rollback]
```

### Workflow 3: Continuous Improvement
```
1. Generate monthly report
   ↓ [POST /reports/effectiveness]
2. Identify low-performing actions
   ↓ [GET /effectiveness/compare/actions]
3. Check confidence calibration
   ↓ [GET /confidence/accuracy/by-action]
4. Recalibrate weights
   ↓ [POST /confidence/recalibrate]
5. Update policies for improvements
   ↓ [Update rules]
6. Deploy new policy version
   ↓ [POST /policy/create-version + activate]
7. Monitor in next period
```

---

## 🔒 Security Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (not HTTP)
- [ ] Rotate `SLACK_BOT_TOKEN` monthly
- [ ] Enable Kubernetes RBAC
- [ ] Use encrypted secrets (not env vars for sensitive data)
- [ ] Enable audit logging
- [ ] Set resource limits
- [ ] Use non-root container user
- [ ] Enable network policies
- [ ] Backup MongoDB regularly

---

## 📞 Support

### For Issues:
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review [API-REFERENCE.md](API-REFERENCE.md)
3. Check pod logs: `kubectl logs deployment/aira-backend`
4. Check MongoDB: `mongosh aira`

### For Features:
1. Review [PHASES-4-10-COMPLETE.md](PHASES-4-10-COMPLETE.md)
2. Check API endpoints in [API-REFERENCE.md](API-REFERENCE.md)
3. Review example workflows above

---

## Version Info

```
AIRA Version: 2.0 (Production Ready)
Release Date: March 2026
Phases Implemented: 10/10 ✅
API Endpoints: 55+
Documentation Pages: 5+
```

---

**Last Updated**: March 15, 2026
**Status**: ✅ All 10 phases complete and documented
**Ready for**: Production deployment
