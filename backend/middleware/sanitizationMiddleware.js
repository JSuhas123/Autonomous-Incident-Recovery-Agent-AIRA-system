/**
 * HTML Sanitization Middleware
 * 
 * Prevents XSS (Cross-Site Scripting) attacks by sanitizing user-provided content
 * This protects against stored XSS where attackers inject malicious scripts in:
 * - Feedback notes
 * - Policy descriptions
 * - Configuration values
 * - Any user-submitted text fields
 * 
 * Uses xss library for HTML sanitization and filtering
 * 
 * SECURITY APPROACH:
 * - Whitelist mode: Only allow safe HTML tags (if needed for rich text)
 * - Script prevention: Remove <script>, event handlers (onclick, onerror, etc)
 * - Attribute filtering: Remove javascript: URIs, data: URIs
 * - HTML entity encoding for safe storage
 */

const xss = require('xss');

/**
 * Configure xss with strict security rules (no HTML tags by default)
 */
const sanitizeConfig = {
  whiteList: {}, // No HTML tags by default - plain text only
  stripIgnoreTag: true, // Remove unknown tags
};

/**
 * Config: If you need to allow some safe HTML (bold, italic, links)
 * Used for rich-text fields like policy descriptions
 */
const sanitizeConfigRichText = {
  whiteList: {
    'b': [],
    'i': [],
    'em': [],
    'strong': [],
    'a': ['href', 'title'],
    'br': [],
    'p': [],
  },
  stripIgnoreTag: true,
};

/**
 * Sanitize a string value using xss library
 * @param {string} value - The user-provided string to sanitize
 * @param {object} options - Optional sanitization config
 * @returns {string} - Sanitized value safe for storage/display
 */
function sanitizeString(value, options = {}) {
  if (!value) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  // Use provided config or default (plain text only)
  const config = options.allowRichText ? sanitizeConfigRichText : sanitizeConfig;

  try {
    return xss(value.trim(), config);
  } catch (error) {
    console.warn('[sanitization] xss error, returning original value:', error.message);
    // Fail-safe: return original if sanitization fails (should not happen)
    return value;
  }
}

/**
 * Recursively sanitize all string values in an object
 * Useful for sanitizing entire request bodies
 * 
 * @param {object} obj - Object with potentially unsafe strings
 * @param {array} fieldsToSanitize - List of fields to sanitize (if null, sanitize all strings)
 * @param {object} options - Sanitization options
 * @returns {object} - Object with sanitized strings
 */
function sanitizeObject(obj, fieldsToSanitize = null, options = {}) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in sanitized) {
    if (!sanitized.hasOwnProperty(key)) continue;

    const value = sanitized[key];

    // Check if we should sanitize this field
    const shouldSanitize =
      fieldsToSanitize === null || // Sanitize all if no list specified
      fieldsToSanitize.includes(key); // Or sanitize if in the list

    if (shouldSanitize && typeof value === 'string') {
      sanitized[key] = sanitizeString(value, options);
    } else if (shouldSanitize && typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, fieldsToSanitize, options);
    }
  }

  return sanitized;
}

/**
 * Express middleware to sanitize request body
 * Removes XSS payloads from all string fields in POST/PUT/PATCH requests
 * 
 * Place this AFTER express.json() and BEFORE route handlers
 */
const sanitizationMiddleware = (fieldsToSanitize = null, options = {}) => {
  return (req, res, next) => {
    // Only sanitize dangerous HTTP methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Only sanitize JSON body
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    // Don't sanitize binary/file uploads
    if (req.is('multipart/form-data') || req.is('application/octet-stream')) {
      return next();
    }

    try {
      req.body = sanitizeObject(req.body, fieldsToSanitize, options);

      // Record sanitization metric (if metrics available)
      if (req.metricsService) {
        req.metricsService.incrementCounter('xss_sanitizations', {
          endpoint: req.path,
          method: req.method,
        });
      }
    } catch (error) {
      console.error('[sanitization] Error sanitizing request body:', error);
      // Fail-safe: continue even if sanitization fails
    }

    next();
  };
};

/**
 * Test function to verify XSS payloads are blocked
 * Used in unit tests
 */
function testXSSPayloads(log = true) {
  const payloads = [
    { name: 'script tag', payload: '<script>alert("xss")</script>', expected: '' },
    { name: 'img tag', payload: '<img src=x onerror=alert("xss")>', expected: '' },
    { name: 'svg tag', payload: '<svg onload=alert("xss")>', expected: '' },
    { name: 'event handler', payload: '<div onclick="alert(\'xss\')">click</div>', expected: 'click' },
    { name: 'javascript URI', payload: '<a href="javascript:alert(\'xss\')">link</a>', expected: 'link' },
    { name: 'data URI', payload: '<iframe src="data:text/html,<script>alert(\'xss\')</script>"></iframe>', expected: '' },
    { name: 'nested HTML', payload: 'text<script>alert("xss")</script>more', expected: 'textmore' },
    { name: 'comment injection', payload: '<!-- <script>alert("xss")</script> -->', expected: '' },
  ];

  const results = [];

  for (const test of payloads) {
    try {
      const sanitized = sanitizeString(test.payload);
      const passed = sanitized === test.expected;

      results.push({
        name: test.name,
        payload: test.payload,
        sanitized,
        passed,
      });

      if (log) {
        const status = passed ? '✓' : '✗';
        console.log(`[XSS Test] ${status} ${test.name}`);
      }
    } catch (error) {
      results.push({
        name: test.name,
        error: error.message,
        passed: false,
      });

      if (log) {
        console.log(`[XSS Test] ✗ ${test.name} - Error: ${error.message}`);
      }
    }
  }

  return {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    results,
  };
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizationMiddleware,
  testXSSPayloads,
  sanitizeConfig,
  sanitizeConfigRichText,
};
