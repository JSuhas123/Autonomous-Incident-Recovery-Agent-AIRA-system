# AIRA Quick Reference

## Local Dev

```bash
cd backend && npm install && npm start
curl http://localhost:5000/health/detailed
```

---

## Docker Compose (Staging)

```bash
docker compose up --build -d        # start everything
docker compose ps                   # check status
docker compose logs -f app          # tail app logs
docker compose down                 # stop
docker compose down -v              # stop + wipe volumes
```

Endpoints: `http://localhost:5000` (app), `http://localhost:15672` (RabbitMQ UI)

---

## Kubernetes (Production)

### First-time deploy

```bash
node k8s/generate-secrets.js
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret-generated.yaml
kubectl apply -f k8s/redis.yaml -f k8s/rabbitmq.yaml -f k8s/mongodb.yaml
kubectl apply -f k8s/deployment.yaml -f k8s/nodeport.yaml
```

### Status & Access

```bash
kubectl get pods -n aira                         # pod status
kubectl get all -n aira                          # all resources
kubectl port-forward svc/aira-backend 8888:80 -n aira   # access app
curl http://localhost:8888/health                # verify
# NodePort (Docker Desktop): http://localhost:30500/health
```

### Operate

```bash
kubectl logs -n aira -l app=aira,component=backend -f --tail=100
kubectl scale deployment/aira-backend --replicas=4 -n aira
kubectl rollout restart deployment/aira-backend -n aira
kubectl rollout undo deployment/aira-backend -n aira
kubectl get events -n aira --sort-by='.lastTimestamp'
```

### Update & Upgrade

```bash
# New image
docker build -t aira-deploy-app:v2 -f Dockerfile .
kubectl set image deployment/aira-backend aira=aira-deploy-app:v2 -n aira
kubectl rollout status deployment/aira-backend -n aira

# Update config (env var)
kubectl patch configmap aira-config -n aira --type=merge \
  -p '{"data":{"LOG_LEVEL":"debug"}}'
kubectl rollout restart deployment/aira-backend -n aira

# Update secrets
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

### Enable a Feature Flag

```bash
kubectl patch configmap aira-config -n aira --type=merge \
  -p '{"data":{"ENABLE_AUTO_REMEDIATION":"true"}}'
kubectl rollout restart deployment/aira-backend -n aira
```

### Teardown

```bash
kubectl delete namespace aira
```

---

## Testing

```bash
cd backend
npm test                                    # all tests
npm test -- --testPathPattern=unit          # unit only
npm test -- --testPathPattern=integration   # integration only
npm run test:coverage                       # coverage report
cd chaos && node run-chaos-tests.js         # chaos tests
```

---

## Core API

```bash
BASE=http://localhost:5000
T=demo-tenant

# Health
curl $BASE/health
curl $BASE/health/detailed
curl $BASE/metrics

# Submit incident
curl -X POST $BASE/api/decisions/$T \
  -H 'Content-Type: application/json' \
  -d '{"incidentId":"INC-001","severity":"high","affectedService":"payment-api","symptoms":["high_latency"]}'

# Pending approvals
curl $BASE/api/approvals/$T

# Approve
curl -X POST $BASE/api/approvals/$T/APPROVAL_ID/approve \
  -H 'Content-Type: application/json' \
  -d '{"approvedBy":"engineer","reason":"verified safe"}'

# Policies
curl $BASE/api/policies/$T

# Effectiveness report
curl $BASE/api/reporting/$T/summary
```

---

## Debug Crashed Pod

```bash
kubectl get pods -n aira                       # find pod name
kubectl describe pod <pod-name> -n aira        # events + restart reason
kubectl logs <pod-name> -n aira --previous     # logs from last crash
kubectl exec -it <pod-name> -n aira -- sh      # shell into running pod
```

---

## Git

```bash
git add . && git commit -m "..." && git push origin master
git log --oneline -10
git status
```
