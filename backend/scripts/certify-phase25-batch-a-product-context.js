"use strict";

require("dotenv").config();

const axios =
  require(
    "axios"
  );

const crypto =
  require(
    "node:crypto"
  );

const {
  getDefaultPersonaForRole,
  getProductPersonaMetadata,
} =
  require(
    "../constants/productPersonas"
  );


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


/*
 * ============================================================================
 * SANDBOX ROLE MATRIX
 * ============================================================================
 *
 * Do NOT duplicate persona or landing-route values here.
 *
 * Those belong to:
 *
 *     backend/constants/productPersonas.js
 *
 * This certification independently asks the canonical contract what each
 * backend role should resolve to, then verifies /product/context returns it.
 * ============================================================================
 */

const MATRIX = [
  {
    email:
      "owner@aira-sandbox.local",

    role:
      "owner",
  },

  {
    email:
      "admin@aira-sandbox.local",

    role:
      "admin",
  },

  {
    email:
      "sre@aira-sandbox.local",

    role:
      "platform_engineer",
  },

  {
    email:
      "developer@aira-sandbox.local",

    role:
      "developer",
  },

  {
    email:
      "security@aira-sandbox.local",

    role:
      "security_analyst",
  },

  {
    email:
      "auditor@aira-sandbox.local",

    role:
      "auditor",
  },

  {
    email:
      "executive@aira-sandbox.local",

    role:
      "viewer",
  },
];


let checks =
  0;


function pass(
  message
) {
  checks +=
    1;

  console.log(
    `PASS  ${message}`
  );
}


function assert(
  condition,
  message,
  detail =
    null
) {
  if (
    !condition
  ) {
    throw new Error(
      detail
        ? `${message} — ${detail}`
        : message
    );
  }

  pass(
    detail
      ? `${message} — ${detail}`
      : message
  );
}


function canonicalProductExpectation(
  role
) {
  const persona =
    getDefaultPersonaForRole(
      role
    );


  if (
    !persona
  ) {
    throw new Error(
      `No canonical product persona exists for role: ${role}`
    );
  }


  const metadata =
    getProductPersonaMetadata(
      persona
    );


  if (
    !metadata
  ) {
    throw new Error(
      `No product persona metadata exists for persona: ${persona}`
    );
  }


  if (
    !metadata
      .defaultLandingPath
  ) {
    throw new Error(
      `Product persona ${persona} has no defaultLandingPath`
    );
  }


  return {
    persona,

    landing:
      metadata
        .defaultLandingPath,

    metadata,
  };
}


class Browser {
  constructor() {
    this.cookies =
      new Map();
  }


  capture(
    response
  ) {
    const headers =
      response.headers[
        "set-cookie"
      ];


    if (
      !headers
    ) {
      return;
    }


    const values =
      Array.isArray(
        headers
      )
        ? headers
        : [
            headers,
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
        index <= 0
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
        !value
      ) {
        this.cookies.delete(
          name
        );
      } else {
        this.cookies.set(
          name,
          value
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
            key,
            value,
          ]
        ) =>
          `${key}=${value}`
      )
      .join(
        "; "
      );
  }


  async request(
    method,
    path,
    options = {}
  ) {
    const headers = {
      Accept:
        "application/json",

      Origin:
        "http://localhost:5173",

      "User-Agent":
        "AIRA-PHASE25-BATCH-A-CERTIFICATION",

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


    const response =
      await axios({
        method,

        url:
          `${BASE_URL}${path}`,

        headers,

        data:
          options.data,

        validateStatus:
          () => true,
      });


    this.capture(
      response
    );


    return response;
  }
}


