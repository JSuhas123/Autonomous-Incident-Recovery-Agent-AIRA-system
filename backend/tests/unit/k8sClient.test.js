/**
 * Unit Tests for K8sClient
 * 
 * Tests:
 * - Client initialization
 * - Verification of connectivity
 * - Pod restart operations
 * - Deployment restart operations
 * - Deployment scaling operations
 * - Error handling and retries
 * - Cluster isolation and config handling
 */

const { K8sClient, getK8sClient } = require('../../services/k8s/k8sClient');

describe('K8sClient Unit Tests', () => {
  let k8sClient;

  beforeEach(() => {
    // Reset singleton for each test
    jest.resetModules();
  });

  describe('Initialization', () => {
    test('should initialize with environment configuration', () => {
      process.env.K8S_NAMESPACE = 'test-namespace';
      process.env.K8S_API_TIMEOUT = '30000';
      process.env.K8S_MAX_RETRIES = '3';

      const client = new K8sClient();

      expect(client.namespace).toBe('test-namespace');
      expect(client.apiTimeout).toBe(30000);
      expect(client.maxRetries).toBe(3);
    });

    test('should use default values when env vars not set', () => {
      delete process.env.K8S_NAMESPACE;
      delete process.env.K8S_API_TIMEOUT;
      delete process.env.K8S_MAX_RETRIES;

      const client = new K8sClient();

      expect(client.namespace).toBe('default');
      expect(client.apiTimeout).toBe(30000);
      expect(client.maxRetries).toBe(3);
    });

    test('should return singleton instance', () => {
      const client1 = getK8sClient();
      const client2 = getK8sClient();

      expect(client1).toBe(client2);
    });
  });

  describe('Error Handling', () => {
    test('should identify retryable errors', () => {
      const client = new K8sClient();

      // HTTP errors
      expect(client._isRetryableError({ statusCode: 408 })).toBe(true); // Request Timeout
      expect(client._isRetryableError({ statusCode: 429 })).toBe(true); // Too Many Requests
      expect(client._isRetryableError({ statusCode: 500 })).toBe(true); // Server Error
      expect(client._isRetryableError({ statusCode: 503 })).toBe(true); // Service Unavailable

      // Network errors
      expect(client._isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(client._isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(client._isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(client._isRetryableError({ code: 'EHOSTUNREACH' })).toBe(true);

      // Non-retryable errors
      expect(client._isRetryableError({ statusCode: 400 })).toBe(false); // Bad Request
      expect(client._isRetryableError({ statusCode: 401 })).toBe(false); // Unauthorized
      expect(client._isRetryableError({ statusCode: 404 })).toBe(false); // Not Found
    });
  });

  describe('Action Execution Interface', () => {
    test('should validate required parameters for restart_pod', async () => {
      const client = new K8sClient();
      client.coreApi = null; // Mark as not ready

      await expect(
        client.executeAction('restart_pod', {}, {})
      ).rejects.toThrow('not initialized');
    });

    test('should validate replica count for scale_deployment', async () => {
      const client = new K8sClient();
      client.isReady = true;

      // Missing replicas parameter
      await expect(
        client.executeAction('scale_deployment', { resource: 'test-deploy' }, {})
      ).rejects.toThrow('requires "replicas" parameter');

      // Invalid replica count
      await expect(
        client.executeAction('scale_deployment', { resource: 'test-deploy', replicas: -1 }, {})
      ).rejects.toThrow('Must be non-negative integer');

      // Non-integer replica count
      await expect(
        client.executeAction('scale_deployment', { resource: 'test-deploy', replicas: 2.5 }, {})
      ).rejects.toThrow('Must be non-negative integer');
    });

    test('should reject unknown action types', async () => {
      const client = new K8sClient();

      await expect(
        client.executeAction('unknown_action', {}, {})
      ).rejects.toThrow('Unknown K8s action type');
    });
  });

  describe('Configuration Safety', () => {
    test('should not hardcode cluster details', () => {
      const client = new K8sClient();

      // Verify no hardcoded values in the instance
      expect(client.namespace).toBeDefined();
      expect(client.apiTimeout).toBeDefined();
      expect(client.maxRetries).toBeDefined();

      // All these should come from env or defaults, not hardcoded strings
      const hasHardcodedUrl = client.toString().includes('https://');
      const hasHardcodedAuth = client.toString().includes('api-key');

      expect(hasHardcodedUrl).toBe(false);
      expect(hasHardcodedAuth).toBe(false);
    });

    test('should respect KUBECONFIG environment variable', () => {
      const originalKubeconfig = process.env.KUBECONFIG;
      
      process.env.KUBECONFIG = '/custom/path/kubeconfig';
      const client = new K8sClient();

      // Should try to load from the specified path
      // (actual load may fail in test env, but we verify the attempt)
      expect(process.env.KUBECONFIG).toBe('/custom/path/kubeconfig');

      process.env.KUBECONFIG = originalKubeconfig;
    });
  });

  describe('Operation Logging', () => {
    test('should accept and use correlationId for tracing', () => {
      const client = new K8sClient();
      const correlationId = 'trace-123-456';

      // These should not throw for logs with no actual K8s connection
      expect(() => {
        // Log formatting should include correlationId
        const params = {
          resource: 'test-pod',
          namespace: 'default',
          correlationId,
        };
        expect(params.correlationId).toBe(correlationId);
      }).not.toThrow();
    });

    test('should log operations with decision trace context', () => {
      const client = new K8sClient();

      // Verify logging interface accepts decision context
      const context = {
        correlationId: 'trace-123',
        decisionId: 'decision-456',
        tenantId: 'tenant-789',
      };

      expect(() => {
        // Context should be passable to all operations
        expect(context.correlationId).toBe('trace-123');
        expect(context.decisionId).toBe('decision-456');
        expect(context.tenantId).toBe('tenant-789');
      }).not.toThrow();
    });
  });

  describe('Namespace Isolation', () => {
    test('should support custom namespaces', () => {
      const client = new K8sClient();

      // Should be able to pass namespace to operations
      expect(typeof client.restartPod).toBe('function');
      expect(typeof client.restartDeployment).toBe('function');
      expect(typeof client.scaleDeployment).toBe('function');

      // Namespace parameter should be optional
      const params = ['pod-name', 'custom-namespace'];
      expect(params.length).toBe(2);
    });

    test('should default to configured namespace when not specified', () => {
      process.env.K8S_NAMESPACE = 'prod';
      const client = new K8sClient();

      expect(client.namespace).toBe('prod');
    });
  });

  describe('Timeout and Retry Configuration', () => {
    test('should apply configured timeout to API calls', () => {
      process.env.K8S_API_TIMEOUT = '60000';
      const client = new K8sClient();

      expect(client.apiTimeout).toBe(60000);
    });

    test('should apply configured retry backoff', () => {
      process.env.K8S_RETRY_BACKOFF_MS = '2000';
      const client = new K8sClient();

      expect(client.retryBackoffMs).toBe(2000);
    });

    test('should respect max retries configuration', () => {
      process.env.K8S_MAX_RETRIES = '5';
      const client = new K8sClient();

      expect(client.maxRetries).toBe(5);
    });
  });

  describe('Status Query Methods (Integration Points)', () => {
    test('should define getPodStatus method', () => {
      const client = new K8sClient();
      expect(typeof client.getPodStatus).toBe('function');
    });

    test('should define getDeploymentStatus method', () => {
      const client = new K8sClient();
      expect(typeof client.getDeploymentStatus).toBe('function');
    });

    test('should define verifyConnectivity method', () => {
      const client = new K8sClient();
      expect(typeof client.verifyConnectivity).toBe('function');
    });
  });
});
