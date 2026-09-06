"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * PRODUCT CONTEXT ROUTE CERTIFICATION
 * ============================================================================
 */

const express =
  require(
    "express"
  );


const http =
  require(
    "http"
  );


const {
  createProductContextRouter,
} =
  require(
    "../../routes/productContextRoutes"
  );


function canonicalContextMiddleware(
  req,
  _res,
  next
) {
  req.user = {
    id:
      "user_001",
  };


  req.organization = {
    id:
      "org_001",

    tenantId:
      "tenant_001",

    name:
      "AIRA Test Organization",

    slug:
      "aira-test",

    status:
      "active",
  };


  req.membership = {
    id:
      "membership_001",

    role:
      "platform_engineer",
  };


  req.environment = {
    id:
      "env_001",

    organizationId:
      "org_001",

    name:
      "Development",

    slug:
      "development",

    environmentType:
      "development",

    criticality:
      "low",

    status:
      "active",
  };


  req.requestId =
    "request_001";


  next();
}


function requestJson(
  server,
  path
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const address =
        server.address();


      const req =
        http.request(
          {
            hostname:
              "127.0.0.1",

            port:
              address.port,

            method:
              "GET",

            path,
          },

          (
            res
          ) => {
            let raw =
              "";


            res.on(
              "data",
              (
                chunk
              ) => {
                raw +=
                  chunk;
              }
            );


            res.on(
              "end",
              () => {
                resolve({
                  status:
                    res.statusCode,

                  body:
                    JSON.parse(
                      raw
                    ),
                });
              }
            );
          }
        );


      req.on(
        "error",
        reject
      );


      req.end();
    }
  );
}


describe(
  "AIRA Phase 25.2B — Product Context Route",
  () => {
    let server;


    beforeEach(
      async () => {
        const app =
          express();


        app.use(
          "/api/v1/product/context",

          createProductContextRouter({
            preHandlers: [
              canonicalContextMiddleware,
            ],
          })
        );


        server =
          http.createServer(
            app
          );


        await new Promise(
          (
            resolve
          ) =>
            server.listen(
              0,
              "127.0.0.1",
              resolve
            )
        );
      }
    );


    afterEach(
      async () => {
        if (
          server?.listening
        ) {
          await new Promise(
            (
              resolve
            ) =>
              server.close(
                resolve
              )
          );
        }
      }
    );


    test(
      "returns authoritative product context",
      async () => {
        const result =
          await requestJson(
            server,
            "/api/v1/product/context"
          );


        expect(
          result.status
        ).toBe(
          200
        );


        expect(
          result.body
            .data
            .organization
            .id
        ).toBe(
          "org_001"
        );


        expect(
          result.body
            .data
            .environment
            .id
        ).toBe(
          "env_001"
        );
      }
    );


    test(
      "platform engineer resolves to operations persona",
      async () => {
        const result =
          await requestJson(
            server,
            "/api/v1/product/context"
          );


        expect(
          result.body
            .data
            .identity
            .persona
        ).toBe(
          "operations"
        );
      }
    );


    test(
      "provides persona landing destination",
      async () => {
        const result =
          await requestJson(
            server,
            "/api/v1/product/context"
          );


        expect(
          result.body
            .data
            .identity
            .personaMetadata
            .defaultLandingPath
        ).toBe(
          "/operations"
        );
      }
    );


    test(
      "product context itself never grants execution authorization",
      async () => {
        const result =
          await requestJson(
            server,
            "/api/v1/product/context"
          );


        expect(
          result.body
            .data
            .safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.body
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);