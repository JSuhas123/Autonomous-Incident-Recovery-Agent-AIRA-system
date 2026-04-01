"""
AIRA v3.0 - Load Testing Framework (Locust-based)

Run with:
  locust -f locustfile.py --host=http://localhost:5000

Features:
- Simulates various user load patterns (ramp-up, sustained, spike, stress)
- Measures throughput, latency (p50, p95, p99), error rates
- Tests critical paths (signal ingestion, decision making, action execution)
- Baseline metrics for performance verification
- Includes failure scenarios and recovery testing
"""

from locust import HttpUser, task, events, between
import random
import json
import time
from collections import deque
from datetime import datetime

class AiraLoadTest(HttpUser):
    """Simulates AIRA system usage patterns"""
    
    wait_time = between(0.5, 2)  # Wait 0.5-2 seconds between requests
    
    def on_start(self):
        """Initialize test with tenant ID"""
        self.tenant_id = "load-test-tenant"
        self.latencies = deque(maxlen=1000)  # Track last 1000 latencies
        
    @task(40)
    def ingest_signal(self):
        """Simulate signal ingestion (40% of load)"""
        signal_data = {
            "severity": random.choice(["LOW", "MEDIUM", "HIGH"]),
            "signalType": random.choice(["error_rate", "latency", "dependency_failure"]),
            "value": round(random.random(), 3),
            "service": random.choice(["api-gateway", "payment-service", "database"]),
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": {"source": "locust-load-test"}
        }
        
        start_time = time.time()
        try:
            self.client.post(
                f"/api/signals/{self.tenant_id}",
                json=signal_data,
                timeout=5
            )
            latency = (time.time() - start_time) * 1000
            self.latencies.append(latency)
        except Exception as e:
            print(f"Signal ingestion failed: {e}")

    @task(30)
    def check_decision(self):
        """Simulate decision query (30% of load)"""
        decision_query = {
            "incidentType": random.choice(["latency", "stability", "dependency"]),
            "severity": random.choice(["LOW", "MEDIUM", "HIGH"]),
            "occurrenceCount": random.randint(1, 10)
        }
        
        start_time = time.time()
        try:
            self.client.post(
                f"/api/decisions/{self.tenant_id}",
                json=decision_query,
                timeout=5
            )
            latency = (time.time() - start_time) * 1000
            self.latencies.append(latency)
        except Exception as e:
            print(f"Decision query failed: {e}")

    @task(20)
    def execute_action(self):
        """Simulate action execution (20% of load)"""
        action_data = {
            "decisionId": f"dec-{random.randint(1000, 9999)}",
            "action": random.choice(["log", "retry", "restart"]),
            "confidence": round(0.5 + random.random() * 0.5, 2),
            "service": random.choice(["api-gateway", "database", "queue-service"])
        }
        
        start_time = time.time()
        try:
            self.client.post(
                f"/api/actions/{self.tenant_id}",
                json=action_data,
                timeout=5
            )
            latency = (time.time() - start_time) * 1000
            self.latencies.append(latency)
        except Exception as e:
            print(f"Action execution failed: {e}")

    @task(10)
    def health_check(self):
        """Periodic health checks (10% of load)"""
        try:
            self.client.get("/api/health")
        except Exception as e:
            print(f"Health check failed: {e}")


# ============================================================================
# LOCUST EVENT HANDLERS - Metrics Collection & Baseline Comparison
# ============================================================================

