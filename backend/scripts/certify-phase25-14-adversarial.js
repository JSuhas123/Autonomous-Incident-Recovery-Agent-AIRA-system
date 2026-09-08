"use strict";


const crypto =
  require(
    "node:crypto"
  );


const path =
  require(
    "node:path"
  );


require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const axios =
  require(
    "axios"
  );


const productNotificationService =
  require(
    "../services/product/productNotificationService"
  );


const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const {
  assertCondition,
  makeCheck,
  printChecks,
  printHeader,
  recursivelyAssertNoAuthority,
  writeArtifact,
} =
  require(
    "./phase25-certification-common"
  );


const VERSION =
  "25.14-adversarial-v2";


const BASE_URL =
  String(
    process.env
      .AIRA_API_URL ||
      "http://127.0.0.1:5000"
  ).replace(
    /\/$/,
    ""
  );


const PASSWORD =
  process.env
    .AIRA_SANDBOX_PASSWORD ||
  "AiraSandbox@2026!";


const OWNER_EMAIL =
  process.env
    .PHASE25_OWNER_EMAIL ||
  "owner@aira-sandbox.local";


const DEVELOPER_EMAIL =
  process.env
    .PHASE25_DEVELOPER_EMAIL ||
  "developer@aira-sandbox.local";


class BrowserSession {
  constructor(
    label
  ) {
    this.label =
      label;


    this.cookies =
      new Map();


    this.csrfToken =
      null;
  }


  captureCookies(
    response
  ) {
    const rawValues =
      response.headers[
        "set-cookie"
      ];


    if (
      !rawValues
    ) {
      return;
    }


    const values =
      Array.isArray(
        rawValues
      )
        ? rawValues
        : [
            rawValues,
          ];


    for (
      const raw
      of values
    ) {
      const pair =
        String(
          raw
        )
          .split(
            ";"
          )[0];


      const index =
        pair.indexOf(
          "="
        );


      if (
        index <=
        0
      ) {
        continue;
      }


      const name =
        pair.slice(
          0,
          index
        );


      const value =
        pair.slice(
          index +
            1
        );


      if (
        value
      ) {
        this.cookies.set(
          name,
          value
        );
      } else {
        this.cookies.delete(
          name
        );
      }
    }
  }


  cookieHeader() {
    return [
      ...this.cookies
        .entries(),
    ]
      .map(
        (
          [
            name,
            value,
          ]
        ) =>
          `${name}=${value}`
      )
      .join(
        "; "
      );
  }


  async request(
    method,
    route,
    options = {}
  ) {
    const headers = {
      Accept:
        "application/json",

      Origin:
        "http://localhost:5173",

      "User-Agent":
        `AIRA-PHASE25-14-${this.label}`,

      ...(
        options.headers ||
        {}
      ),
    };


    const cookie =
      this.cookieHeader();


    if (
      cookie
    ) {
      headers.Cookie =
        cookie;
    }


    if (
      options.csrf ===
        true &&
      this.csrfToken
    ) {
      headers[
        "X-CSRF-Token"
      ] =
        this.csrfToken;
    }


    const response =
      await axios({
        method,

        url:
          `${BASE_URL}${route}`,

        headers,

        data:
          options.data,

        validateStatus:
          () => true,
      });


    this.captureCookies(
      response
    );


    if (
      response.data
        ?.csrfToken
    ) {
      this.csrfToken =
        response.data
          .csrfToken;
    }


    return response;
  }


  async login(
    email
  ) {
    const response =
      await this.request(
        "POST",
        "/api/v1/auth/login",

        {
          data: {
            email,

            password:
              PASSWORD,

            rememberMe:
              false,
          },
        }
      );


    assertCondition(
      response.status ===
        200,

      "PHASE25_14_LOGIN_FAILED",

      `${email} login failed with HTTP ${response.status}`,

      response.data
    );


    /*
     * Some auth flows return a CSRF token during login while others expose
     * it through the dedicated endpoint.
     */
    if (
      !this.csrfToken
    ) {
      const csrf =
        await this.request(
          "GET",
          "/api/v1/auth/csrf"
        );


      if (
        csrf.data
          ?.csrfToken
      ) {
        this.csrfToken =
          csrf.data
            .csrfToken;
      }
    }


    return response;
  }
}


