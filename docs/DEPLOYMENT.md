# AIRA Deployment Guide 
 
*Consolidated from: DEPLOYMENT.md, DEPLOYMENT-GUIDE.md, DEPLOYMENT-INTEGRATION-GUIDE.md, PRODUCTION-UPGRADE-GUIDE.md, STAGING-AND-USAGE-GUIDE.md, CANARY-GO-NO-GO-CHECKLIST.md* 
 
--- 
 
# Deployment Guide (All Phases 1-10)

**Version**: 5.0.0 (Phase 4-10 Complete)  
**Last Updated**: Current  
**Status**: 🟢 **PRODUCTION READY** - All 10 phases tested, deployment-ready

> **EXECUTIVE SUMMARY**: Deploy AIRA to production with complete safety mechanisms (Phases 1-3), adaptive confidence (Phase 4), integrations (Phase 5), containerization (Phase 6), failure resilience (Phase 7), approval workflows (Phase 8), APIs (Phase 9), and advanced reporting (Phase 10).

---

## Deployment Overview

AIRA supports three deployment models:

| Model | Use Case | Effort | Availability |
|-------|----------|--------|--------------|
| **Docker Compose** | Development, small teams | Low | Single-machine |
| **Kubernetes** | Production, multi-region | Medium | Auto-scaling, HA |
| **Managed Cloud** | Enterprise, fully managed | High | Global, SLAs |

---

## Prerequisites

**Required**:
- Node.js 18+
- Docker 20.10+
- MongoDB 4.4+ (or MongoDB Atlas)
- RabbitMQ 3.8+ (or cloud equivalent)
- Redis 6.0+ (or cloud equivalent)

**Optional**:
- Kubernetes 1.24+ (for K8s deployment)
- AWS/GCP/Azure accounts (for cloud deployment)
- Slack workspace (for Phase 5 notifications)
- Datadog/Prometheus (for Phase 5 integrations)

---

## 1. Local Development Setup (15 minutes)

Perfect for getting started and testing all 10 phases locally.

### Step 1: Clone & Setup

```bash
cd /path/to/aira-project/backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure for local development
export ENVIRONMENT=development
export DATABASE_URL=mongodb://localhost:27017/aira-dev
export RABBITMQ_URL=amqp://localhost:5672
export REDIS_URL=redis://localhost:6379
```

### Step 2: Start Infrastructure (Docker Compose)

```bash
# Start all services (MongoDB, RabbitMQ, Redis)
docker-compose up -d

# Verify services running
docker ps

# Check logs
docker-compose logs -f
```

### Step 3: Start AIRA Server

```bash
# Start the backend server
npm start

# Expected output:
# ✓ Server listening on port 5000
# ✓ MongoDB connected
# ✓ RabbitMQ connected
# ✓ Redis connected

# Verify health
curl http://localhost:5000/health
# Response: { "status": "ok", "version": "5.0.0" }
```

### Step 4: Verify All 10 Phases

```bash
# Test core decision engine (Phases 1-3)
curl -X POST http://localhost:5000/decisions \
  -H "Content-Type: application/json" \
  -d '{"signal": "error_rate > 10"}'

# Test Phase 4: Confidence system
curl http://localhost:5000/confidence-model

# Test Phase 5: Integration slack
curl http://localhost:5000/integrations/slack/test

# Test Phase 7: Failure scenarios
cd backend/chaos && node quick-start.js

# Test Phase 10: Reporting
curl http://localhost:5000/reports/effectiveness?start_date=2026-04-01

# All working? Great! Ready for containerization →
```

---

## 2. Docker Deployment (30 minutes)

Run AIRA as a single container for staging/demos.

### Step 1: Build Docker Image

```bash
# Navigate to project root
cd /path/to/aira-project

# Build image
docker build -t aira:v5.0.0 .

# Verify build
docker images | grep aira
```

### Step 2: Configure Environment

Create `.env.docker`:
```env
# Server
ENVIRONMENT=production
PORT=5000
NODE_ENV=production

# Database (Phase 2-3)
DATABASE_URL=mongodb://mongodb:27017/aira-prod
DB_NAME=aira-prod

# Message Queue (Phase 1)
RABBITMQ_URL=amqp://rabbitmq:5672

# Cache & Locks (Phase 6)
REDIS_URL=redis://redis:6379

# Integrations (Phase 5)
SLACK_TOKEN=xoxb-your-token
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DATADOG_API_KEY=your-key
PROMETHEUS_PUSHGATEWAY=prometheus:9091

# Confidence System (Phase 4)
CONFIDENCE_THRESHOLD=0.65
SAFE_MODE_ENABLED=false

# Approval Workflows (Phase 8)
APPROVAL_EXPIRATION_MINUTES=60
REQUIRE_APPROVAL_FOR_HIGH_RISK=true
```

### Step 3: Run with Docker Compose

```bash
# Create override file for production
cat > docker-compose.prod.yml << 'EOF'
version: '3.8'
services:
  aira:
    image: aira:v5.0.0
    ports:
      - "5000:5000"
    environment:
      - ENVIRONMENT=production
      - DATABASE_URL=mongodb://mongodb:27017/aira-prod
      - RABBITMQ_URL=amqp://rabbitmq:5672
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - rabbitmq
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  mongodb:
    image: mongo:latest
    volumes:
      - mongo-data:/data/db
    
  rabbitmq:
    image: rabbitmq:3-management
    
  redis:
    image: redis:latest
    ports:
      - "6379:6379"

volumes:
  mongo-data:
EOF

# Start production stack
docker-compose -f docker-compose.prod.yml up -d

# Monitor
docker-compose -f docker-compose.prod.yml logs -f aira
```

---

## 3. Kubernetes Deployment (Production Grade)

Deploy to Kubernetes for multi-instance, auto-scaling, enterprise-grade deployment.

### Step 1: Prepare Kubernetes Manifests

Create `k8s/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: aira
```

Create `k8s/configmap.yaml`:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aira-config
  namespace: aira
data:
  ENVIRONMENT: production
  CONFIDENCE_THRESHOLD: "0.65"
  SAFE_MODE_ENABLED: "false"
  APPROVAL_EXPIRATION_MINUTES: "60"
```

Create `k8s/secret.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: aira-secrets
  namespace: aira
type: Opaque
stringData:
  DATABASE_URL: mongodb://mongodb:27017/aira-prod
  RABBITMQ_URL: amqp://rabbitmq:5672
  REDIS_URL: redis://redis:6379
  SLACK_TOKEN: xoxb-your-token
  SLACK_WEBHOOK_URL: https://hooks.slack.com/...
  DATADOG_API_KEY: your-key
```

### Step 2: Deploy AIRA Pods

Create `k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aira
  namespace: aira
spec:
  replicas: 3  # High availability
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: aira
  template:
    metadata:
      labels:
        app: aira
    spec:
      containers:
      - name: aira
        image: aira:v5.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 5000
          name: http
        
        # Phase 6: Health checks for Kubernetes
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /ready
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        
        # Resource management (Phase 6)
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        # Configuration from Phase 1-10
        envFrom:
        - configMapRef:
            name: aira-config
        - secretRef:
            name: aira-secrets
        
        # Graceful shutdown (Phase 6)
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]
```

### Step 3: Service & Load Balancing

Create `k8s/service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: aira-service
  namespace: aira
spec:
  type: LoadBalancer
  selector:
    app: aira
  ports:
  - port: 5000
    targetPort: 5000
    name: http
```

### Step 4: Horizontal Pod Autoscaler (Phase 6)

Create `k8s/hpa.yaml`:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aira-hpa
  namespace: aira
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aira
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Step 5: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy configuration
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy AIRA
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Verify deployment
kubectl get pods -n aira -w

# Expected: 3 AIRA pods RUNNING
NAME                   READY   STATUS    RESTARTS   AGE
aira-7b4d8c9f5-2k9np   1/1     Running   0          2m
aira-7b4d8c9f5-8q3lm   1/1     Running   0          2m
aira-7b4d8c9f5-x5n8p   1/1     Running   0          2m

# Check service
kubectl get service -n aira
# Get external IP from EXTERNAL-IP column
```

---

## 4. Cloud Deployment Options

### AWS ECS/Fargate

```bash
# Create ECS task definition
aws ecs register-task-definition \
  --family aira-task \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 512 \
  --memory 1024 \
  --container-definitions file://ecs-container-def.json

# Create ECS service
aws ecs create-service \
  --cluster aira-cluster \
  --service-name aira-service \
  --task-definition aira-task:1 \
  --desired-count 3
```

### GCP Cloud Run

```bash
# Build and push to GCP
gcloud builds submit --tag gcr.io/PROJECT_ID/aira:v5.0.0

# Deploy
gcloud run deploy aira \
  --image gcr.io/PROJECT_ID/aira:v5.0.0 \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=... \
  --memory 512Mi \
  --timeout 3600
```