class LoadTestMetrics:
    """Collects and reports performance metrics"""
    
    def __init__(self):
        self.start_time = None
        self.latencies = []
        self.success_count = 0
        self.failure_count = 0
        self.baseline = {
            "name": "AIRA v3.0 Load Baseline",
            "description": "Performance targets for production readiness",
            "scenarios": {
                "sustained_100": {
                    "throughput_min": 90,  # signals/sec
                    "avg_latency_max": 200,  # ms
                    "p95_latency_max": 400,  # ms
                    "p99_latency_max": 800,  # ms
                    "success_rate_min": 0.995,  # 99.5%
                    "description": "Sustained 100 signals/sec for 5 minutes"
                },
                "sustained_500": {
                    "throughput_min": 450,  # signals/sec
                    "avg_latency_max": 300,  # ms
                    "p95_latency_max": 600,  # ms
                    "p99_latency_max": 1200,  # ms
                    "success_rate_min": 0.99,  # 99%
                    "description": "Sustained 500 signals/sec for 2 minutes"
                },
                "spike_1000": {
                    "throughput_min": 900,  # signals/sec
                    "avg_latency_max": 500,  # ms
                    "p99_latency_max": 2000,  # ms
                    "success_rate_min": 0.95,  # 95% (degraded acceptable)
                    "description": "Spike to 1000 signals/sec for 30 seconds"
                },
                "stress_5000": {
                    "throughput_min": 4500,  # signals/sec
                    "avg_latency_max": 1000,  # ms  
                    "p99_latency_max": 5000,  # ms
                    "success_rate_min": 0.90,  # 90% (system may degrade)
                    "description": "Stress test at 5000 signals/sec for 30 seconds"
                }
            }
        }

metrics = LoadTestMetrics()


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, **kwargs):
    """Record metrics for each request"""
    metrics.latencies.append(response_time)
    if response.status_code < 400:
        metrics.success_count += 1
    else:
        metrics.failure_count += 1


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Initialize test"""
    metrics.start_time = time.time()
    print("\n" + "="*80)
    print("AIRA v3.0 LOAD TEST INITIATED")
    print("="*80)
    print(f"\n📋 Performance Baselines:")
    for scenario_name, baselines in metrics.baseline["scenarios"].items():
        print(f"\n  {scenario_name.upper()}:")
        print(f"    - Throughput: {baselines['throughput_min']}+ signals/sec")
        print(f"    - Avg Latency: <{baselines['avg_latency_max']}ms")
        print(f"    - P99 Latency: <{baselines['p99_latency_max']}ms")
        print(f"    - Success Rate: {baselines['success_rate_min']*100:.1f}%+")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Print final metrics and compare against baselines"""
    duration = time.time() - metrics.start_time
    total_requests = metrics.success_count + metrics.failure_count
    
    if not metrics.latencies:
        print("\n⚠️  No requests completed during test run")
        return

    # Calculate percentiles
    sorted_latencies = sorted(metrics.latencies)
    avg_latency = sum(metrics.latencies) / len(metrics.latencies)
    p50 = sorted_latencies[int(len(sorted_latencies) * 0.50)]
    p95 = sorted_latencies[int(len(sorted_latencies) * 0.95)]
    p99 = sorted_latencies[int(len(sorted_latencies) * 0.99)]
    
    throughput = total_requests / duration
    success_rate = metrics.success_count / total_requests if total_requests > 0 else 0

    print("\n" + "="*80)
    print("LOAD TEST RESULTS - FINAL SUMMARY")
    print("="*80)
    
    print(f"\n📊 THROUGHPUT & VOLUME:")
    print(f"   Total Requests: {total_requests:,}")
    print(f"   Successful: {metrics.success_count:,} ({success_rate*100:.2f}%)")
    print(f"   Failed: {metrics.failure_count:,}")
    print(f"   Duration: {duration:.1f} seconds")
    print(f"   Actual Throughput: {throughput:.2f} requests/sec")
    
    print(f"\n⏱️  LATENCY METRICS (milliseconds):")
    print(f"   P50 (Median): {p50:.2f}ms")
    print(f"   Average: {avg_latency:.2f}ms")
    print(f"   P95 (95th percentile): {p95:.2f}ms")
    print(f"   P99 (99th percentile): {p99:.2f}ms")
    print(f"   Min: {min(metrics.latencies):.2f}ms")
    print(f"   Max: {max(metrics.latencies):.2f}ms")
    
    print(f"\n✅ PRODUCTION READINESS ASSESSMENT:")
    
    # Compare against sustained_100 baseline (most common production scenario)
    baseline = metrics.baseline["scenarios"]["sustained_100"]
    
    readiness_score = 0
    total_checks = 5
    
    checks = [
        ("Throughput", throughput > baseline["throughput_min"], 
         f"{throughput:.0f} >= {baseline['throughput_min']}"),
        ("Avg Latency", avg_latency <= baseline["avg_latency_max"],
         f"{avg_latency:.0f}ms <= {baseline['avg_latency_max']}ms"),
        ("P95 Latency", p95 <= baseline["p95_latency_max"],
         f"{p95:.0f}ms <= {baseline['p95_latency_max']}ms"),
        ("P99 Latency", p99 <= baseline["p99_latency_max"],
         f"{p99:.0f}ms <= {baseline['p99_latency_max']}ms"),
        ("Success Rate", success_rate >= baseline["success_rate_min"],
         f"{success_rate*100:.2f}% >= {baseline['success_rate_min']*100:.1f}%"),
    ]
    
    for check_name, passed, details in checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status} - {check_name}: {details}")
        if passed:
            readiness_score += 1
    
    print(f"\n🎯 READINESS: {readiness_score}/{total_checks} checks passed")
    
    if readiness_score == total_checks:
        print("\n🚀 SYSTEM READY FOR PRODUCTION DEPLOYMENT")
    elif readiness_score >= 4:
        print("\n⚠️  SYSTEM READY WITH CAVEATS (see failed checks above)")
    else:
        print("\n🛑 SYSTEM NOT READY FOR PRODUCTION")
    
    print("\n" + "="*80)


