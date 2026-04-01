# Deployment & Integration Guide

## Table of Contents
1. [Docker Deployment](#docker-deployment)
2. [Kubernetes Deployment](#kubernetes-deployment)
3. [Slack Integration](#slack-integration)
4. [Webhook Integration](#webhook-integration)
5. [Production Checklist](#production-checklist)

---

## Docker Deployment

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+ (optional, for full stack)

### Build and Run

```bash
# Build image
docker build -t aira-backend:latest .

# Run container
docker run -d \
  --name aira-backend \
  -p 5000:5000 \
  -e MONGODB_URI="mongodb://localhost:27017/aira" \
  -e SLACK_BOT_TOKEN="xoxb-..." \
  -e NODE_ENV="production" \
  aira-backend:latest

# Check logs
docker logs -f aira-backend

# Test health
curl http://localhost:5000/health
```

### Docker Compose Stack

```yaml
version: '3.9'

services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      MONGODB_URI: mongodb://mongodb:27017/aira
      SLACK_BOT_TOKEN: ${SLACK_BOT_TOKEN}
      NODE_ENV: production
    depends_on:
      - mongodb
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongodb-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongodb-data:
```

### Environment Variables

```bash
# Core
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb://user:pass@host:27017/aira
REDIS_URL=redis://localhost:6379

# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret

# Execution Modes
DEFAULT_EXECUTION_MODE=APPROVAL
APPROVAL_TIMEOUT_MS=300000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## Kubernetes Deployment

### Prerequisites
- Kubernetes 1.20+
- kubectl configured
- Container registry access

### Deploy via kubectl

```bash
# 1. Update image in deployment.yaml
sed -i 's|your-registry/aira|your.azurecr.io/aira|g' k8s/deployment.yaml

# 2. Create namespace
kubectl create namespace aira

# 3. Create secrets for Slack
kubectl create secret generic aira-secrets \
  --from-literal=slack-bot-token=xoxb-... \
  -n aira

# 4. Deploy
kubectl apply -f k8s/ -n aira

# 5. Verify
kubectl get pods -n aira -l app=aira
kubectl get svc -n aira

# 6. Port forward for testing
kubectl port-forward svc/aira-backend 5000:80 -n aira
```

### Kubernetes Configuration Details

**Deployment** (3 replicas):
- Resource limits: 256Mi memory request, 512Mi limit
- CPU: 250m request, 500m limit
- Liveness probe: HTTP GET /health every 30s
- Readiness probe: HTTP GET /health every 10s

**Service**:
- Type: ClusterIP
- Port: 80 (external) → 5000 (container)

**HorizontalPodAutoscaler**:
- Min replicas: 3
- Max replicas: 10
- CPU target: 70%
- Memory target: 80%

**SecurityContext**:
- runAsNonRoot: true
- runAsUser: 1000
- readOnlyRootFilesystem: true

### Helm Chart (Optional)

For production, create a Helm chart:

```bash
helm create aira-backend
# Update values.yaml with:
# - image.repository: your-registry/aira
# - replicaCount: 3
# - resources.requests/limits
# - affinity rules
# - ingress configuration

helm install aira ./aira-backend \
  --namespace aira \
  -f values.yaml
```

### Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aira-ingress
  namespace: aira
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - aira.example.com
      secretName: aira-tls
  rules:
    - host: aira.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aira-backend
                port:
                  number: 80
```

---

## Slack Integration

### Setup Steps

#### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "AIRA Bot"
4. Select your workspace
5. Go to "OAuth & Permissions"

#### 2. Configure Bot Permissions

Add these scopes:
- `chat:write`
- `chat:write.public`
- `reactions:read`
- `users:read`
- `commands`

#### 3. Install to Workspace

- Click "Install to Workspace"
- Authorize the app
- Copy "Bot User OAuth Token" (starts with `xoxb-`)

#### 4. Add to Environment

```bash
export SLACK_BOT_TOKEN="xoxb-your-token"
```

### Usage

#### Send Decision Notification

```bash
curl -X POST http://localhost:5000/api/v1/integrations/slack/notify \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "#incident-response",
    "decisionData": {
      "incidentId": "INC-123",
      "action": "Restart pod payment-service-1",
      "confidence": 0.87,
      "severity": "high",
      "decisionTraceId": "trace-123"
    }
  }'
```

#### Expected Response in Slack

Message format:
```
🚨 AIRA Decision - HIGH SEVERITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Incident: INC-123
Action: Restart pod payment-service-1
Confidence: 87% ████████░
Status: PENDING APPROVAL

[Approve] [Reject] [View Details]
```

#### Message Button Actions

When operator clicks "Approve":
- Reaction added to message
- AIRA detects reaction
- Auto-executes via `/api/v1/execution/requests/:traceId/approve`
- Sends execution confirmation

### Slack Slash Commands (Optional)

```bash
# In Slack API settings, add Slash Command:
# Command: /aira-status
# Request URL: https://your-domain.com/api/v1/integrations/slack/commands/status

# Then in app:
app.post('/api/v1/integrations/slack/commands/status', (req, res) => {
  // Return pending approvals count
  // Return recent decisions
  // Return effectiveness stats
});
```

---

## Webhook Integration

### Datadog Setup

#### 1. Create Webhook in Datadog

1. Go to Datadog → Integrations → Webhooks
2. Click "New"
3. Name: "AIRA"
4. URL: `https://your-domain.com/api/v1/integrations/webhooks/datadog`
5. Custom Headers:
   ```
   Authorization: Bearer YOUR_AIRA_API_KEY
   ```

#### 2. Create Webhook Alert

In Datadog Monitor:
```
Alert message:
{{#is_alert}}
@webhook-AIRA
{{/is_alert}}
```

#### 3. Test

```bash
curl -X POST http://localhost:5000/api/v1/integrations/webhooks/datadog \
  -H "Content-Type: application/json" \
  -d '{
    "alert_transition": "triggered",
    "alert_metric": "system.cpu{host:web-prod-01}",
    "last_updated": "2026-03-15T10:30:00Z",
    "org": {"name": "acme-corp"},
    "alert_status": "alert",
    "alert_title": "High CPU Usage",
    "alert_type": "metric alert"
  }'
```

### Prometheus AlertManager Setup

#### 1. Configure AlertManager

Edit `alertmanager.yml`:
```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'aira'
  
receivers:
  - name: 'aira'
    webhook_configs:
      - url: 'http://aira-backend:5000/api/v1/integrations/webhooks/prometheus'
        send_resolved: true
```

#### 2. Test Alert

```bash
curl -X POST http://localhost:5000/api/v1/integrations/webhooks/prometheus \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "status": "firing",
      "labels": {
        "alertname": "HighErrorRate",
        "severity": "critical",
        "service": "payment-api"
      },
      "annotations": {
        "summary": "Error rate > 5%",
        "description": "Payment API errors increased to 8%"
      },
      "startsAt": "2026-03-15T10:30:00Z"
    }]
  }'
```

### PagerDuty Setup

#### 1. Create Integration

1. In PagerDuty, add integration
2. Select "Webhook"
3. Add AIRA URL endpoint
4. Test via incident

#### 2. Example Webhook Event

```bash
curl -X POST http://localhost:5000/api/v1/integrations/webhooks/prometheus \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "event": "incident.triggered",
      "incident": {
        "incident_number": "PD-456",
        "status": "triggered",
        "service": {
          "summary": "Database Service"
        },
        "trigger": {
          "type": "escalation_policy",
          "summary": "Connection pool exhausted"
        }
      }
    }]
  }'
```

---

## Complete Integration Workflow

### Scenario: API Gateway Latency Alert

```
1. Datadog detects p99 latency > 5 seconds
   └─ Sends webhook to AIRA

2. AIRA webhook handler at /webhooks/datadog:
   └─ Parses alert: {service: "api-gateway", metric: "latency"}
   └─ Stores in webhookEventSchema
   └─ Returns webhookEventId: "evt-789"

3. AIRA decision engine analyzes:
   └─ Checks recent similar incidents
   └─ Queries cluster metrics
   └─ Confidence: 0.85 → "Scale API gateway instances"
   └─ Creates decisionTrace

4. Execution mode check:
   └─ Action: "scale" → configured as APPROVAL mode
   └─ Creates executionRequest
   └─ Status: PENDING_APPROVAL

5. Slack notification sent:
   └─ Channel: #incident-response
   └─ Message with [Approve] button
   └─ Ops sees: "Scale api-gateway from 5→8 replicas (confidence: 85%)"

6. Operator clicks [Approve]:
   └─ AIRA detects Slack reaction
   └─ POST /api/v1/execution/requests/trace-xyz/approve
   └─ Status: APPROVED → EXECUTING

7. AIRA executes action:
   └─ Calls Kubernetes API to scale
   └─ Monitors pod startup
   └─ Records execution details
   └─ Status: EXECUTING → COMPLETED

8. Effectiveness tracking:
   └─ Records before: p99=5200ms
   └─ Records action: scaled 5→8 replicas
   └─ Records after (5m): p99=800ms
   └─ Calculates effectiveness: 85% improvement

9. Confidence calibration:
   └─ Predicted: 0.85 confidence
   └─ Actual: success → effectiveness=0.85
   └─ Records in confidenceMetricsSchema
   └─ Updates calibrationWeightsSchema

10. Report generation:
    └─ Can query /api/v1/reports/effectiveness
    └─ See this action contributed +1.5% ROI
    └─ Can query /api/v1/confidence/accuracy/by-action
    └─ See "scale" action: 91% accuracy with 0.85 confidence
```

---

## Production Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] MongoDB backups enabled
- [ ] Redis persistence configured
- [ ] SSL certificates obtained
- [ ] Slack app created and token stored
- [ ] Webhook integrations configured
- [ ] Approvers added to approval queue
- [ ] Default execution modes configured
- [ ] Monitoring/alerting setup

### During Deployment

- [ ] Database migrations run
- [ ] Container registry images pushed
- [ ] Kubernetes manifests reviewed
- [ ] Resource limits verified
- [ ] Security context verified
- [ ] Network policies configured
- [ ] Ingress certificates ready
- [ ] Health checks passing (kubectl get pods)

### Post-Deployment

- [ ] /health endpoint responding
- [ ] Decision endpoints working
- [ ] Slack integration tested
- [ ] Webhook endpoints accessible
- [ ] Confidence system recording
- [ ] Approval workflows functional
- [ ] Reports generating
- [ ] Logs being collected
- [ ] Metrics being exported

### Ongoing Monitoring

- [ ] Pod restart count < 2/week
- [ ] Response times < 1000ms p95
- [ ] Error rate < 0.5%
- [ ] Database query time < 100ms p95
- [ ] Webhook ingestion lag < 5s
- [ ] Approval turnaround time tracked
- [ ] Effectiveness scores validated monthly
- [ ] Confidence calibration accuracy checked weekly

---

## Scaling Considerations

### Database

```bash
# Enable MongoDB indexing for common queries
db.decisionTraces.createIndex({ "tenantId": 1, "createdAt": -1 })
db.executionRequests.createIndex({ "status": 1, "tenantId": 1 })
db.webhookEvents.createIndex({ "source": 1, "processedAt": 1 })
```

### Caching

```javascript
// Use Redis for:
// - Recent webhook events (TTL: 24h)
// - Confidence weights (TTL: 1h)
// - Approval workflows (TTL: 7 days)
```

### Horizontal Scaling

- **Min replicas**: 3 (high availability)
- **Max replicas**: 10-20 (plan for peak load)
- **CPU threshold**: 70% (scale up)
- **Memory threshold**: 80% (scale up)

### Vertical Scaling

Start with:
- **Memory**: 512Mi limit
- **CPU**: 500m limit

Increase if:
- Pod restarts happen (OOMKilled)
- Response times degrade
- Concurrent approvals > 100

---

## Disaster Recovery

### Backup Strategy

```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/aira" --out=/backups/aira-$(date +%Y%m%d)

# Store backups off-site (S3, Azure Blob)
aws s3 cp /backups/aira-* s3://aira-backups/
```

### Recovery Procedure

1. **Data Loss**:
   ```bash
   mongorestore --uri="mongodb://localhost:27017" /backups/aira-20260315/
   ```

2. **Pod Crash**:
   - Kubernetes auto-recovers via restart policy
   - Check logs: `kubectl logs pod-name`

3. **Cluster Failure**:
   - Deploy to new cluster
   - Restore database backup
   - Point DNS to new endpoint

---

## Cost Optimization

### Resources

- Start with 2 CPUs, 2GB RAM total
- Use pod disruption budgets to prevent costly restarts
- Enable horizontal pod autoscaling

### Database

- Use MongoDB Atlas with auto-scaling
- Enable compression (reduces storage 50%)
- Archive old reports (> 1 year) to cold storage

### Container Registry

- Use multi-stage builds to reduce image size
- Cache layers aggressively
- Clean up old images monthly

---

## Summary

With these guides, you can:
✅ Deploy AIRA to Docker
✅ Run AIRA on Kubernetes with auto-scaling
✅ Integrate with Slack for notifications
✅ Ingest webhooks from Datadog, Prometheus, PagerDuty
✅ Scale to production workloads
✅ Monitor and maintain in production

**Next: Run the production checklist and deploy!**