async function certifyIdentity(
  expected
) {
  const canonical =
    canonicalProductExpectation(
      expected.role
    );


  console.log(
    `Canonical contract: ${expected.role} -> ${canonical.persona} -> ${canonical.landing}`
  );


  const browser =
    new Browser();


  /*
   * ========================================================================
   * LOGIN
   * ========================================================================
   */

  const login =
    await browser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            expected.email,

          password:
            PASSWORD,

          rememberMe:
            false,
        },
      }
    );


  assert(
    login.status ===
      200,

    `${expected.email}: login`,

    `HTTP ${login.status}`
  );


  /*
   * ========================================================================
   * AUTHORITATIVE PRODUCT CONTEXT
   * ========================================================================
   */

  const contextResponse =
    await browser.request(
      "GET",
      "/api/v1/product/context"
    );


  assert(
    contextResponse.status ===
      200,

    `${expected.email}: authoritative ProductContext`,

    `HTTP ${contextResponse.status}`
  );


  const body =
    contextResponse.data;


  const context =
    body
      ?.data;


  assert(
    Boolean(
      context
    ),

    `${expected.email}: ProductContext payload present`
  );


  /*
   * ========================================================================
   * AUTHORITY INVARIANTS
   * ========================================================================
   */

  assert(
    body
      ?.executionAuthorized ===
      false,

    `${expected.email}: route executionAuthorized=false`
  );


  assert(
    context
      ?.safety
      ?.executionAuthorized ===
      false,

    `${expected.email}: ProductContext executionAuthorized=false`
  );


  assert(
    context
      ?.safety
      ?.personaGrantsAuthorization ===
      false,

    `${expected.email}: persona does not grant authorization`
  );


  assert(
    context
      ?.safety
      ?.browserOrganizationAuthoritative ===
      false,

    `${expected.email}: browser organization not authoritative`
  );


  assert(
    context
      ?.safety
      ?.browserEnvironmentAuthoritative ===
      false,

    `${expected.email}: browser environment not authoritative`
  );


  /*
   * ========================================================================
   * ROLE
   * ========================================================================
   */

  assert(
    context
      ?.identity
      ?.role ===
      expected.role,

    `${expected.email}: canonical role ${expected.role}`,

    `received ${context?.identity?.role}`
  );


  /*
   * ========================================================================
   * PERSONA
   * ========================================================================
   */

  assert(
    context
      ?.identity
      ?.persona ===
      canonical.persona,

    `${expected.email}: persona ${canonical.persona}`,

    `received ${context?.identity?.persona}`
  );


  /*
   * ========================================================================
   * LANDING
   * ========================================================================
   */

  assert(
    context
      ?.identity
      ?.personaMetadata
      ?.defaultLandingPath ===
      canonical.landing,

    `${expected.email}: landing ${canonical.landing}`,

    `received ${context?.identity?.personaMetadata?.defaultLandingPath}`
  );


  /*
   * ========================================================================
   * PERSONA METADATA CONSISTENCY
   * ========================================================================
   */

  assert(
    context
      ?.identity
      ?.personaMetadata
      ?.id ===
      canonical.metadata.id,

    `${expected.email}: persona metadata id`
  );


  assert(
    context
      ?.identity
      ?.personaMetadata
      ?.label ===
      canonical.metadata.label,

    `${expected.email}: persona metadata label`
  );


  /*
   * ========================================================================
   * BACKEND PERMISSIONS
   * ========================================================================
   */

  assert(
    Array.isArray(
      context
        ?.identity
        ?.permissions
    ),

    `${expected.email}: backend permission array`
  );


  assert(
    new Set(
      context
        ?.identity
        ?.permissions ||
        []
    ).size ===
      (
        context
          ?.identity
          ?.permissions ||
        []
      ).length,

    `${expected.email}: backend permissions deduplicated`
  );


  /*
   * ========================================================================
   * ORGANIZATION
   * ========================================================================
   */

  assert(
    Boolean(
      context
        ?.organization
        ?.id
    ),

    `${expected.email}: organization context`
  );


  assert(
    Boolean(
      context
        ?.organization
        ?.tenantId
    ),

    `${expected.email}: tenant identity`
  );


  assert(
    context
      ?.organization
      ?.name ===
      "AIRA Labs Sandbox",

    `${expected.email}: correct sandbox organization`,

    `received ${context?.organization?.name}`
  );


  /*
   * ========================================================================
   * ENVIRONMENT
   * ========================================================================
   */

  assert(
    Boolean(
      context
        ?.environment
        ?.id
    ),

    `${expected.email}: environment context`
  );


  assert(
    context
      ?.environment
      ?.organizationId ===
      context
        ?.organization
        ?.id,

    `${expected.email}: environment belongs to authoritative organization`
  );


  assert(
    context
      ?.environment
      ?.status ===
      "active",

    `${expected.email}: environment ACTIVE`
  );


  assert(
    context
      ?.environment
      ?.settings
      ?.allowAutonomousExecution ===
      false,

    `${expected.email}: environment autonomous execution disabled`
  );


  assert(
    context
      ?.environment
      ?.settings
      ?.requireApprovalForDestructiveActions ===
      true,

    `${expected.email}: destructive actions require approval`
  );


  /*
   * ========================================================================
   * REQUEST TRACE
   * ========================================================================
   */

  assert(
    Boolean(
      context
        ?.request
        ?.requestId
    ),

    `${expected.email}: request correlation identifier`
  );


  /*
   * ========================================================================
   * ORGANIZATION INJECTION
   * ========================================================================
   *
   * Browser-supplied organization identifiers must not replace canonical
   * authenticated organization context.
   */

  const authoritativeOrganizationId =
    context
      .organization
      .id;


  const authoritativeTenantId =
    context
      .organization
      .tenantId;


  const organizationInjection =
    await browser.request(
      "GET",

      `/api/v1/product/context?organizationId=${crypto.randomUUID()}`
    );


  assert(
    organizationInjection.status ===
      200,

    `${expected.email}: organization injection request handled`,

    `HTTP ${organizationInjection.status}`
  );


  assert(
    organizationInjection
      .data
      ?.data
      ?.organization
      ?.id ===
      authoritativeOrganizationId,

    `${expected.email}: browser organization injection ignored`
  );


  assert(
    organizationInjection
      .data
      ?.data
      ?.organization
      ?.tenantId ===
      authoritativeTenantId,

    `${expected.email}: tenant identity unchanged by browser organization injection`
  );


  /*
   * ========================================================================
   * EXPLICIT AUTHORIZED ENVIRONMENT
   * ========================================================================
   */

  const authoritativeEnvironmentId =
    context
      .environment
      .id;


  const explicitEnvironment =
    await browser.request(
      "GET",
      "/api/v1/product/context",
      {
        headers: {
          "X-AIRA-Environment-Id":
            authoritativeEnvironmentId,
        },
      }
    );


  assert(
    explicitEnvironment.status ===
      200,

    `${expected.email}: explicit authorized environment accepted`,

    `HTTP ${explicitEnvironment.status}`
  );


  assert(
    explicitEnvironment
      .data
      ?.data
      ?.environment
      ?.id ===
      authoritativeEnvironmentId,

    `${expected.email}: explicit environment remains authoritative server context`
  );


  assert(
    explicitEnvironment
      .data
      ?.executionAuthorized ===
      false,

    `${expected.email}: environment selection grants no execution authority`
  );


  /*
   * ========================================================================
   * UNKNOWN / FOREIGN ENVIRONMENT
   * ========================================================================
   *
   * Random environment identifiers should not reveal whether they belong to
   * another tenant.
   */

  const invalidEnvironment =
    await browser.request(
      "GET",
      "/api/v1/product/context",
      {
        headers: {
          "X-AIRA-Environment-Id":
            crypto.randomUUID(),
        },
      }
    );


  assert(
    invalidEnvironment.status ===
      404,

    `${expected.email}: unauthorized/unknown environment opaque 404`,

    `HTTP ${invalidEnvironment.status}`
  );
}