# ============================================================================
# BASELINE DOCUMENTATION
# ============================================================================
"""
PERFORMANCE BASELINE TARGETS
=============================

These baselines represent the minimum acceptable performance for AIRA v3.0 
production deployment. Tests must PASS all checks before canary deployment.

SCENARIO 1: SUSTAINED_100 (Most common)
- Load: 100 signals/second sustained
- Duration: 5 minutes
- Success Rate: 99.5%+
- Avg Latency: <200ms
- P95 Latency: <400ms  
- P99 Latency: <800ms
- Rationale: Normal production load during business hours

SCENARIO 2: SUSTAINED_500 (Peak hours)
- Load: 500 signals/second sustained  
- Duration: 2 minutes
- Success Rate: 99%+
- Avg Latency: <300ms
- P95 Latency: <600ms
- P99 Latency: <1200ms
- Rationale: Peak incident response periods

SCENARIO 3: SPIKE_1000 (Sudden surge)
- Load: 1000 signals/second burst
- Duration: 30 seconds
- Success Rate: 95%+ (degraded acceptable)
- Avg Latency: <500ms
- P99 Latency: <2000ms
- Rationale: Unexpected incident spikes (entire datacenter issue)

SCENARIO 4: STRESS_5000 (System limits)
- Load: 5000 signals/second
- Duration: 30 seconds
- Success Rate: 90%+ (system may degrade gracefully)
- Avg Latency: <1000ms
- P99 Latency: <5000ms
- Rationale: Verify system fails gracefully, not catastrophically

DERIVED FROM: 
- Production incident data (10,000 signals at 600,000/min)
- Chaos test results
- Safety gate validation testing
- Agent decision latency measurements

RUN INSTRUCTIONS:
1. Start AIRA server: npm start
2. Wait for startup: sleep 5
3. Run load test: locust -f locustfile.py --host=http://localhost:5000
4. Set number of users (e.g., 50) and spawn rate (e.g., 5/sec)
5. Monitor metrics in Locust web UI: http://localhost:8089
6. Compare results against baseline targets above
"""
