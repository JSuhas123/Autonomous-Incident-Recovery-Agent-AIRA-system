reliability-lab/
│
├── README.md
│
├── apps/
│   └── fixture/
│       ├── Dockerfile
│       ├── package.json
│       └── server.js
│
├── docker/
│   └── docker-compose.yml
│
├── kubernetes/
│   ├── kind-config.yaml
│   ├── 00-namespace.yaml
│   ├── 01-dependencies.yaml
│   ├── 02-fixture.yaml
│   └── 03-observability.yaml
│
├── observability/
│   ├── prometheus.yml
│   └── otel-collector.yml
│
└── scripts/
    ├── docker-up.ps1
    ├── docker-down.ps1
    ├── kind-up.ps1
    ├── kind-down.ps1
    └── smoke-test.ps1


    # AIRA Reliability Lab

AIRA Phase 21 Reliability Lab is the deterministic infrastructure and
evaluation harness used to test AIRA against controlled real failures.

It is not part of AIRA's production execution path.

## Phase

Phase 21 — Reliability Lab

Current Batch:

- 21.4 Docker Reliability Lab
- 21.5 Kubernetes/kind Reliability Lab
- 21.6 Deterministic sample failure-aware application

## Safety Boundary

All infrastructure created by this directory is explicitly marked:

- `aira.reliability-lab=true`
- `aira.phase=21`
- `aira.safety-class=LAB_ONLY`

The Reliability Lab may create and destroy its own disposable infrastructure.

It must never become an alternative production execution path.

Failure injection is NOT implemented in this batch.

Failure injection belongs to Phase 21.9 and its hard safety boundary belongs
to Phase 21.10.

## Lab Application

The deterministic fixture has two roles.

### API

Receives order requests and stores deterministic state.

Dependencies:

- PostgreSQL
- Redis
- RabbitMQ

Endpoints:

- `GET /health`
- `GET /ready`
- `GET /dependency-health`
- `GET /debug/state`
- `GET /metrics`
- `POST /orders`
- `GET /orders/:id`

### Worker

Consumes order events from RabbitMQ and updates the corresponding order in
PostgreSQL and Redis.

Endpoints:

- `GET /health`
- `GET /ready`
- `GET /dependency-health`
- `GET /debug/state`
- `GET /metrics`

## Docker Lab

Start:

```powershell
.\reliability-lab\scripts\docker-up.ps1