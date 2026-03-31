/**
 * Jest Mock for isomorphic-dompurify
 * 
 * Provides a simple implementation of DOMPurify.sanitize() for testing
 * without requiring all the @csstools dependencies.
 * 
 * This mock:
 * - Removes all HTML tags
 * - Removes common XSS attack vectors
 * - Preserves text content
 */

/**
 * Simple HTML tag removal - removes ALL tags
 * @param {string} str - HTML string to sanitize
 * @returns {string} - Text without HTML
 */
function stripAllTags(str) {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Remove script tags and dangerous attributes
 * @param {string} str - HTML string to sanitize
 * @returns {string} - Sanitized string
 */
function removeDangerousElements(str) {
  // Remove script tags
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, onload, etc.)
  str = str.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  str = str.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: URIs
  str = str.replace(/javascript:/gi, '');
  
  // Remove data: URIs (except for safe formats)
  str = str.replace(/data:text\/html/gi, '');
  
  // Remove malicious iframe src attributes
  str = str.replace(/src="data:[^"]*"/gi, '');
  str = str.replace(/src='data:[^']*'/gi, '');
  
  return str;
}

/**
 * DOMPurify.sanitize() implementation
 * Removes HTML tags and XSS vectors
 * 
 * @param {string} input - Dirty HTML string
 * @param {object} config - DOMPurify configuration (optional)
 * @returns {string} - Sanitized plain text
 */
function sanitize(input, config = {}) {
  if (!input || typeof input !== 'string') {
    return input;
  }
  
  // Default behavior: remove all HTML tags (safest option)
  let output = input;
  
  // First remove all dangerous elements
  output = removeDangerousElements(output);
  
  // If ALLOWED_TAGS is empty or not specified, strip all tags (default safe mode)
  if (!config.ALLOWED_TAGS || config.ALLOWED_TAGS.length === 0) {
    output = stripAllTags(output);
  } else {
    // If specific tags are allowed, still remove script and dangerous content
    // but keep the allowed tags
    output = removeDangerousElements(output);
  }
  
  return output.trim();
}

module.exports = {
  sanitize,
  default: { sanitize },
};
