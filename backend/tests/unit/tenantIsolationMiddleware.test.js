/**
 * Tenant Isolation Middleware Unit Tests
 * 
 * Tests multi-tenant data isolation enforcement to prevent data leakage
 * Ensures tenantId consistency across URL, headers, and request body
 * 
 * Coverage: 6 critical isolation tests
 */

const {
  tenantIsolationMiddleware,
  createTenantAwareQuery,
  createTenantAwarePipeline,
  preventCrossTenantOperations,
  auditDataAccessMiddleware,
} = require('../../middleware/tenantIsolationMiddleware');

describe('tenantIsolationMiddleware', () => {
  let req, res, next;
  const validTenantId = 'tenant-abc123';

  beforeEach(() => {
    req = {
      tenant: { id: validTenantId },
      params: { tenantId: validTenantId },
      method: 'POST',
      path: '/api/tenant/data',
      body: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();

    jest.clearAllMocks();
  });

  /**
   * Test 1: Valid request with matching tenant IDs passes
   */
  test('should pass request when tenant IDs match across URL and auth', (done) => {
    // Setup: All tenant IDs match
    req.body = { tenantId: validTenantId };

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.withTenantId).toBeDefined();
    expect(req.withTenantUpdate).toBeDefined();

    done();
  });

  /**
   * Test 2: URL tenantId mismatch is rejected
   */
  test('should reject request when URL tenantId mismatches auth', (done) => {
    // Setup: URL has different tenant ID
    req.params.tenantId = 'different-tenant';

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('tenant ID mismatch'),
        code: 'TENANT_MISMATCH',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 3: Request body tenantId mismatch is rejected
   */
  test('should reject request when body tenantId mismatches auth', (done) => {
    // Setup: Body has different tenant ID
    req.body = { tenantId: 'another-tenant' };

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('tenant ID in body'),
        code: 'TENANT_MISMATCH',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 4: Missing authentication is rejected
   */
  test('should reject unauthenticated request (no tenant on req)', (done) => {
    // Setup: No tenant from auth middleware
    delete req.tenant;

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Test 5: withTenantId helper creates isolated queries
   */
  test('should provide withTenantId helper for safe queries', (done) => {
    // Setup
    const baseQuery = { status: 'active' };

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();

    // Use the attached helper
    const isolatedQuery = req.withTenantId(baseQuery);
    expect(isolatedQuery).toEqual({
      status: 'active',
      tenantId: validTenantId,
    });

    done();
  });

  /**
   * Test 6: withTenantUpdate helper protects against tenantId overwrite
   */
  test('should provide withTenantUpdate helper to prevent tenantId override', (done) => {
    // Setup
    const updateData = { name: 'New Name', status: 'inactive' };

    // Execute
    tenantIsolationMiddleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();

    // Use the attached helper - tenantId should not be overwritable
    const isolatedUpdate = req.withTenantUpdate(updateData);
    expect(isolatedUpdate).toEqual({
      $set: {
        name: 'New Name',
        status: 'inactive',
        tenantId: validTenantId, // Cannot be overwritten
      },
    });

    done();
  });

  /**
   * Bonus Test: createTenantAwareQuery utility function
   */
  test('should ensure tenant awareness in query construction', () => {
    // Setup
    const baseQuery = { status: 'active', name: 'test' };

    // Execute
    const query = createTenantAwareQuery(validTenantId, baseQuery);

    // Assert
    expect(query).toEqual({
      status: 'active',
      name: 'test',
      tenantId: validTenantId,
    });
  });

  /**
   * Bonus Test: createTenantAwarePipeline adds tenant filter at first stage
   */
  test('should create aggregation pipelines with tenant filter at first stage', () => {
    // Setup
    const stages = [
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    // Execute
    const pipeline = createTenantAwarePipeline(validTenantId, stages);

    // Assert
    expect(pipeline[0]).toEqual({
      $match: { tenantId: validTenantId },
    });
    expect(pipeline.length).toBe(stages.length + 1);
    expect(pipeline[1]).toEqual(stages[0]);
  });

  /**
   * Bonus Test: preventCrossTenantOperations blocks bulk delete without confirmation
   */
  test('should block bulk delete operations across tenants', (done) => {
    // Setup: DELETE without specific ID or confirmation
    req.method = 'DELETE';
    delete req.params.id;
    req.query = {};

    // Execute
    preventCrossTenantOperations(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Bulk delete'),
        code: 'BULK_DELETE_BLOCKED',
      })
    );
    expect(next).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: preventCrossTenantOperations allows bulk delete with explicit confirmation
   */
  test('should allow bulk delete only with explicit singleTenant confirmation', (done) => {
    // Setup: DELETE with explicit confirmation
    req.method = 'DELETE';
    delete req.params.id;
    req.query = { singleTenant: 'true' };

    // Execute
    preventCrossTenantOperations(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: auditDataAccessMiddleware logs access patterns
   */
  test('should audit data access with timing information', (done) => {
    // Setup
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    req.tenant = { id: validTenantId };

    // Create response with send function
    res.send = jest.fn().mockReturnThis();
    res.statusCode = 200;

    // Execute
    auditDataAccessMiddleware(req, res, (err) => {
      if (err) {
        consoleLogSpy.mockRestore();
        done(err);
        return;
      }

      // Simulate response being sent
      res.send('test data');

      // Assert: audit log should contain access info
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/audit-access/)
      );

      consoleLogSpy.mockRestore();
      done();
    });
  });

  /**
   * Bonus Test: preventCrossTenantOperations allows DELETE with specific ID
   */
  test('should allow DELETE when targeting specific resource by ID', (done) => {
    // Setup
    req.method = 'DELETE';
    req.params = { id: 'resource-123' };

    // Execute
    preventCrossTenantOperations(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    done();
  });

  /**
   * Bonus Test: Tenant isolation allows other HTTP methods
   */
  test('should allow other HTTP methods without bulk delete check', (done) => {
    // Setup: GET request
    req.method = 'GET';
    delete req.params.id;

    // Execute
    preventCrossTenantOperations(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();

    done();
  });
});