async function main() {
  printHeader(
    "AIRA PHASE 25.14 — ADVERSARIAL PRODUCT CERTIFICATION"
  );


  const checks = [];


  const testedAttacks = [];


  const owner =
    new BrowserSession(
      "OWNER"
    );


  const developer =
    new BrowserSession(
      "DEVELOPER"
    );


  /*
   * ========================================================================
   * 1. AUTHENTICATED CONTROL SESSIONS
   * ========================================================================
   */

  await owner.login(
    OWNER_EMAIL
  );


  await developer.login(
    DEVELOPER_EMAIL
  );


  checks.push(
    makeCheck(
      "Owner sandbox login",
      true
    )
  );


  checks.push(
    makeCheck(
      "Developer sandbox login",
      true
    )
  );


  /*
   * ========================================================================
   * 2. OWNER AUTHORITATIVE PRODUCT CONTEXT
   * ========================================================================
   */

  const ownerContextResponse =
    await owner.request(
      "GET",
      "/api/v1/product/context"
    );


  assertCondition(
    ownerContextResponse.status ===
      200,

    "PHASE25_14_CONTEXT_FAILED",

    `Owner ProductContext returned HTTP ${ownerContextResponse.status}`,

    ownerContextResponse.data
  );


  const ownerContext =
    ownerContextResponse.data
      ?.data;


  assertCondition(
    ownerContext
      ?.organization
      ?.id &&
    ownerContext
      ?.environment
      ?.id,

    "PHASE25_14_SCOPE_MISSING",

    "Owner ProductContext did not expose authoritative organization/environment context"
  );


  recursivelyAssertNoAuthority(
    ownerContextResponse.data,
    "ownerContext"
  );


  checks.push(
    makeCheck(
      "ProductContext contains no execution authority",
      true
    )
  );


  /*
   * ========================================================================
   * 3. BROWSER ORGANIZATION TAMPERING
   * ========================================================================
   */

  const tamperedOrganization =
    crypto.randomUUID();


  const organizationTamper =
    await owner.request(
      "GET",

      `/api/v1/product/context?organizationId=${encodeURIComponent(
        tamperedOrganization
      )}`
    );


  assertCondition(
    organizationTamper.status ===
      200,

    "PHASE25_14_ORG_TAMPER_UNEXPECTED_STATUS",

    `Organization tamper request returned HTTP ${organizationTamper.status}`,

    organizationTamper.data
  );


  assertCondition(
    organizationTamper.data
      ?.data
      ?.organization
      ?.id ===
      ownerContext
        .organization
        .id,

    "PHASE25_14_BROWSER_ORG_BECAME_AUTHORITATIVE",

    "Browser organizationId query parameter changed authoritative organization context"
  );


  recursivelyAssertNoAuthority(
    organizationTamper.data,
    "organizationTamper"
  );


  checks.push(
    makeCheck(
      "Browser organizationId tampering cannot change authoritative organization",
      true
    )
  );


  testedAttacks.push(
    "browser organization query-parameter tampering"
  );


  /*
   * ========================================================================
   * 4. ENVIRONMENT TAMPERING
   * ========================================================================
   */

  const randomEnvironment =
    `env_${crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )}`;


  const environmentTamper =
    await owner.request(
      "GET",
      "/api/v1/product/overview",

      {
        headers: {
          "X-AIRA-Environment-Id":
            randomEnvironment,
        },
      }
    );


  assertCondition(
    [
      403,
      404,
    ].includes(
      environmentTamper.status
    ),

    "PHASE25_14_ENV_TAMPER_NOT_DENIED",

    `Unknown environment selector returned HTTP ${environmentTamper.status}`,

    environmentTamper.data
  );


  checks.push(
    makeCheck(
      "Unknown/foreign environment selector fails closed",
      true,
      `HTTP ${environmentTamper.status}`
    )
  );


  testedAttacks.push(
    "unknown environment selector"
  );


  /*
   * ========================================================================
   * 5. PERSONA / ROLE HEADER TAMPERING
   * ========================================================================
   *
   * IMPORTANT:
   *
   * The canonical Developer role legitimately contains POLICY_READ.
   *
   * Therefore /api/v1/product/governance is NOT a valid forbidden route for
   * testing Developer privilege escalation.
   *
   * We instead perform two stronger checks:
   *
   * A. forge owner/admin persona/role headers and prove ProductContext still
   *    reports the authenticated Developer identity.
   *
   * B. request an AUDIT_READ endpoint, which Developer does not own.
   * ========================================================================
   */

  const forgedDeveloperContext =
    await developer.request(
      "GET",
      "/api/v1/product/context",

      {
        headers: {
          "X-AIRA-Persona":
            "owner",

          "X-AIRA-Role":
            "owner",

          "X-Role":
            "admin",

          "X-User-Role":
            "owner",
        },
      }
    );


  assertCondition(
    forgedDeveloperContext.status ===
      200,

    "PHASE25_14_DEVELOPER_CONTEXT_FAILED",

    `Developer ProductContext returned HTTP ${forgedDeveloperContext.status}`,

    forgedDeveloperContext.data
  );


  const developerContext =
    forgedDeveloperContext.data
      ?.data;


  const developerRole =
    String(
      developerContext
        ?.identity
        ?.role ||
      ""
    )
      .trim()
      .toLowerCase();


  assertCondition(
    developerRole ===
      "developer",

    "PHASE25_14_FORGED_ROLE_ACCEPTED",

    (
      "Forged browser role/persona headers changed authenticated role. " +
      `Expected developer, received ${developerRole || "<missing>"}`
    ),

    developerContext
  );


  assertCondition(
    developerContext
      ?.safety
      ?.personaGrantsAuthorization ===
      false,

    "PHASE25_14_PERSONA_AUTHORITY_CONTRACT_FAILED",

    "Developer ProductContext did not explicitly deny persona-based authorization"
  );


  recursivelyAssertNoAuthority(
    forgedDeveloperContext.data,
    "forgedDeveloperContext"
  );


  checks.push(
    makeCheck(
      "Forged owner/admin headers do not change authenticated Developer role",
      true,
      `resolved role=${developerRole}`
    )
  );


  /*
   * Developer does not have AUDIT_READ.
   *
   * This is deliberately a GET endpoint so the adversarial test has no
   * mutation side effect.
   */
  const forbiddenAuditRead =
    await developer.request(
      "GET",
      "/api/v1/audit-control/requirements",

      {
        headers: {
          "X-AIRA-Persona":
            "owner",

          "X-AIRA-Role":
            "owner",

          "X-Role":
            "admin",

          "X-User-Role":
            "owner",
        },
      }
    );


  assertCondition(
    forbiddenAuditRead.status ===
      403,

    "PHASE25_14_PERMISSION_ELEVATION",

    (
      "Developer reached an AUDIT_READ-protected route after forged " +
      `owner/admin headers; HTTP ${forbiddenAuditRead.status}`
    ),

    forbiddenAuditRead.data
  );


  checks.push(
    makeCheck(
      "Forged persona/role headers cannot grant a permission Developer lacks",
      true,
      "AUDIT_READ denied with HTTP 403"
    )
  );


  testedAttacks.push(
    "persona and role header privilege escalation"
  );


  /*
   * ========================================================================
   * 6. NOTIFICATION AUTHORITY INJECTION
   * ========================================================================
   */

  let authorityInjectionDenied =
    false;


  try {
    await productNotificationService
      .publish({
        organizationId:
          ownerContext
            .organization
            .id,

        environmentId:
          ownerContext
            .environment
            .id,

        kind:
          "system",

        severity:
          "INFO",

        sourceType:
          "phase25_adversarial",

        sourceRef:
          `authority-${Date.now()}`,

        title:
          "Authority injection test",

        message:
          "This notification must never persist execution authority.",

        executionAuthorized:
          true,
      });
  } catch (
    error
  ) {
    authorityInjectionDenied =
      error
        ?.code ===
      "PRODUCT_NOTIFICATION_AUTHORITY_VIOLATION";
  }


  assertCondition(
    authorityInjectionDenied,

    "PHASE25_14_NOTIFICATION_AUTHORITY_INJECTION",

    "Product notification accepted executionAuthorized=true"
  );


  checks.push(
    makeCheck(
      "Notification execution-authority injection denied",
      true
    )
  );


  testedAttacks.push(
    "notification execution-authority injection"
  );


  /*
   * ========================================================================
   * 7. NOTIFICATION READ SEMANTIC BOUNDARY
   * ========================================================================
   */

  const sourceRef =
    `phase25-read-${crypto
      .randomBytes(
        8
      )
      .toString(
        "hex"
      )}`;


  const published =
    await productNotificationService
      .publish({
        organizationId:
          ownerContext
            .organization
            .id,

        environmentId:
          ownerContext
            .environment
            .id,

        kind:
          "system",

        severity:
          "INFO",

        sourceType:
          "phase25_adversarial",

        sourceRef,

        title:
          "Phase 25 notification read boundary",

        message:
          (
            "Reading this product notification must not acknowledge an " +
            "incident, human task, approval, recovery, or execution."
          ),

        targetType:
          "organization",

        actionPath:
          "/notifications",

        metadata: {
          certification:
            "25.14",

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });


  recursivelyAssertNoAuthority(
    published,
    "publishedNotification"
  );


  const inboxResponse =
    await owner.request(
      "GET",
      "/api/v1/product/notifications?limit=100"
    );


  assertCondition(
    inboxResponse.status ===
      200,

    "PHASE25_14_NOTIFICATION_LIST_FAILED",

    `Notification list returned HTTP ${inboxResponse.status}`,

    inboxResponse.data
  );


  recursivelyAssertNoAuthority(
    inboxResponse.data,
    "notificationInbox"
  );


  const notificationItems =
    Array.isArray(
      inboxResponse.data
        ?.data
    )
      ? inboxResponse.data
          .data
      : [];


  const item =
    notificationItems
      .find(
        (
          candidate
        ) =>
          candidate.sourceRef ===
          sourceRef
      ) ||
    null;


  assertCondition(
    Boolean(
      item
        ?.id
    ),

    "PHASE25_14_NOTIFICATION_NOT_VISIBLE",

    "Adversarial certification notification was not visible to organization target"
  );


  const readResponse =
    await owner.request(
      "POST",

      `/api/v1/product/notifications/${encodeURIComponent(
        item.id
      )}/read`,

      {
        csrf:
          true,
      }
    );


  assertCondition(
    readResponse.status ===
      200,

    "PHASE25_14_NOTIFICATION_READ_FAILED",

    `Notification read returned HTTP ${readResponse.status}`,

    readResponse.data
  );


  assertCondition(
    readResponse.data
      ?.data
      ?.humanTaskAcknowledged ===
      false &&

    readResponse.data
      ?.data
      ?.incidentAcknowledged ===
      false &&

    readResponse.data
      ?.data
      ?.executionAuthorized ===
      false,

    "PHASE25_14_NOTIFICATION_READ_ESCALATION",

    "Reading a product notification altered acknowledgement or authority state",

    readResponse.data
  );


  recursivelyAssertNoAuthority(
    readResponse.data,
    "notificationRead"
  );


  checks.push(
    makeCheck(
      "Notification read != incident acknowledgement != human-task acknowledgement != authority",
      true
    )
  );


  testedAttacks.push(
    "notification read-state escalation"
  );


  /*
   * ========================================================================
   * 8. PRINCIPAL PRODUCT READ MODEL AUTHORITY SCAN
   * ========================================================================
   */

  const routes = [
    "/api/v1/product/overview",

    "/api/v1/product/operations",

    "/api/v1/product/incidents",

    "/api/v1/product/shadow",

    "/api/v1/product/onboarding",

    "/api/v1/product/reliability",

    "/api/v1/product/executive",

    "/api/v1/product/governance",

    "/api/v1/product/developer",
  ];


  for (
    const route
    of routes
  ) {
    const response =
      await owner.request(
        "GET",
        route
      );


    assertCondition(
      response.status ===
        200,

      "PHASE25_14_PRODUCT_ROUTE_FAILED",

      `${route} returned HTTP ${response.status}`,

      response.data
    );


    recursivelyAssertNoAuthority(
      response.data,
      route
    );
  }


  checks.push(
    makeCheck(
      "All principal Product BFF read models recursively preserve executionAuthorized=false",
      true,
      `${routes.length} routes`
    )
  );


  testedAttacks.push(
    "product read-model execution-authority leakage"
  );


  /*
   * ========================================================================
   * FINAL RESULT
   * ========================================================================
   */

  printChecks(
    checks
  );


  const passed =
    checks.every(
      (
        check
      ) =>
        check.passed ===
        true
    );


  assertCondition(
    passed,

    "PHASE25_14_ADVERSARIAL_FAILED",

    "Phase 25.14 adversarial certification did not pass all checks",

    checks.filter(
      (
        check
      ) =>
        !check.passed
    )
  );


  const result =
    writeArtifact(
      "phase25-14-adversarial",

      {
        version:
          VERSION,

        phase:
          "25.14",

        certificationType:
          "ADVERSARIAL_PRODUCT",

        passed:
          true,

        checks,

        testedAttacks,

        identities: {
          owner: {
            email:
              OWNER_EMAIL,

            organizationId:
              ownerContext
                .organization
                .id,

            environmentId:
              ownerContext
                .environment
                .id,
          },

          developer: {
            email:
              DEVELOPER_EMAIL,

            authenticatedRole:
              developerRole,

            forgedRoleAccepted:
              false,
          },
        },

        invariants: {
          browserOrganizationAuthoritative:
            false,

          browserEnvironmentAuthoritative:
            false,

          browserRoleAuthoritative:
            false,

          browserPersonaAuthoritative:
            false,

          personaGrantsPermission:
            false,

          personaGrantsAuthorization:
            false,

          notificationReadAcknowledgesIncident:
            false,

          notificationReadAcknowledgesHumanTask:
            false,

          notificationGrantsAuthorization:
            false,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      }
    );


  console.log(
    ""
  );


  console.log(
    `Artifact: ${result.filePath}`
  );


  console.log(
    "PASS — PHASE 25.14 ADVERSARIAL PRODUCT CERTIFIED"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[phase25.14] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,

          details:
            error.details ||
            null,
        }
      );


      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await closePostgresPool();
      } catch {
        // no-op
      }
    }
  );