async function main() {
  if (
    String(
      process.env
        .NODE_ENV ||
        "development"
    )
      .trim()
      .toLowerCase() ===
    "production"
  ) {
    throw new Error(
      "Batch 25-A certification is prohibited in production"
    );
  }


  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 25 — BATCH A"
  );

  console.log(
    "25.4R PRODUCT RUNTIME + 25.5 TENANT/ENVIRONMENT ISOLATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `API: ${BASE_URL}`
  );

  console.log(
    "Persona contract source: backend/constants/productPersonas.js"
  );

  console.log(
    "Production authority: NONE"
  );

  console.log(
    "Execution authority: NONE"
  );

  console.log(
    ""
  );


  /*
   * ========================================================================
   * CONTRACT PRECHECK
   * ========================================================================
   */

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CANONICAL ROLE → PERSONA → LANDING CONTRACT"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const identity
    of MATRIX
  ) {
    const canonical =
      canonicalProductExpectation(
        identity.role
      );


    console.log(
      `${identity.role.padEnd(20)} -> ${canonical.persona.padEnd(16)} -> ${canonical.landing}`
    );
  }


  console.log(
    ""
  );


  /*
   * ========================================================================
   * LIVE MATRIX
   * ========================================================================
   */

  for (
    const identity
    of MATRIX
  ) {
    console.log(
      `--- ${identity.email} ---`
    );


    await certifyIdentity(
      identity
    );


    console.log(
      ""
    );
  }


  /*
   * ========================================================================
   * FINAL
   * ========================================================================
   */

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "BATCH 25-A CERTIFICATION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Checks passed: ${checks}`
  );

  console.log(
    "Authoritative ProductContext: PASS"
  );

  console.log(
    "Canonical role/persona contract: PASS"
  );

  console.log(
    "Canonical landing contract: PASS"
  );

  console.log(
    "Backend permissions: PASS"
  );

  console.log(
    "Organization context: PASS"
  );

  console.log(
    "Tenant identity: PASS"
  );

  console.log(
    "Environment ownership: PASS"
  );

  console.log(
    "Environment safety settings: PASS"
  );

  console.log(
    "Browser organization authority: DENIED"
  );

  console.log(
    "Foreign/unknown environment disclosure: DENIED"
  );

  console.log(
    "Product persona grants authorization: FALSE"
  );

  console.log(
    "Environment selection grants execution authority: FALSE"
  );

  console.log(
    "Execution authorized: FALSE"
  );

  console.log(
    ""
  );

  console.log(
    "PASS — PHASE 25 BATCH A CERTIFIED"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        ""
      );

      console.error(
        "[phase25-batch-a] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,
        }
      );


      process.exitCode =
        1;
    }
  );