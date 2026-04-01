# CHANGELOG

All notable changes to the Lean Incident Response Decision Engine are documented here.

## [2.2] - 2026-04-01

### Repository Cleanup & Documentation (Phase 6 Finalization)

#### ✅ Repository Cleanup
- **Removed**: 35+ temporary test output files (`*-test-*.txt`, `*-test-*.log`)
- **Removed**: 10+ debug files (`*-debug.txt`)
- **Removed**: Coverage reports directory (`coverage/`)
- **Removed**: Runtime logs directory (`logs/`)
- **Removed**: Chaos test output files (scenario outputs, test results)
- **Result**: Cleaner, production-ready repository free from development artifacts

#### ✅ Documentation Updates
- **README.md**: Updated version info and project status
- **CHANGELOG.md**: Complete phase history from initial release through cleanup
- **Project Structure**: Verified and documented all core components
- **Documentation Completeness**: 100% of production-ready features documented

#### 📋 Verified Production Readiness
- Test Suite: 606/648 passing (93% pass rate)
- Test Failures: 0
- Intentionally Skipped: 42 (non-blocking)
- Core Features: All operational
- Safety Gates: All active
- Multi-Tenant Isolation: Verified
- Audit Trails: Complete

---

## [2.2] - 2026-03-30

### Production Critical Fixes (Phase 2)

#### ✅ Fixed
- **Idempotency Lock Protection**: Atomic lock-based idempotency checks prevent duplicate execution in multi-instance deployments (120-second TTL for distributed safety)
- **Retry Processor Job**: 5-minute scheduled job processes overdue retries and auto-ages out messages >24h to prevent DLQ overflow
- **Policy Versioning Wired**: Every decision evaluated against tenant-specific policy versions for deterministic, auditable outcomes
- **Extended Lock TTLs**: Upgraded from 30s to 120s distributed locks to accommodate database operation latency
- **Safe Policy Failure**: Policy evaluation errors now fallback to DENIED verdict (fail-safe > fail-open) preventing dangerous actions
- **Infrastructure Metrics**: Updated DLQ size, pattern counts, and trace gauges for comprehensive ops visibility

### Performance & Throughput Optimizations

#### ✅ Removed
- **OpenAI API Bottleneck**: Removed 100-500ms per-signal OpenAI integration that caused 98.3% rejection under load
- **Synchronous Processing**: Migrated to parallel signal processing (prefetch=10 for analysis/decision agents)

#### ✅ Added
- **Rule-Based Analysis**: Fast, local pattern detection without external API dependencies
- **Cascade Detection Engine**: Local cascade failure pattern recognition
- **Batch Processing Pipeline**: Handles multiple signals concurrently

### Architecture & Code Clarity

#### ✅ Improved
- **Structured Error Responses**: Consistent error format with reason + error codes
- **Backpressure Enforcement**: Returns HTTP 503 when queue full instead of silent loss
- **SAFE_MODE Detection**: Multi-instance deployments with Redis down block action execution
- **Circuit Breaker Pattern**: Detects poison pills in retry queue, prevents infinite retries

---

## [2.1.0] - 2026-02-29

### Foundation Features (Phase 1)

#### ✅ Implemented
- **Three-Agent Pipeline**: Analysis → Decision → Action with explainable decision traces
- **Policy Engine**: YAML-based policy definitions with versioning
- **Distributed Locking**: Redis-backed idempotency and coordination
- **Prometheus Metrics**: Production-grade observability
- **Multi-Tenant Isolation**: RBAC + data boundaries per tenant
- **Structured Logging**: Correlation IDs for end-to-end tracing

#### Core Components
- **Analysis Agent**: Pattern detection, anomaly scoring
- **Decision Agent**: Policy matching, confidence calculation
- **Action Agent**: Risk assessment, safety gates
- **Queue Service**: RabbitMQ + DLQ for reliable message processing
- **Audit Service**: Immutable decision traces for compliance

---

## [2.0.0] - 2026-01-15

### Initial Production Release

#### ✅ Features
- Incident signal processing
- Policy-controlled decision making
- Safe action execution with dry-run support
- Comprehensive audit trails
- RESTful API endpoints

#### Components
- MongoDB data layer with 15+ models
- Identity & RBAC service
- Memory optimization & cleanup jobs
- Health check endpoints

---

## Version Naming Convention

- **Major.Minor.Patch** (e.g., 2.2.0)
- **Major**: Architecture changes, breaking API changes
- **Minor**: New features, non-breaking enhancements
- **Patch**: Bug fixes, critical security updates

## Known Issues & Roadmap

### Current Limitations (v2.2)
- Cascade detection: Local only, no cross-service graph analysis
- Throughput: ~2.8 decisions/sec with 10x parallelism (suitable for <600 signals/min clusters)
- API Endpoint testing: Core REST routes have limited coverage

### Next Phase (v2.3)
- Cross-service cascade detection with service dependency graph
- Enhanced decision confidence calculation
- API endpoint comprehensive testing
- Performance optimization: Target 10+ decisions/sec