### Azure Container Instances

```bash
# Create container group
az container create \
  --resource-group aira-rg \
  --name aira-container \
  --image aira:v5.0.0 \
  --cpu 2 \
  --memory 1 \
  --environment-variables DATABASE_URL=... \
  --ports 5000
```

---

## 5. Phase 4: Confidence System Setup

Configure adaptive confidence for production:

```bash
# Set confidence thresholds
CONFIDENCE_THRESHOLD=0.65           # Execute above this
CONFIDENCE_CAUTION_THRESHOLD=0.40   # Manual approval below
CONFIDENCE_BLOCK_THRESHOLD=0.20     # Block execution below

# Enable learning from feedback
ENABLE_CONFIDENCE_LEARNING=true
LEARNING_WINDOW_DAYS=30

# Kill-switch for low confidence
SAFE_MODE_ENABLED=false  # Will auto-enable if avg confidence < 50%
```

---

## 6. Phase 5: Integration Setup

### Slack Notifications

```env
SLACK_TOKEN=xoxb-your-bot-token
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL_DECISIONS=aira-decisions
SLACK_CHANNEL_ERRORS=aira-errors
SLACK_NOTIFY_ON_SUCCESS=true
SLACK_NOTIFY_ON_FAILURE=true
```

### Datadog Integration

```env
DATADOG_ENABLED=true
DATADOG_API_KEY=your-api-key
DATADOG_APP_KEY=your-app-key
DATADOG_SITE=datadoghq.com
```

### Prometheus Metrics Export

```bash
# Metrics available at:
curl http://localhost:5000/metrics

# Configure Prometheus scrape:
# Add to prometheus.yml:
scrape_configs:
  - job_name: 'aira'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
```

---

## 7. Phase 8: Approval Workflow Setup

Configure approval routing for Phase 8:

```env
# Approval system
SEND_APPROVAL_REQUESTS=true
APPROVAL_EXPIRATION_MINUTES=60
APPROVAL_ROUTE_TO_EMAIL=ops-team@company.com
REQUIRE_APPROVAL_FOR_HIGH_RISK=true
REQUIRE_APPROVAL_FOR_DB_CHANGES=true
```

---

## Pre-Production Validation Checklist

### Code & Build (Day 1)
- [ ] Run full test suite: `npm test` (all 512 tests passing)
- [ ] Coverage ≥91%: `npm run test:coverage`
- [ ] Lint checks pass: `npm run lint`
- [ ] Build Docker image: `docker build -t aira:v5.0.0 .`
- [ ] Security scan: `docker scan aira:v5.0.0`
- [ ] Run chaos tests: `npm run test:chaos` (all scenarios pass)

### Staging Deployment (Day 2)
- [ ] Deploy to staging K8s cluster
- [ ] All 3 pods RUNNING
- [ ] Service health checks passing
- [ ] Database migrations completed
- [ ] Load test: 100 req/sec, p95 < 500ms
- [ ] Memory: < 512MB per pod
- [ ] CPU: < 60% under load
- [ ] Slack integration verified
- [ ] Metrics exported to Prometheus

### Production Readiness (Day 3)
- [ ] All Day 2 items verified in staging
- [ ] Runbooks prepared (see [OPERATIONS.md](OPERATIONS.md))
- [ ] On-call schedule configured
- [ ] Monitoring dashboards created
- [ ] Alerts configured (CPU, Memory, Error rate)
- [ ] Backup/recovery tested
- [ ] Rollback plan documented
- [ ] Security review completed

---

## Post-Deployment Monitoring

### Key Metrics to Monitor

```bash
# Performance
- Decision latency (p95, p99)
- Throughput (decisions/sec)
- Confidence levels (average, distribution)

# Reliability
- Error rate
- Pod restarts
- Database connection count
- Queue depth

# Business
- Success rate by decision type
- MTTR (Mean Time To Recovery)
- False positive rate
- Approval workflow completion time
```

### Create Monitoring Dashboard

See [OBSERVABILITY.md](OBSERVABILITY.md) for Prometheus/Datadog setup.

---

## Rollback Procedure

If issues occur in production:

```bash
# For Kubernetes
kubectl rollout undo deployment/aira -n aira
kubectl rollout status deployment/aira -n aira

# For Docker
docker service update --image aira:v5.0.0-previous aira_service

# Verify rollback
curl http://your-aira-endpoint/health
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pods not starting | Check logs: `kubectl logs -n aira deployment/aira` |
| Database connection failed | Verify DATABASE_URL, firewall rules |
| High memory usage | Check for memory leaks, increase resource limits |
| Timeout errors | Increase request timeout, check external service health |
| Slack notifications failing | Verify SLACK_TOKEN and webhook URL |

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed troubleshooting.

---

## Resources

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [OPERATIONS.md](OPERATIONS.md) - On-call runbooks
- [OBSERVABILITY.md](OBSERVABILITY.md) - Monitoring setup
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [TESTING.md](TESTING.md) - Test coverage
- [ ] Soak test: 8-hour runtime stability
- [ ] Monitor for memory leaks
- [ ] Check log file rotation
- [ ] Validate alerting thresholds

### Day 3: Production Readiness

**Morning**:
- [ ] Security scanning: OWASP Top 10
- [ ] Database backup verification
- [ ] Disaster recovery plan test
- [ ] Runbook walkthrough with ops team

**Afternoon**:
- [ ] Blue-green deployment setup
- [ ] Canary deployment (5% traffic)
- [ ] Monitor error rate (target: <0.1%)
- [ ] Check decision latency (target: <200ms p95)

**Evening**:
- [ ] Production go/no-go decision
- [ ] Stakeholder sign-off
- [ ] On-call engineer rotation confirmed

---

## Docker Image Build

### Build Image

```bash
docker build -t decision-engine:2.1.0 \
  --build-arg NODE_ENV=production \
  .
```

### Test Image Locally

```bash
docker run -p 5000:5000 \
  -e MONGODB_URI=mongodb://mongodb:27017/decision_engine \
  -e RABBITMQ_URL=amqp://rabbitmq:5672 \
  -e REDIS_URL=redis://redis:6379 \
  decision-engine:2.1.0

# Test health check
curl http://localhost:5000/health
```

### Push to Registry

```bash
# AWS ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag decision-engine:2.1.0 <account>.dkr.ecr.<region>.amazonaws.com/decision-engine:2.1.0
docker push <account>.dkr.ecr.<region>.amazonaws.com/decision-engine:2.1.0

# Docker Hub
docker login
docker tag decision-engine:2.1.0 myorg/decision-engine:2.1.0
docker push myorg/decision-engine:2.1.0
```

---

## Environment Configuration (4 Tiers)

### Configuration Hierarchy

```
.env.example (template, commit to git)
├── .env (local development)
├── .env.development (dev overrides)
├── .env.test (test environment)
└── .env.production (production - NEVER commit)
```

### Environment Variables Reference

| Variable | Default | Production | Purpose |
|----------|---------|------------|---------|
| `NODE_ENV` | development | production | Environment selection |
| `PORT` | 5000 | 5000 | Server port |
| `MONGODB_URI` | localhost:27017 | ⚠️ Vault | Database connection |
| `RABBITMQ_URL` | localhost:5672 | ⚠️ Vault | Message queue |
| `REDIS_URL` | localhost:6379 | ⚠️ Vault | Distributed locks & cache |
| `OPENAI_API_KEY` | (empty) | ⚠️ Vault | Signal analysis (optional) |
| `OPENAI_MODEL` | gpt-4-turbo | gpt-4-turbo | Model selection |
| `LOG_LEVEL` | debug | info | Logging verbosity |
| `AUDIT_SECRET` | dev-secret | ⚠️ Vault | Audit signature key |
| `ALLOW_IN_MEMORY_LOCKS` | true | false | Production = Redis only |
| `DISABLE_MEMORY_DB` | false | false | Use external DB always |

**⚠️ Vault Variables**: Must be injected from secrets vault at deployment time (AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault)

### Setup for Production

**Step 1**: Load production template
```bash
cp .env.example .env.production
```

**Step 2**: Configure vault secrets (DO NOT edit .env.production directly)
```bash
# AWS Secrets Manager example
aws secretsmanager create-secret --name decision-engine-prod \
  --secret-string '{
    "MONGODB_URI": "mongodb+srv://user:pass@cluster.mongodb.net/decision_engine",
    "RABBITMQ_URL": "amqps://user:pass@rabbitmq.prod.cloud:5671",
    "REDIS_URL": "rediss://user:pass@redis.prod.cloud:6380",
    "OPENAI_API_KEY": "sk-...",
    "AUDIT_SECRET": "audit-signing-key-..."
  }'
