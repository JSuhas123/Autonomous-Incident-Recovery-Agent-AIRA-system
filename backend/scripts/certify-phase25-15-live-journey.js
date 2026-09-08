"use strict";

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
  "25.15-live-customer-journey-v1";


const BASE_URL =
  String(
    process.env
      .AIRA_API_URL ||
      "http://127.0.0.1:5000"
  ).replace(
    /\/$/,
    ""
  );


const OWNER_EMAIL =
  process.env
    .PHASE25_OWNER_EMAIL ||
  "owner@aira-sandbox.local";


const PASSWORD =
  process.env
    .AIRA_SANDBOX_PASSWORD ||
  "AiraSandbox@2026!";


class BrowserSession {
  constructor() {
    this.cookies =
      new Map();
  }


  captureCookies(
    response
  ) {
    const raw =
      response.headers[
        "set-cookie"
      ];


    if (
      !raw
    ) {
      return;
    }


    const values =
      Array.isArray(
        raw
      )
        ? raw
        : [
            raw,
          ];


    for (
      const value
      of values
    ) {
      const pair =
        String(
          value
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


      const cookieValue =
        pair.slice(
          index +
            1
        );


      if (
        cookieValue
      ) {
        this.cookies.set(
          name,
          cookieValue
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
        "AIRA-PHASE25-15-LIVE-JOURNEY",

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


    return response;
  }
}


async function main() {
  printHeader(
    "AIRA PHASE 25.15 — LIVE ENTERPRISE CUSTOMER JOURNEY"
  );


  const browser =
    new BrowserSession();


  const checks = [];

  const journey = [];


  const login =
    await browser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            OWNER_EMAIL,

          password:
            PASSWORD,

          rememberMe:
            false,
        },
      }
    );


  assertCondition(
    login.status ===
      200,

    "PHASE25_15_LOGIN_FAILED",

    `Owner login failed with HTTP ${login.status}`,

    login.data
  );


  checks.push(
    makeCheck(
      "Enterprise owner login",
      true
    )
  );


  journey.push({
    step:
      "login",

    status:
      login.status,
  });


  const endpoints = [
    {
      name:
        "ProductContext",

      route:
        "/api/v1/product/context",

      authorityCheck:
        true,
    },

    {
      name:
        "Overview",

      route:
        "/api/v1/product/overview",

      authorityCheck:
        true,
    },

    {
      name:
        "Operations",

      route:
        "/api/v1/product/operations",

      authorityCheck:
        true,
    },

    {
      name:
        "Incidents",

      route:
        "/api/v1/product/incidents",

      authorityCheck:
        true,
    },

    {
      name:
        "Shadow Mode",

      route:
        "/api/v1/product/shadow",

      authorityCheck:
        true,
    },

    {
      name:
        "Evidence Onboarding",

      route:
        "/api/v1/product/onboarding",

      authorityCheck:
        true,
    },

    {
      name:
        "Reliability",

      route:
        "/api/v1/product/reliability",

      authorityCheck:
        true,
    },

    {
      name:
        "Executive",

      route:
        "/api/v1/product/executive",

      authorityCheck:
        true,
    },

    {
      name:
        "Governance",

      route:
        "/api/v1/product/governance",

      authorityCheck:
        true,
    },

    {
      name:
        "Developer",

      route:
        "/api/v1/product/developer",

      authorityCheck:
        true,
    },

    {
      name:
        "Product Notifications",

      route:
        "/api/v1/product/notifications?limit=25",

      authorityCheck:
        true,
    },

    {
      name:
        "Product Notification Summary",

      route:
        "/api/v1/product/notifications/summary",

      authorityCheck:
        true,
    },

    {
      name:
        "Organization Teams",

      route:
        "/api/v1/organizations/current/teams",

      authorityCheck:
        false,
    },

    {
      name:
        "Notification Channels",

      route:
        "/api/v1/notification-routing/channels",

      authorityCheck:
        false,
    },

    {
      name:
        "Notification Rules",

      route:
        "/api/v1/notification-routing/rules",

      authorityCheck:
        false,
    },
  ];


  const responses = {};


  for (
    const endpoint
    of endpoints
  ) {
    const response =
      await browser.request(
        "GET",
        endpoint.route
      );


    assertCondition(
      response.status ===
        200,

      "PHASE25_15_JOURNEY_STEP_FAILED",

      `${endpoint.name} failed with HTTP ${response.status}`,

      response.data
    );


    if (
      endpoint
        .authorityCheck
    ) {
      recursivelyAssertNoAuthority(
        response.data,
        endpoint.name
      );
    }


    responses[
      endpoint.name
    ] =
      response.data;


    journey.push({
      step:
        endpoint.name,

      route:
        endpoint.route,

      status:
        response.status,
    });


    checks.push(
      makeCheck(
        endpoint.name,
        true,
        `HTTP ${response.status}`
      )
    );
  }


  const context =
    responses
      .ProductContext
      ?.data;


  assertCondition(
    context
      ?.organization
      ?.id &&
    context
      ?.environment
      ?.id,

    "PHASE25_15_CONTEXT_INCOMPLETE",

    "Live journey did not resolve authoritative organization/environment context"
  );


  checks.push(
    makeCheck(
      "Live journey resolves organization and environment",
      true,

      `${context.organization.id} / ${context.environment.id}`
    )
  );


  assertCondition(
    context
      ?.safety
      ?.browserOrganizationAuthoritative ===
      false &&

    context
      ?.safety
      ?.browserEnvironmentAuthoritative ===
      false &&

    context
      ?.safety
      ?.personaGrantsAuthorization ===
      false &&

    context
      ?.safety
      ?.executionAuthorized ===
      false,

    "PHASE25_15_CONTEXT_SAFETY_FAILED",

    "ProductContext violated Phase-25 authority contract"
  );


  checks.push(
    makeCheck(
      "ProductContext safety boundary",
      true
    )
  );


  const overview =
    responses
      .Overview
      ?.data;


  assertCondition(
    overview
      ?.executionAuthorized ===
      false,

    "PHASE25_15_OVERVIEW_AUTHORITY",

    "Overview granted execution authority"
  );


  checks.push(
    makeCheck(
      "Commercial degradation does not grant authority",

      overview
        ?.commercial
        ?.status !==
        "unavailable" ||
      overview
        .executionAuthorized ===
        false,

      overview
        ?.commercial
        ?.status ||
      "available"
    )
  );


  const onboarding =
    responses[
      "Evidence Onboarding"
    ]
      ?.data;


  assertCondition(
    onboarding
      ?.safety
      ?.browserCanCompleteSteps ===
      false &&

    onboarding
      ?.safety
      ?.onboardingGrantsAuthority ===
      false &&

    onboarding
      ?.safety
      ?.readinessGrantsCertification ===
      false,

    "PHASE25_15_ONBOARDING_SAFETY_FAILED",

    "Onboarding readiness crossed certification or authority boundary"
  );


  checks.push(
    makeCheck(
      "Evidence-driven onboarding remains server-owned",
      true
    )
  );


  const shadow =
    responses[
      "Shadow Mode"
    ]
      ?.data;


  assertCondition(
    shadow
      ?.executionAuthorized ===
      false,

    "PHASE25_15_SHADOW_AUTHORITY",

    "Shadow Mode granted execution authority"
  );


  checks.push(
    makeCheck(
      "Shadow Mode remains non-authorizing",
      true
    )
  );


  const artifact =
    writeArtifact(
      "phase25-15-live-journey",
      {
        version:
          VERSION,

        phase:
          "25.15",

        certificationType:
          "LIVE_ENTERPRISE_JOURNEY",

        passed:
          true,

        scope: {
          organizationId:
            context
              .organization
              .id,

          environmentId:
            context
              .environment
              .id,

          role:
            context
              .identity
              ?.role ||
            null,

          persona:
            context
              .identity
              ?.persona ||
            null,
        },

        journey,

        checks,

        observedState: {
          overviewDegraded:
            overview
              ?.degraded ===
            true,

          commercialStatus:
            overview
              ?.commercial
              ?.status ||
            null,

          onboardingReadinessPercent:
            onboarding
              ?.readiness
              ?.percent ??
            null,

          incidentCount:
            Array.isArray(
              responses
                .Incidents
                ?.data
            )
              ? responses
                  .Incidents
                  .data
                  .length
              : Array.isArray(
                    responses
                      .Incidents
                      ?.data
                      ?.incidents
                  )
                ? responses
                    .Incidents
                    .data
                    .incidents
                    .length
                : null,

          notificationCount:
            Array.isArray(
              responses[
                "Product Notifications"
              ]
                ?.data
            )
              ? responses[
                  "Product Notifications"
                ]
                  .data
                  .length
              : null,
        },

        executionAuthorized:
          false,
      }
    );


  printChecks(
    checks
  );


  console.log(
    ""
  );


  console.log(
    `Artifact: ${artifact.filePath}`
  );


  console.log(
    "PASS — PHASE 25.15 LIVE ENTERPRISE JOURNEY CERTIFIED"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[phase25.15] FAILED:",
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
  );