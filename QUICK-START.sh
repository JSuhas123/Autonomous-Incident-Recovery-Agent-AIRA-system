#!/bin/bash
# Quick Start Guide for AIRA v3.0
# This script helps set up and verify the production-grade system

set -e

echo "════════════════════════════════════════════════════════"
echo "  AIRA v3.0: Production-Grade Incident Recovery"
echo "════════════════════════════════════════════════════════"
echo ""

# Function to print section headers
print_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo "✓ $2"
    else
        echo "✗ $2"
        exit 1
    fi
}

# 1. Prerequisites
print_section "1. Checking Prerequisites"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_status 0 "Node.js installed: $NODE_VERSION"
else
    print_status 1 "Node.js not found. Please install Node.js >= 18"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_status 0 "npm installed: $NPM_VERSION"
else
    print_status 1 "npm not found"
fi

# Check MongoDB
if command -v mongosh &> /dev/null || command -v mongo &> /dev/null; then
    print_status 0 "MongoDB client found"
else
    echo "⚠ MongoDB client not found. Make sure MongoDB server is running."
fi

# Check Kubernetes access
if command -v kubectl &> /dev/null; then
    KUBE_VERSION=$(kubectl version --client --short 2>/dev/null || echo "unknown")
    print_status 0 "kubectl installed: $KUBE_VERSION"
else
    echo "⚠ kubectl not found. K8s actions will fail without kubectl."
fi

# 2. Install Dependencies
print_section "2. Installing Dependencies"

echo "Installing npm packages..."
npm install
print_status $? "Dependencies installed"

# 3. Environment Configuration
print_section "3. Configuring Environment"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Kubernetes Configuration
KUBECONFIG=/home/user/.kube/config
K8S_NAMESPACE=default
K8S_API_TIMEOUT=30000
K8S_MAX_RETRIES=3
K8S_RETRY_BACKOFF_MS=1000

# Approval System
APPROVAL_TIMEOUT_MS=600000
APPROVAL_QUEUE_BACKEND=memory

# Confidence Thresholds
AUTO_EXECUTE_THRESHOLD=0.85
ESCALATION_THRESHOLD=0.60

# Database
MONGODB_URL=mongodb://localhost:27017/aira
REDIS_URL=redis://localhost:6379

# Server
PORT=5000
NODE_ENV=development
EOF
    echo "✓ Created .env file (update with your settings)"
else
    echo "✓ .env file already exists"
fi

# 4. Database Setup
print_section "4. Database Setup"

echo "Note: Make sure MongoDB and Redis are running."
echo "  MongoDB: mongodb://localhost:27017"
echo "  Redis: redis://localhost:6379"
echo ""
echo "To start MongoDB locally (if using Docker):"
echo "  docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo ""
echo "To start Redis locally (if using Docker):"
echo "  docker run -d -p 6379:6379 --name redis redis:latest"
echo ""

# 5. Kubernetes Access
print_section "5. Kubernetes Access Verification"

echo "Verifying Kubernetes cluster access..."
if [ -n "$KUBECONFIG" ] || [ -f ~/.kube/config ]; then
    echo "✓ KUBECONFIG found"
    echo ""
    echo "Testing Kubernetes connectivity..."
    if kubectl cluster-info &> /dev/null; then
        CLUSTER_NAME=$(kubectl config current-context 2>/dev/null || echo "unknown")
        print_status 0 "Kubernetes cluster accessible: $CLUSTER_NAME"
        
        # List namespaces
        echo ""
        echo "Available namespaces:"
        kubectl get namespaces --no-headers -o custom-columns=:.metadata.name | head -5
        echo ""
        
        # Check node capacity
        echo "Cluster nodes:"
        kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name | head -5
    else
        echo "⚠ Cannot connect to Kubernetes cluster"
        echo "  Make sure kubectl is configured and cluster is accessible"
    fi
else
    echo "⚠ KUBECONFIG not set and ~/.kube/config not found"
    echo "  Set KUBECONFIG environment variable or create ~/.kube/config"
fi

# 6. Run Tests
print_section "6. Running Tests"

echo "Running unit tests..."
npm run test:unit 2>&1 | tail -20
print_status $? "Unit tests completed"

echo ""
echo "Running integration tests..."
npm run test:integration 2>&1 | tail -20
print_status $? "Integration tests completed"

# 7. Start Server
print_section "7. Starting Server"

echo "Starting AIRA v3.0..."
echo ""
echo "The server will start in the background."
echo "Access the API at: http://localhost:5000"
echo ""
echo "Key endpoints:"
echo "  Health: GET http://localhost:5000/health"
echo "  Metrics: GET http://localhost:5000/metrics"
echo "  Approvals: GET http://localhost:5000/api/v1/tenants/{tenantId}/approvals"
echo ""

# Start server
npm start &
SERVER_PID=$!
sleep 2

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    print_status 0 "Server started (PID: $SERVER_PID)"
else
    print_status 1 "Failed to start server"
fi

# 8. Verify System Health
print_section "8. Verifying System Health"

echo "Checking health endpoints..."

# Try health endpoint
if curl -s http://localhost:5000/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:5000/health)
    echo "✓ Health endpoint responding"
    echo "  Response: $HEALTH" | head -c 100
    echo "..."
else
    echo "⚠ Health endpoint not responding yet"
fi

# 9. Quick Test
print_section "9. Quick System Test"

echo "Testing approval system..."

# Create a test decision (low confidence, requires approval)
TEST_BODY='{
  "tenantId": "test-tenant",
  "decisionId": "test-dec-'$(date +%s)'",
  "action": "restart_pod",
  "reason": "Quick start test",
  "confidence": 0.72,
  "severity": "medium",
  "resource": "test-pod",
  "namespace": "default"
}'

echo "Creating test approval request..."
curl -X POST http://localhost:5000/api/v1/tenants/test-tenant/approvals \
  -H "Content-Type: application/json" \
  -d "$TEST_BODY" 2>/dev/null | python3 -m json.tool | head -20

echo ""
echo "✓ Quick test completed"

# 10. Next Steps
print_section "10. Next Steps"

cat << 'EOF'
Congratulations! AIRA v3.0 is running.

Next steps:

1. Review the documentation:
   - PRODUCTION-UPGRADE-GUIDE.md (complete system guide)
   - API.md (API endpoint reference)
   - ARCHITECTURE.md (system architecture)

2. Test the confidence system:
   - High confidence (>= 0.85): Auto-executes K8s actions
   - Medium confidence (0.60-0.85): Requires approval
   - Low confidence (< 0.60): Blocked, observe only

3. Integrate with Kubernetes:
   - Create a service account with pod/deployment permissions
   - Update KUBECONFIG in .env
   - Test pod restart: POST /api/v1/tenants/{tenantId}/signals
   
4. Set up approval notifications:
   - Configure Slack/email for new approvals
   - Assign on-call team for approvals
   - Set escalation procedures

5. Monitor the system:
   - Check /metrics endpoint for Prometheus metrics
   - Monitor approval queue: /api/v1/tenants/{tenantId}/approvals/queue/stats
   - Review decision traces for quality

6. Customize policies:
   - Edit YAML policy rules in backend/policies/
   - Adjust confidence factors in services/learning/
   - Create custom K8s actions if needed

Need help?
  - Run: npm run test:integration
  - Check logs: npm start (verbose output)
  - Review test files for usage examples

Happy incident recovery! 🚀
EOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Server running on http://localhost:5000"
echo "  Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════════"
echo ""

# Keep script running until interrupted
wait $SERVER_PID