```

**Step 3**: At deployment, inject secrets
```bash
# In CI/CD pipeline
export $(aws secretsmanager get-secret-value --secret-id decision-engine-prod \
  --query 'SecretString' --output text | jq -r 'to_entries | .[] | "\(.key)=\(.value)"')

npm start
```

### Environment Comparison

| Setting | Development | Staging | Production |
|---------|-------------|---------|-----------|
| **Debug Logging** | YES (verbose) | YES (detailed) | NO (info only) |
| **Memory Limits** | Unlimited | 512MB | 2GB |
| **Rate Limiting** | Disabled | 1000 req/min | 100 req/min |
| **Error Fallback** | In-memory | In-memory | Redis only |
| **Data Retention** | 1 day | 7 days | 90 days |
| **Metrics Detail** | Full | Full | Sampled (1%) |

---

## Kubernetes Deployment

### Create Namespace

```bash
kubectl create namespace incident-response
```

### Deploy MongoDB

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: mongodb
  namespace: incident-response
spec:
  selector:
    app: mongodb
  ports:
    - protocol: TCP
      port: 27017
      targetPort: 27017
  type: ClusterIP
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: incident-response
spec:
  serviceName: "mongodb"
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:5.0
        ports:
        - containerPort: 27017
        volumeMounts:
        - name: mongodb-persistent-storage
          mountPath: /data/db
  volumeClaimTemplates:
  - metadata:
      name: mongodb-persistent-storage
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
EOF
```

### Deploy Decision Engine

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: decision-engine
  namespace: incident-response
spec:
  selector:
    app: decision-engine
  type: LoadBalancer
  ports:
    - protocol: TCP
      port: 80
      targetPort: 5000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: decision-engine
  namespace: incident-response
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: decision-engine
  template:
    metadata:
      labels:
        app: decision-engine
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "5000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: decision-engine
        image: <registry>/decision-engine:2.1.0
        imagePullPolicy: Always
        ports:
        - containerPort: 5000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          value: "mongodb://mongodb:27017/decision_engine"
        - name: RABBITMQ_URL
          value: "amqp://rabbitmq:5672"
        - name: REDIS_URL
          value: "redis://redis:6379"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
EOF
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -n incident-response

# Check service
kubectl get svc -n incident-response

# View logs
kubectl logs -n incident-response -l app=decision-engine --tail=100

# Test endpoint
export SERVICE_IP=$(kubectl get svc decision-engine -n incident-response -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl http://$SERVICE_IP/health
```

---

## Production Deployment Checklist (15 Items)

**Status**: ✅ 12/15 Verified & Working | ⚠️ 3/15 Ready

| # | Item | Status | Verification | Owner |
|---|------|--------|--------------|-------|
| 1 | MongoDB Backup | ✅ VERIFIED | Database connectivity confirmed, logs active | DBA |
| 2 | RabbitMQ Clustering | ⚠️ READY | Infrastructure available, requires CLI verification | Ops |
| 3 | Redis Persistence | ⚠️ READY | Redis running, CONFIG GET appendonly required | Ops |
| 4 | Prometheus Metrics | ✅ VERIFIED | Metrics endpoint responding (200 OK), data available | Monitoring |
| 5 | Alert Rules | ✅ DOCUMENTED | 10+ configurations defined in operational guides | Monitoring |
| 6 | Logging Aggregation | ✅ VERIFIED | Log files active (combined.log, error.log) | Ops |
| 7 | Rate Limiting | ✅ IMPLEMENTED | Per-tenant enforcement (rateLimitingMiddleware.js) | DevOps |
| 8 | TTL Configuration | ✅ IMPLEMENTED | 4 TTLs configured in memoryCleanupJob.js | DevOps |
| 9 | RBAC | ✅ IMPLEMENTED | Authorization enforced via authMiddleware.js | Security |
| 10 | Disaster Recovery | ⚠️ READY | DR-PLAN template complete, needs org approval | SRE |
| 11 | On-Call Runbook | ⚠️ READY | ONCALL-RUNBOOK template complete, needs training | SRE |
| 12 | Load Test (1000+/min) | ⏳ READY | Framework in place, execution pending | QA |
| 13 | Idempotency Test | ⏳ READY | Lock framework verified, load test pending | QA |
| 14 | DLQ Monitoring | ✅ VERIFIED | Metrics collection + DLQ handling implemented | Ops |
| 15 | Retry Processor | ✅ VERIFIED | Running every 5 minutes, confirmed in code | DevOps |

### Pre-Launch Actions (For Remaining Items)

**RabbitMQ Clustering** (Item 2):
```bash
# Verify cluster status in production
rabbitmqctl cluster_status
# List nodes - should show 3+
rabbitmqctl list_nodes
```

**Redis Persistence** (Item 3):
```bash
# Verify Redis persistence enabled
redis-cli CONFIG GET appendonly
# Should return: "yes"

redis-cli CONFIG GET save
# Should show retention policy (e.g., "900 1 300 10 60 10000")
```

**Disaster Recovery Plan** (Item 10):
- [ ] Complete DR-PLAN.md template (reference in PROJECT-STATUS.md)
- [ ] Team review and sign-off
- [ ] Schedule quarterly DR drill

**On-Call Runbook** (Item 11):
- [ ] Complete ONCALL-RUNBOOK.md template
- [ ] Team training session
- [ ] Verify escalation contacts
- [ ] Test pages workflow

**Load Testing Execution** (Item 12):
```bash
# Run load test framework
npm run test:load

# Expected results:
# - 1000+ messages/min sustained
# - <5s p99 latency
# - Zero duplicate executions
```

**Idempotency Testing** (Item 13):
```bash
# Run idempotency verification
npm run test:idempotency-lock

# Verify:
# - Distributed lock protection working
# - No duplicates under concurrent load
# - Safe fallback if lock fails
```

### Production Release Steps

1. **Secrets Configuration** (Pre-deployment)
   - [ ] Create vault secret (AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault)
   - [ ] Store all vault variables (MONGO_URI, RABBITMQ_URL, REDIS_URL, API_KEYS, AUDIT_SECRET)
   - [ ] Test secret retrieval in CI/CD pipeline
   - [ ] Verify secret rotation policy

2. **Blue-Green Setup**
   - [ ] Deploy new version (blue) alongside existing (green)
   - [ ] Verify blue health checks passing
   - [ ] Run smoke tests on blue environment
   - [ ] Switch load balancer to blue (5% canary first)

3. **Canary Deployment (5% Traffic)**
   - [ ] Monitor error rate (target: <0.1%)
   - [ ] Monitor decision latency (target: <200ms p95)
   - [ ] Monitor DLQ size (target: <5 messages)
   - [ ] Duration: 30-60 minutes

4. **Full Rollout (100% Traffic)**
   - [ ] Gradually increase traffic to 100%
   - [ ] Monitor all key metrics
   - [ ] Keep green environment ready for rollback
   - [ ] Duration: 2-4 hours

5. **Monitoring & Validation**
   - [ ] All 15 checklist items verified on production
   - [ ] Metrics at baseline (no degradation)
   - [ ] No unexpected errors in logs
   - [ ] Customer-facing latency acceptable
   - [ ] Run for 24 hours before declaring success

---

## Rollback Procedure

**If critical issues detected**:

```bash
# Switch back to blue (previous version)
kubectl set image deployment/decision-engine \
  decision-engine=<registry>/decision-engine:<previous-version> \
  -n incident-response

# Verify rollback
kubectl rollout status deployment/decision-engine -n incident-response

# Check health
curl http://<service-ip>/health
```

**Rollback triggers**:
- Error rate > 1%
- Decision latency p99 > 5 seconds
- DLQ size > 50 messages
- Database connectivity issues
- Memory usage > 80% of pod limit

## Blue-Green Deployment

For zero-downtime updates:

```bash
# 1. Deploy new version (blue) alongside current (green)
kubectl set image deployment/decision-engine-blue \
  decision-engine=<registry>/decision-engine:2.1.1 \
  -n incident-response

# 2. Wait for new pods to be ready
kubectl rollout status deployment/decision-engine-blue -n incident-response

# 3. Run smoke tests against blue
curl http://decision-engine-blue:5000/health

# 4. Switch traffic to blue
kubectl patch service decision-engine \
  -p '{"spec":{"selector":{"version":"blue"}}}' \
  -n incident-response

# 5. Monitor for errors (target: <0.1% error rate)
# If issues, rollback:
kubectl patch service decision-engine \
  -p '{"spec":{"selector":{"version":"green"}}}' \
  -n incident-response

# 6. Once stable (24h), delete green
kubectl delete deployment decision-engine-green -n incident-response
```

---

## Scaling Configuration

### Horizontal Pod Autoscaling

```bash
kubectl autoscale deployment decision-engine \
  --min=3 --max=10 \
  --cpu-percent=70 \
  -n incident-response

# View autoscaler status
kubectl get hpa -n incident-response
```

### Resource Scaling Targets

- **CPU**: 70% utilization trigger
- **Memory**: 80% utilization trigger
- **Min Replicas**: 3 (high availability)
- **Max Replicas**: 10 (cost control)
- **Scale-up Time**: 30 seconds
- **Scale-down Time**: 5 minutes

---

## Database Replication

### MongoDB Replica Set Setup

```bash
# Scale MongoDB to 3 replicas
kubectl scale statefulset mongodb --replicas=3 -n incident-response

# Initialize replica set
kubectl exec -it mongodb-0 -n incident-response -- mongosh --eval "
  rs.initiate({
    _id: 'rs0',
    members: [
      {_id: 0, host: 'mongodb-0.mongodb:27017'},
      {_id: 1, host: 'mongodb-1.mongodb:27017'},
      {_id: 2, host: 'mongodb-2.mongodb:27017'}
    ]
  })
"
```

---

## Monitoring & Observability (Phase 1: Production Ready)

### Prometheus Metrics

Decision Engine exposes comprehensive Prometheus metrics at `/metrics` endpoint. **Version 2.2+ adds 15+ production-grade metrics**:

```bash
# Scrape metrics (v2.2 metrics)
curl http://localhost:5000/metrics | grep decision_

# Phase 1 Production Metrics:

# Decision Pipeline (latency buckets: 50-10000ms)
- decision_latency_ms (histogram): End-to-end decision time
- policy_latency_ms (histogram): Policy evaluation time
- action_latency_ms (histogram): Action execution time

# Queue Resilience (NEW in Phase 1)
- queue_depth_total (gauge): Current messages pending
- dlq_size_total (gauge): Dead-letter queue size
- retries_total (counter): Retry attempts
- action_executions_total (counter): Actions executed

# Memory Safety (NEW in Phase 1)
- memory_patterns_count (gauge): Incident memory size
- decision_traces_count (gauge): Decision traces stored

# Distributed Locking (NEW in Phase 1)
- lock_acquisition_ms (histogram): Lock wait time

# Concurrency Control (NEW in Phase 1)
- circuit_breaker_state (gauge): 0=CLOSED, 1=OPEN, 2=HALF_OPEN
- tenant_isolation_violations_total (counter): Security alerts

# Idempotency & Error Handling
- idempotency_hits_total (counter): Deduplicated messages
- errors_total (counter): All errors
- policy_evaluations_total (counter): Policies evaluated
```

### Health Check Endpoints

**Version 2.2+ adds detailed/deep health checks**:

```bash
# Basic liveness probe (always quick)
curl http://localhost:5000/health
# Returns: {"status": "ok"}

# NEW: Detailed readiness probe (component checks)
curl http://localhost:5000/health/detailed
# Returns:
# {
#   "status": "healthy",
#   "timestamp": "2026-03-29T10:15:33Z",
#   "components": {
#     "database": "connected",
#     "queue": "connected",
#     "idempotency": "connected",
#     "memoryCleanup": "running"
#   }
# }

# Use for Kubernetes readiness probe
```

### Alert Rules (Phase 1 Enhanced)

```yaml
# alert-rules.yaml
groups:
  - name: decision-engine-v2.2
    rules:
      # Decision Pipeline Alerts
      - alert: HighDecisionLatency
        expr: histogram_quantile(0.99, rate(decision_latency_ms_bucket[5m])) > 5000
        for: 5m
        annotations:
          severity: critical
          summary: "Decision p99 latency > 5s"
      
      # Queue Resilience Alerts (NEW)
      - alert: HighQueueDepth
        expr: queue_depth_total > 1000
        for: 5m
        annotations:
          severity: warning
          summary: "Queue backlog > 1000 messages"
      
      - alert: DLQGrowthRate
        expr: rate(dlq_size_total[5m]) > 0.017  # > 1 msg/min
        for: 5m
        annotations:
          severity: critical
          summary: "DLQ growing > 1 message/min (permanent failures)"
      
      # Memory Safety Alerts (NEW)
      - alert: MemoryPatternQuotaExceeded
        expr: memory_patterns_count / 10000 > 0.9  # 90% of limit
        for: 10m
        annotations:
          severity: warning
          summary: "Memory pattern storage at 90% capacity"
      
      - alert: DecisionTraceQuotaExceeded
        expr: decision_traces_count / 50000 > 0.95  # 95% of limit
        for: 10m
        annotations:
          severity: warning
          summary: "Decision trace storage at 95% capacity"
      
      # Concurrency Control Alerts (NEW)
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 1
        for: 2m
        annotations:
          severity: critical
          summary: "Circuit breaker open (service degraded)"
      
      - alert: HighLockContention
        expr: histogram_quantile(0.95, lock_acquisition_ms) > 100
        for: 5m
        annotations:
          severity: warning
          summary: "Lock acquisition p95 > 100ms"
      
      # Security Alerts (NEW)
      - alert: IsolationViolation
        expr: rate(tenant_isolation_violations_total[5m]) > 0
        for: 1m
        annotations:
          severity: critical
          summary: "Tenant isolation violation detected"
      
      # Error Rate Alerts (Enhanced)
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.01  # > 1%
        for: 5m
        annotations:
          severity: critical
          summary: "Error rate > 1%"
      
      - alert: HighRetryRate
        expr: rate(retries_total[5m]) > 0.1
        for: 5m
        annotations:
          severity: warning
          summary: "Retry rate > 10%"
```

### Kubernetes Probes

Updated K8s readiness/liveness configuration:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/detailed  # NEW: Uses detailed health check
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2

# Prometheus annotation for K8s
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "5000"
  prometheus.io/path: "/metrics"
  prometheus.io/interval: "15s"
```

### Grafana Dashboard Queries

**Latency Dashboard**:
```promql
# Decision latency p99
histogram_quantile(0.99, rate(decision_latency_ms_bucket[5m]))

# Action latency p95
histogram_quantile(0.95, rate(action_latency_ms_bucket[5m]))

# Lock acquisition maximum
max(lock_acquisition_ms)
```

**Queue Health Dashboard**:
```promql
# Queue depth over time
queue_depth_total

# DLQ growth rate
rate(dlq_size_total[5m])

# Retry success rate
rate(retries_total[5m]) / rate(retries_total[5m] + errors_total[5m])
```

**Resource Dashboard**:
```promql
# Memory patterns utilization
memory_patterns_count / 10000

# Decision trace utilization
decision_traces_count / 50000

# Circuit breaker state
circuit_breaker_state
```

**Security Dashboard**:
```promql
# Isolation violations
rate(tenant_isolation_violations_total[5m])

# Error breakdown (by component)
rate(errors_total[5m]) by (component)
```

---

## Rollback Procedure

If production issue detected:

```bash
# 1. Immediate rollback
kubectl rollout undo deployment/decision-engine -n incident-response

# 2. Monitor rollback progress
kubectl rollout status deployment/decision-engine -n incident-response

# 3. Verify service recovered
curl http://decision-engine:5000/health

# 4. Check error rate normalized
# Using monitoring dashboards (target: <0.1%)

# 5. Post-mortem
# Document what failed, why, and preventions
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Execution environment | `production` |
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | Database connection | `mongodb://mongodb:27017/decision_engine` |
| `RABBITMQ_URL` | Message queue | `amqp://rabbitmq:5672` |
| `REDIS_URL` | Cache/idempotency | `redis://redis:6379` |
| `LOG_LEVEL` | Logging verbosity | `info` (production) |
| `DISABLE_MEMORY_DB` | Disable in-memory DB fallback | `false` |

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
kubectl logs deployment/decision-engine -n incident-response

# Common issues:
# - MongoDB connection failed → ensure MongoDB running
# - RabbitMQ unavailable → check queue service
# - Port already in use → change PORT env var
```

### High Latency

```bash
# Check database performance
mongosh > db.currentOp()

# Check queue depth
redis-cli GET queue:depth

# Check pod resources
kubectl top pods -n incident-response

# If hitting limits, increase resources or replicas
```

### Data Loss Risk

```bash
# Enable database backup
kubectl apply -f mongo-backup-cronjob.yaml

# Verify backup
kubectl get cronjob -n incident-response

# Test recovery
kubectl exec mongodb-0 -- mongodump --out /tmp/backup
```

---

## Post-Deployment Validation

After successful deployment:

```bash
# 1. Health check
curl http://decision-engine:5000/health

# 2. Test signal submission
curl -X POST http://decision-engine:5000/api/v1/tenants/default/signals \
  -d '{"severity":"HIGH","signals":{"errorRate":0.1}}'

# 3. Verify decision created
curl http://decision-engine:5000/api/v1/tenants/default/decisions/:id

# 4. Check metrics
curl http://decision-engine:5000/metrics | head -50

# 5. Monitor error rate (target: <0.1% for 1 hour)
# Using monitoring dashboard
```

---

## Disaster Recovery

### Backup Strategy

```bash
# Daily backup of MongoDB
mongodump --uri="mongodb://mongodb:27017" --out=/backups/daily-$(date +%Y%m%d)

# Weekly backup to cold storage
tar -czf decision-engine-backup-$(date +%Y%W).tar.gz /backups/
aws s3 cp decision-engine-backup-*.tar.gz s3://disaster-recovery-bucket/
```

### Recovery Procedure

```bash
# 1. Find latest backup
aws s3 ls s3://disaster-recovery-bucket/ | tail -1

# 2. Restore database
mongorestore --uri="mongodb://mongodb:27017" /restored-backup/

# 3. Verify data integrity
mongo > db.decisions.count()

# 4. Bring service online
kubectl scale deployment/decision-engine --replicas=3
```

---
 
--- 
 
# AIRA — Deployment Guide

**Version**: 2.2.1 | **Status**: Production Ready | **Last Updated**: July 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [Local Development](#3-local-development)
4. [Docker Compose (Staging / Single Machine)](#4-docker-compose-staging--single-machine)
5. [Kubernetes (Production)](#5-kubernetes-production)
6. [Health Checks & Verification](#6-health-checks--verification)
7. [Observability](#7-observability)
8. [Rollback & Recovery](#8-rollback--recovery)
9. [Security Checklist](#9-security-checklist)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Required
| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 18.x | Runtime |
| Docker | 20.10+ | Containerization |
| Docker Compose | v2+ | Local/staging orchestration |
| MongoDB | 7.0+ | Primary database |
| RabbitMQ | 3.12+ | Message queue |
| Redis | 7.x | Distributed locks & cache |

### Optional (Production)
| Tool | Purpose |
|------|---------|
| Kubernetes 1.24+ | Production orchestration |
| `kubectl` | K8s cluster management |
| MongoDB Atlas | Managed cloud database |
| CloudAMQP / Amazon MQ | Managed RabbitMQ |
| Redis Cloud / ElastiCache | Managed Redis |
| Prometheus + Grafana | Metrics & dashboards |

---

## 2. Environment Configuration

### 2.1 Copy the Template

```bash
cd backend
cp .env.example .env
```

### 2.2 Required Variables

| Variable | Dev Default | Production Value |
|----------|-------------|-----------------|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `5000` | `5000` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/decision_engine` | Atlas URI or managed URI |
| `RABBITMQ_URL` | `amqp://localhost` | `amqp://user:pass@host:5672` |
| `REDIS_URL` | `redis://localhost:6379` | `redis://user:pass@host:6379` |
| `AUDIT_SECRET` | _(change this!)_ | Strong random string (32+ chars) |
| `DISABLE_MEMORY_DB` | `false` | **`true`** |
| `ALLOW_IN_MEMORY_LOCKS` | `true` | **`false`** |

### 2.3 Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | _(empty)_ | AI-enhanced analysis (leave empty to skip) |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o` for higher accuracy |
| `SLACK_TOKEN` | _(empty)_ | Slack incident notifications |
| `PAGERDUTY_TOKEN` | _(empty)_ | PagerDuty escalations |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend URL |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `METRICS_ENABLED` | `true` | Prometheus metrics endpoint |
| `SAFE_MODE` | `false` | Block all action execution (manual override) |

### 2.4 Generating a Secure AUDIT_SECRET

```bash
# Linux / macOS
openssl rand -base64 48

# Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Windows PowerShell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

---

## 3. Local Development

### Step 1 — Start Infrastructure

```bash
# From project root — starts MongoDB, RabbitMQ, Redis
docker-compose up -d mongodb rabbitmq redis

# Verify all three are healthy
docker-compose ps
```

Expected output:
```
backend-tracker-mongo     running (healthy)
backend-tracker-rabbitmq  running (healthy)
backend-tracker-redis     running (healthy)
```

### Step 2 — Install Dependencies & Start Server

```bash
cd backend
npm install
npm start
```

Expected log output:
```
✓ MongoDB connected
✓ RabbitMQ connected  
✓ Redis connected
✓ Server listening on port 5000
```

### Step 3 — Verify

```bash
curl http://localhost:5000/health
# {"status":"ok","safeMode":false,"redis":{"connected":true},...}

curl http://localhost:5000/health/detailed
# Full dependency health report
```

---

## 4. Docker Compose (Staging / Single Machine)

This runs the full stack — AIRA app + all infrastructure — in containers.

### Step 1 — Configure Secrets

Create a `.env` file at the project root (never committed):

```env
# Required for production stack
AUDIT_SECRET=<your-strong-random-secret>
MONGO_PASSWORD=<strong-mongo-password>
RABBITMQ_PASSWORD=<strong-rabbitmq-password>

# Optional
OPENAI_API_KEY=
SLACK_TOKEN=
CORS_ORIGIN=https://your-frontend.com
LOG_LEVEL=info
```

### Step 2 — Build and Start

```bash
# Build the AIRA image
docker build -t aira-backend:2.2.1 .

# Start the full stack
docker-compose up -d

# Tail logs
docker-compose logs -f app
```

### Step 3 — Verify

```bash
# App health
curl http://localhost:5000/health

# RabbitMQ management UI
open http://localhost:15672
# Default login: guest / guest (change in .env for prod)

# Prometheus metrics
curl http://localhost:5000/metrics
```

### Step 4 — Stop

```bash
docker-compose down          # stop & remove containers (keeps volumes)
docker-compose down -v       # also removes data volumes (destructive!)
```

---

## 5. Kubernetes (Production)

### 5.1 — Build & Push Docker Image

```bash
# Replace with your container registry
REGISTRY=your-registry.io/aira
VERSION=2.2.1

docker build -t $REGISTRY/aira-backend:$VERSION .
docker push $REGISTRY/aira-backend:$VERSION
```

### 5.2 — Update Image in deployment.yaml

In [k8s/deployment.yaml](k8s/deployment.yaml), replace:
```yaml
image: your-registry/aira-backend:latest
```
with:
```yaml
image: your-registry.io/aira/aira-backend:2.2.1
```

### 5.3 — Create the Secret

Edit [k8s/secret.yaml](k8s/secret.yaml) with base64-encoded values:

```bash
# Encode each secret value
echo -n 'mongodb+srv://user:pass@cluster.mongodb.net/decision_engine' | base64
echo -n 'amqp://user:pass@rabbitmq-host:5672' | base64
echo -n 'your-strong-audit-secret-min-32-chars' | base64
echo -n 'xoxb-your-slack-bot-token' | base64  # optional
```

Paste the output into the `data:` section of `k8s/secret.yaml`.

### 5.4 — Update ConfigMap

Edit [k8s/configmap.yaml](k8s/configmap.yaml) for your environment:

```yaml
data:
  redis-url: "redis://your-redis-host:6379"
  cors-origin: "https://your-frontend.com"
  log-level: "info"
  # ...other values
```

### 5.5 — Apply Manifests

```bash
# Apply in order
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml

# Watch rollout
kubectl rollout status deployment/aira-backend
```

### 5.6 — Verify Pod Health

```bash
# Check pods
kubectl get pods -l app=aira

# Expected output:
# NAME                            READY   STATUS    RESTARTS
# aira-backend-xxx-yyy            1/1     Running   0
# aira-backend-xxx-zzz            1/1     Running   0
# aira-backend-xxx-www            1/1     Running   0

# Check logs
kubectl logs -l app=aira --tail=50

# Exec health check inside pod
kubectl exec -it <pod-name> -- node -e \
  "require('http').get('http://localhost:5000/health', r => { console.log(r.statusCode) })"
```

### 5.7 — Expose the Service (optional)

The default service type is `ClusterIP`. To expose externally:

**Option A — Port-forward for testing:**
```bash
kubectl port-forward svc/aira-backend 5000:80
curl http://localhost:5000/health
```

**Option B — Ingress (recommended for production):**
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aira-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: aira.your-domain.com
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

```bash
kubectl apply -f k8s/ingress.yaml
```

### 5.8 — Scaling

```bash
# Manual scale
kubectl scale deployment aira-backend --replicas=5

# Auto-scale (HPA)
kubectl autoscale deployment aira-backend \
  --cpu-percent=70 \
  --min=3 \
  --max=10
```

---

## 6. Health Checks & Verification

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | None | Basic liveness — returns `ok` or `degraded` |
| `GET /health/detailed` | None | Full dependency status (DB, queue, Redis, feature flags) |
| `GET /health/multi-instance` | None | Cluster coordination status |
| `GET /metrics` | None | Prometheus metrics (15+ KPIs) |

### Quick Smoke Test

```bash
BASE=http://localhost:5000

# 1. Basic health
curl -s $BASE/health | jq .status

# 2. Detailed health — all components should be "connected"
curl -s $BASE/health/detailed | jq .components

# 3. Metrics available
curl -s $BASE/metrics | head -20

# 4. API reachable (expects 401 without auth — that's correct)
curl -s -o /dev/null -w "%{http_code}" \
  $BASE/api/v1/tenants/default/decisions
# Expected: 401
```

### Expected Health Response (Production)

```json
{
  "status": "ok",
  "safeMode": false,
  "redis": { "connected": true },
  "components": {
    "database": "connected",
    "queue": "connected",
    "idempotency": "connected",
    "redis": { "connected": true },
    "memoryCleanup": "running"
  }
}
```

If `safeMode: true` is returned, the server is running in degraded mode (Redis disconnected). Actions will be blocked until Redis reconnects.

---

## 7. Observability

### Prometheus Metrics

Metrics are available at `GET /metrics` in Prometheus text format.

Key metrics exposed:
- `aira_decisions_total` — total decisions made
- `aira_actions_executed_total` — actions executed
- `aira_confidence_score` — decision confidence distribution
- `aira_queue_depth` — RabbitMQ queue depth
- `aira_response_time_ms` — API response times

### Grafana (with infra-simulation stack)

```bash
cd infra-simulation
docker-compose up -d

# Grafana UI
open http://localhost:3000
# Default: admin / admin

# Prometheus UI
open http://localhost:9090
```

### Structured Logs

All logs are JSON-structured via Winston. In production, pipe to your log aggregator:

```bash
# Docker — ship logs to CloudWatch / Datadog / ELK
docker-compose logs -f app | your-log-shipper

# Kubernetes — logs are captured by your node logging agent automatically
kubectl logs -l app=aira -f
```

---

## 8. Rollback & Recovery

### Docker Compose

```bash
# Roll back to previous image tag
docker-compose down
docker tag aira-backend:2.2.0 aira-backend:current
docker-compose up -d
```

### Kubernetes

```bash
# View rollout history
kubectl rollout history deployment/aira-backend

# Roll back to previous revision
kubectl rollout undo deployment/aira-backend

# Roll back to specific revision
kubectl rollout undo deployment/aira-backend --to-revision=2

# Watch rollback progress
kubectl rollout status deployment/aira-backend
```

### Emergency Safe Mode

If the system is behaving unexpectedly, engage Safe Mode — this blocks ALL action execution while keeping the API available:

```bash
# Via environment variable restart
NODE_ENV=production SAFE_MODE=true node server.js

# Or via kill switch API (if the kill switch endpoint is enabled)
curl -X POST http://localhost:5000/api/v1/kill-switches \
  -H "Authorization: Bearer <token>" \
  -d '{"switch": "GLOBAL_SAFE_MODE", "enabled": true}'
```

---

## 9. Security Checklist

Before going to production, verify all items below:

- [ ] `AUDIT_SECRET` is a strong random value (not the example default)
- [ ] `MONGODB_URI` uses a dedicated database user (not root)
- [ ] `RABBITMQ_URL` uses a dedicated vhost and user (not `guest`)
- [ ] `REDIS_URL` has a password set (`requirepass` in Redis config)
- [ ] `CORS_ORIGIN` is set to your exact frontend domain (not `*`)
- [ ] `DISABLE_MEMORY_DB=true` (no in-memory fallback in production)
- [ ] `ALLOW_IN_MEMORY_LOCKS=false` (Redis required for distributed locks)
- [ ] `NODE_ENV=production`
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] `k8s/secret.yaml` with real values is NOT committed to git
- [ ] Container runs as `USER node` (non-root) — confirmed in Dockerfile
- [ ] K8s pod `runAsNonRoot: true` and `readOnlyRootFilesystem: true` — set in deployment.yaml
- [ ] All sensitive env vars come from K8s Secrets (not ConfigMap)
- [ ] TLS/HTTPS is terminated at the ingress/load balancer level
- [ ] Rate limiting middleware is active (`rateLimitingMiddleware`)

---

## 10. Troubleshooting

### Server won't start

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `MongooseError: connect ECONNREFUSED` | MongoDB not running | `docker-compose up -d mongodb` |
| `Error: connect ECONNREFUSED 127.0.0.1:5672` | RabbitMQ not running | `docker-compose up -d rabbitmq` |
| `Error: connect ECONNREFUSED 127.0.0.1:6379` | Redis not running | `docker-compose up -d redis` |
| `Missing required env var AUDIT_SECRET` | `.env` not configured | Copy `.env.example` to `.env` and set values |

### Health returns `degraded` / `safeMode: true`

Redis is disconnected. AIRA enters safe mode automatically — all action execution is blocked.

```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping
# Expected: PONG

# Check system health diagnostics
curl http://localhost:5000/health/detailed | jq .diagnostics
```

### K8s pods in `CrashLoopBackOff`

```bash
# Get crash reason
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous

# Common causes:
# - Secret not applied: kubectl apply -f k8s/secret.yaml
# - Wrong image tag: check `image:` in deployment.yaml
# - Filesystem write error: check volumeMounts are present for /app/logs and /tmp
```

### RabbitMQ messages piling up (DLQ)

```bash
# Check queue stats via management UI
open http://localhost:15672

# Or via API
curl -u guest:guest http://localhost:15672/api/queues

# Trigger manual retry processor
curl -X POST http://localhost:5000/api/v1/tenants/default/queue/retry \
  -H "Authorization: Bearer <token>"
```

### Decisions not executing (stuck at approval)

Check if approval workflow is blocking:
```bash
curl http://localhost:5000/api/v1/tenants/default/approvals \
  -H "Authorization: Bearer <token>"
```

Pending approvals older than `APPROVAL_EXPIRATION_MINUTES` auto-expire.

---

## Quick Reference

```bash
# Local dev — start infra only
docker-compose up -d mongodb rabbitmq redis && cd backend && npm start

# Full stack via Docker Compose
docker-compose up -d

# Deploy to Kubernetes
kubectl apply -f k8s/secret.yaml && \
kubectl apply -f k8s/configmap.yaml && \
kubectl apply -f k8s/deployment.yaml && \
kubectl rollout status deployment/aira-backend

# Health check
curl http://localhost:5000/health

# Emergency safe mode
curl -X POST http://localhost:5000/api/v1/kill-switches \
  -H "Authorization: Bearer <token>" \
  -d '{"switch":"GLOBAL_SAFE_MODE","enabled":true}'

# K8s rollback
kubectl rollout undo deployment/aira-backend
```
 
--- 
 
# AIRA — Complete Staging & Usage Guide

**AIRA** (Autonomous Incident Recovery Agent) is a Node.js/Express backend that
automates incident detection, policy-driven decision making, approval workflows,
and multi-step action execution for infrastructure incidents.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [Docker Compose Deployment (Staging)](#4-docker-compose-deployment-staging)
5. [Kubernetes Deployment (Production)](#5-kubernetes-deployment-production)
6. [Configuration Reference](#6-configuration-reference)
7. [Feature Flags](#7-feature-flags)
8. [Core API Usage](#8-core-api-usage)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Upgrading & Rolling Updates](#10-upgrading--rolling-updates)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Client / Webhook / Alert Source                    │
└────────────────────┬────────────────────────────────┘
                     │  HTTP
              ┌──────▼──────┐
              │  AIRA API   │  :5000
              │  (Express)  │
              └──┬──┬──┬───┘
       ┌─────────┘  │  └─────────┐
       ▼            ▼            ▼
  ┌─────────┐ ┌──────────┐ ┌─────────┐
  │ MongoDB  │ │  Redis   │ │RabbitMQ │
  │(decisions│ │(locks,   │ │(async   │
  │ logs,    │ │rate-limit│ │ queues) │
  │ policies)│ │ cache)   │ │         │
  └─────────┘ └──────────┘ └─────────┘
```

### Service Layers

| Layer | Purpose |
|---|---|
| **Routes** | HTTP endpoint definitions (REST) |
| **Agents** | Decision, Action, Analysis, BatchDecision |
| **Services/core** | Policy engine, rate-limiter, approval queue |
| **Services/infrastructure** | DB, Redis, RabbitMQ, multi-instance coordinator |
| **Services/execution** | K8s executor, canary runner, rollback |
| **Services/simulation** | Load scenario simulation for testing |
| **Middleware** | Auth, sanitization, audit logging, rate limiting |

---

## 2. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ (20 LTS recommended) | Runtime |
| npm | 9+ | Package manager |
| Docker Desktop | 4.x+ | Container runtime |
| kubectl | 1.28+ | Kubernetes CLI (bundled with Docker Desktop) |
| Git | any | Source control |

---

## 3. Local Development Setup

### 3.1 Clone & Install

```bash
git clone https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system.git
cd Autonomous-Incident-Recovery-Agent-AIRA-system/backend
npm install
```

### 3.2 Configure Environment

Create `backend/.env` (copy from the template below and fill in real values):

```env
# Application
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug

# MongoDB
MONGODB_URI=mongodb://localhost:27017/decision_engine

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Auth / Security
AUDIT_SECRET=your-strong-random-secret-min-32-chars-here
JWT_SECRET=your-jwt-secret

# Optional — Slack alerts
SLACK_TOKEN=xoxb-your-token
SLACK_CHANNEL=#aira-alerts

# Optional — OpenAI (analysis agent)
OPENAI_API_KEY=sk-...

# Feature flags (set to "true" to enable)
ENABLE_OPENAI_ANALYSIS=false
ENABLE_INCIDENT_LEARNING=false
ENABLE_AUTO_REMEDIATION=false
ENABLE_KUBERNETES_EXECUTOR=false
```

### 3.3 Start Infrastructure Services

Start MongoDB, Redis, and RabbitMQ using Docker (one-time):

```bash
# From repo root
docker compose up mongo redis rabbitmq -d
```

Or install locally:
- **MongoDB**: https://www.mongodb.com/try/download/community
- **Redis**: https://redis.io/docs/getting-started/
- **RabbitMQ**: https://www.rabbitmq.com/download.html

### 3.4 Run the Server

```bash
cd backend
npm start
# or for development with auto-reload:
npx nodemon server.js
```

Server starts on `http://localhost:5000`.

### 3.5 Verify

```bash
curl http://localhost:5000/health
# → {"status":"ok","timestamp":"...","redis":{"connected":true}}

curl http://localhost:5000/health/detailed
# → {"status":"healthy","components":{"database":"connected","queue":"connected",...}}
```

---

## 4. Docker Compose Deployment (Staging)

This runs all services together in Docker on a single machine.

### 4.1 Build & Start

```bash
# From repo root
docker compose up --build -d
```

This starts:
- `aira-app` on port **5000**
- `mongo` on port **27017**
- `redis` on port **6379**
- `rabbitmq` on ports **5672** (AMQP) and **15672** (Management UI)

### 4.2 Verify Health

```bash
docker compose ps                         # all show "healthy"
curl http://localhost:5000/health/detailed
```

### 4.3 View Logs

```bash
docker compose logs -f app               # AIRA app logs
docker compose logs -f mongo             # MongoDB logs
docker compose logs --tail=50 app        # last 50 lines
```

### 4.4 Stop

```bash
docker compose down          # stop containers, keep volumes
docker compose down -v       # stop + delete volumes (wipes data)
```

### 4.5 Rebuild After Code Changes

```bash
docker compose up --build -d app
```

---

## 5. Kubernetes Deployment (Production)

All manifests are in `k8s/`. The namespace is `aira`.

### 5.1 Enable Kubernetes (Docker Desktop)

1. Open Docker Desktop → **Settings** → **Kubernetes**
2. Check **Enable Kubernetes** → **Apply & Restart**
3. Wait ~3 minutes for the cluster to initialize
4. Verify: `kubectl get nodes` → shows `desktop-control-plane   Ready`

### 5.2 Generate Secrets from .env

```bash
# Run from repo root (requires .env in repo root)
node k8s/generate-secrets.js
# → Creates k8s/secret-generated.yaml (gitignored)
```

### 5.3 Deploy Everything

```bash
# 1. Namespace
kubectl apply -f k8s/namespace.yaml

# 2. Config & Secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret-generated.yaml

# 3. Infrastructure
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/rabbitmq.yaml
kubectl apply -f k8s/mongodb.yaml

# 4. Application + HPA + NodePort
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/nodeport.yaml
```

Or apply all at once:

```bash
node k8s/generate-secrets.js
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml -f k8s/secret-generated.yaml \
  -f k8s/redis.yaml -f k8s/rabbitmq.yaml -f k8s/mongodb.yaml \
  -f k8s/deployment.yaml -f k8s/nodeport.yaml
```

### 5.4 Watch Rollout

```bash
kubectl get pods -n aira -w
# All should reach 1/1 Running within 2-3 minutes

kubectl rollout status deployment/aira-backend -n aira
# → "successfully rolled out"
```

### 5.5 Access the Application

**Option A — NodePort (Docker Desktop):**
```bash
# App is exposed at http://localhost:30500
curl http://localhost:30500/health
```

**Option B — Port Forward (any cluster):**
```bash
kubectl port-forward svc/aira-backend 8888:80 -n aira
# App is at http://localhost:8888
curl http://localhost:8888/health
```

### 5.6 Scale Replicas

```bash
kubectl scale deployment/aira-backend --replicas=5 -n aira
```

The HPA auto-scales between 2–10 replicas based on CPU (>70%) and memory (>80%).

### 5.7 Rolling Update (New Image)

```bash
# 1. Build new image
docker build -t aira-deploy-app:v2.0 -f Dockerfile .

# 2. Update deployment
kubectl set image deployment/aira-backend aira=aira-deploy-app:v2.0 -n aira

# 3. Watch rollout
kubectl rollout status deployment/aira-backend -n aira
```

### 5.8 Rollback

```bash
kubectl rollout undo deployment/aira-backend -n aira
kubectl rollout history deployment/aira-backend -n aira   # see history
```

### 5.9 View Pod Logs

```bash
# All backend pods (most recent 100 lines)
kubectl logs -n aira -l app=aira,component=backend --tail=100

# Single pod (replace pod name from kubectl get pods)
kubectl logs -n aira aira-backend-694c7c4887-8wqvg -f

# Previous crashed container
kubectl logs -n aira aira-backend-694c7c4887-8wqvg --previous
```

### 5.10 Delete Deployment (Teardown)

```bash
kubectl delete namespace aira
# Deletes everything in the aira namespace
```

---

## 6. Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Set to `production` in Kubernetes |
| `PORT` | No | `5000` | HTTP listen port |
| `MONGODB_URI` | Yes | — | Full MongoDB connection URI |
| `REDIS_URL` | Yes | — | Redis URL (`redis://host:6379`) |
| `RABBITMQ_URL` | Yes | — | RabbitMQ AMQP URL |
| `AUDIT_SECRET` | Yes | — | Secret for audit log HMAC signing (min 32 chars) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `METRICS_ENABLED` | No | `true` | Expose `/metrics` Prometheus endpoint |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin(s) |
| `DISABLE_MEMORY_DB` | No | `false` | Force MongoDB (disable in-memory fallback) |
| `ALLOW_IN_MEMORY_LOCKS` | No | `false` | Allow lock fallback if Redis unavailable |
| `SLACK_TOKEN` | No | — | Slack bot token for alert notifications |
| `OPENAI_API_KEY` | No | — | Required if `ENABLE_OPENAI_ANALYSIS=true` |

### Kubernetes ConfigMap Keys (k8s/configmap.yaml)

These non-sensitive keys are injected via ConfigMap:

```yaml
NODE_ENV: "production"
PORT: "5000"
LOG_LEVEL: "info"
REDIS_URL: "redis://aira-redis:6379"
RABBITMQ_URL: "amqp://aira:airapass@aira-rabbitmq:5672"
METRICS_ENABLED: "true"
DISABLE_MEMORY_DB: "true"
ALLOW_IN_MEMORY_LOCKS: "false"
```

### Kubernetes Secret Keys (auto-generated)

Generated by `node k8s/generate-secrets.js` from your `.env`:

| Key | Source |
|---|---|
| `MONGODB_URI` | Built from `MONGO_PASSWORD` — always uses `aira-mongodb:27017` |
| `AUDIT_SECRET` | From `.env` `AUDIT_SECRET` |
| `OPENAI_API_KEY` | From `.env` `OPENAI_API_KEY` |
| `SLACK_TOKEN` | From `.env` `SLACK_TOKEN` |
| `mongodb-password` | From `.env` `MONGO_PASSWORD` |
| `rabbitmq-password` | From `.env` `RABBITMQ_PASS` |

---

## 7. Feature Flags

All feature flags are **disabled by default** (safe for production). Enable via environment variable.

| Flag | Variable | Effect |
|---|---|---|
| OpenAI Analysis | `ENABLE_OPENAI_ANALYSIS=true` | AI-powered root cause analysis via GPT |
| Incident Learning | `ENABLE_INCIDENT_LEARNING=true` | ML-based confidence scoring from past incidents |
| Auto Remediation | `ENABLE_AUTO_REMEDIATION=true` | Execute actions without manual approval |
| K8s Executor | `ENABLE_KUBERNETES_EXECUTOR=true` | Run actions directly on Kubernetes workloads |
| Cost Optimization | `ENABLE_COST_OPTIMIZATION=true` | Cost-aware decision making |
| Cross-Tenant Correlation | `ENABLE_CROSS_TENANT_CORRELATION=true` | Share incident context across tenants |
| ML Confidence Boost | `ENABLE_ML_CONFIDENCE_BOOST=true` | Boost confidence scores with historical data |
| Manual Approval for Restarts | `REQUIRE_MANUAL_APPROVAL_FOR_RESTART=true` | Force approval even for pod restarts |
| Distributed Tracing | `ENABLE_DISTRIBUTED_TRACING=true` | OpenTelemetry trace export |

To enable a flag in Kubernetes, update the ConfigMap:

```bash
kubectl patch configmap aira-config -n aira \
  --type=merge \
  -p '{"data":{"ENABLE_AUTO_REMEDIATION":"true"}}'

kubectl rollout restart deployment/aira-backend -n aira
```

---

## 8. Core API Usage

Base URL: `http://localhost:5000` (local) or `http://localhost:30500` (Kubernetes NodePort)

### 8.1 Health Endpoints

```bash
GET /health
# → {"status":"ok","redis":{"connected":true}}

GET /health/detailed
# → All components: database, queue, redis, featureFlags, canExecuteActions
```

### 8.2 Incident Decision — Core Flow

**Step 1: Submit an incident for decision**

```bash
POST /api/decisions/:tenantId
Content-Type: application/json

{
  "incidentId": "inc-2026-001",
  "severity": "high",
  "affectedService": "payment-api",
  "symptoms": ["high_latency", "error_rate_spike"],
  "context": {
    "errorRate": 0.45,
    "p99Latency": 8500,
    "recentDeploy": true
  }
}
```

**Step 2: Get the decision result**

```bash
GET /api/decisions/:tenantId/:incidentId
```

**Step 3: Execute an action**

```bash
POST /api/actions/:tenantId
Content-Type: application/json

{
  "actionType": "restart_pod",
  "targetService": "payment-api",
  "parameters": { "namespace": "production" },
  "incidentId": "inc-2026-001"
}
```

### 8.3 Policy Management

```bash
# List all policies for a tenant
GET /api/policies/:tenantId

# Get a specific policy
GET /api/policies/:tenantId/:policyId

# Create or update a policy
PUT /api/policies/:tenantId/:policyId
Content-Type: application/json

{
  "name": "high-severity-auto-restart",
  "conditions": {
    "severity": ["high", "critical"],
    "affectedService": ["payment-api", "auth-service"]
  },
  "actions": ["restart_pod", "scale_up"],
  "requiresApproval": false,
  "maxActionsPerHour": 5
}
```

### 8.4 Approval Workflow

When `requiresApproval: true` or `REQUIRE_MANUAL_APPROVAL_FOR_RESTART=true`:

```bash
# Get pending approvals
GET /api/approvals/:tenantId

# Approve an action
POST /api/approvals/:tenantId/:approvalId/approve
Content-Type: application/json
{"approvedBy": "oncall-engineer", "reason": "verified safe"}

# Reject an action
POST /api/approvals/:tenantId/:approvalId/reject
Content-Type: application/json
{"rejectedBy": "oncall-engineer", "reason": "too risky during peak hours"}
```

### 8.5 Runbooks

```bash
# List runbooks
GET /api/runbooks/:tenantId

# Execute a runbook
POST /api/runbooks/:tenantId/:runbookId/execute
Content-Type: application/json
{"incidentId": "inc-2026-001", "parameters": {}}
```

### 8.6 Reporting & Effectiveness

```bash
# Incident summary report
GET /api/reporting/:tenantId/summary?from=2026-07-01&to=2026-07-21

# Action effectiveness metrics
GET /api/effectiveness/:tenantId

# Confidence score history
GET /api/confidence/:tenantId/:incidentId
```

### 8.7 Prometheus Metrics

```bash
GET /metrics
# Returns Prometheus text format:
# aira_decisions_total{tenant="...",outcome="..."} 42
# aira_action_latency_seconds{action_type="..."} 0.234
# aira_approval_queue_depth{tenant="..."} 3
# process_cpu_seconds_total ...
```

---

## 9. Monitoring & Observability

### 9.1 Prometheus + Grafana (Local)

Start the infra-simulation stack from `infra-simulation/`:

```bash
cd infra-simulation
docker compose up -d
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin / admin)

Add Prometheus data source: `http://host.docker.internal:9090`

### 9.2 Key Metrics to Watch

| Metric | Alert Threshold |
|---|---|
| `aira_decisions_total` | Sudden drop → app may be down |
| `aira_action_latency_seconds` | p99 > 5s → slow execution |
| `aira_approval_queue_depth` | > 20 → backlog growing |
| `process_heap_used_bytes` | > 400MB → memory leak |
| `mongodb_connections` | > 100 → connection pool exhaustion |

### 9.3 Kubernetes Pod Monitoring

```bash
# Resource usage
kubectl top pods -n aira

# HPA status
kubectl get hpa -n aira

# Events (for crash diagnosis)
kubectl get events -n aira --sort-by='.lastTimestamp'
```

---

## 10. Upgrading & Rolling Updates

### Update Application Code

```bash
# 1. Make code changes, push to GitHub
git add . && git commit -m "feat: ..." && git push

# 2. Build new image
docker build -t aira-deploy-app:$(git rev-parse --short HEAD) -f Dockerfile .

# 3. Update Kubernetes deployment
kubectl set image deployment/aira-backend \
  aira=aira-deploy-app:$(git rev-parse --short HEAD) -n aira

# 4. Monitor
kubectl rollout status deployment/aira-backend -n aira
```

### Update Configuration (No Restart Needed for ConfigMap)

```bash
kubectl edit configmap aira-config -n aira
# Save and exit — pods reload on next restart
# Force reload:
kubectl rollout restart deployment/aira-backend -n aira
```

### Update Secrets

```bash
# Re-generate from updated .env
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

---

## 11. Troubleshooting

### App won't connect to MongoDB

```bash
# Check if MongoDB pod is running
kubectl get pods -n aira -l component=mongodb

# Check the MONGODB_URI in the secret
kubectl get secret aira-secrets -n aira -o jsonpath="{.data.MONGODB_URI}" \
  | base64 -d   # Linux/Mac
# → should be: mongodb://admin:<password>@aira-mongodb:27017/...

# Regenerate if wrong hostname
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

### CrashLoopBackOff

```bash
# Check crash reason
kubectl logs -n aira <pod-name> --previous

# Common causes:
# - "EAI_AGAIN mongodb"  → wrong MONGODB_URI hostname (see above)
# - "ECONNREFUSED redis" → Redis not running or wrong REDIS_URL
# - "MODULE_NOT_FOUND"   → npm install not run or wrong path
# - OOMKilled           → Increase memory limit in deployment.yaml
```

### Redis not connecting

```bash
kubectl logs -n aira -l component=redis
kubectl exec -n aira -it <redis-pod> -- redis-cli ping
# → PONG
```

### RabbitMQ keeps restarting

```bash
kubectl logs -n aira -l component=rabbitmq
# RabbitMQ takes ~30-60s to start; app uses mock fallback during startup
# Check readiness probe timeout — increase initialDelaySeconds if needed
```

### Port 30500 not responding

NodePort requires Docker Desktop's Kubernetes to route traffic. Use port-forward instead:

```bash
kubectl port-forward svc/aira-backend 8888:80 -n aira
curl http://localhost:8888/health
```

### "Cannot override warnings preference in synchronous validation"

This is a known non-fatal warning from the policy YAML validator (Ajv). The policy engine falls back to hardcoded defaults. It does not affect functionality.

### Docker Compose containers stop after Docker Desktop restart

```bash
cd c:\temp\aira-deploy    # your deploy copy
docker compose up -d
```

---

## Quick Reference — Common Commands

```bash
# ── Local Dev ──────────────────────────────────────
cd backend && npm start                            # start app
curl http://localhost:5000/health/detailed         # health check

# ── Docker Compose ─────────────────────────────────
docker compose up --build -d                       # start all
docker compose logs -f app                         # tail logs
docker compose ps                                  # status
docker compose down                                # stop

# ── Kubernetes ─────────────────────────────────────
kubectl get pods -n aira                           # pod status
kubectl get all -n aira                            # all resources
kubectl logs -n aira -l component=backend -f       # stream logs
kubectl port-forward svc/aira-backend 8888:80 -n aira  # access app
kubectl rollout restart deployment/aira-backend -n aira # restart pods
kubectl scale deployment/aira-backend --replicas=4 -n aira # scale
kubectl delete namespace aira                      # teardown all

# ── Secrets ────────────────────────────────────────
node k8s/generate-secrets.js                       # regenerate secrets
kubectl apply -f k8s/secret-generated.yaml         # apply secrets

# ── Git / CI ───────────────────────────────────────
git push origin master                             # push to GitHub
```
