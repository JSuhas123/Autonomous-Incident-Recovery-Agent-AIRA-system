"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * ORGANIZATION PROFILE ROUTE CONTRACT CERTIFICATION
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
  createProductOrganizationProfileRouter,
} =
  require(
    "../../routes/productOrganizationProfileRoutes"
  );


function createMockService() {
  return {
    getProfile:
      jest.fn(
        async ({
          organizationId,
          environmentId,
        }) => ({
          id:
            "orgprof_test",

          organizationId,

          environmentId,

          legalName:
            "AIRA Example Private Limited",

          industry:
            "Software",

          profileStatus:
            "complete",
        })
      ),


    upsertProfile:
      jest.fn(
        async ({
          organizationId,
          environmentId,
          input,
        }) => ({
          id:
            "orgprof_test",

          organizationId,

          environmentId,

          ...input,

          profileStatus:
            "complete",
        })
      ),
  };
}


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

    name:
      "AIRA Test Organization",

    slug:
      "aira-test-organization",
  };


  req.membership = {
    id:
      "membership_001",

    role:
      "owner",
  };


  req.environment = {
    id:
      "env_001",

    name:
      "Development",
  };


  next();
}


function requestJson(
  server,
  {
    method,
    path,
    body,
  }
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const address =
        server.address();


      const payload =
        body ===
          undefined
          ? null
          : JSON.stringify(
              body
            );


      const req =
        http.request(
          {
            hostname:
              "127.0.0.1",

            port:
              address.port,

            method,

            path,

            headers:
              payload
                ? {
                    "content-type":
                      "application/json",

                    "content-length":
                      Buffer.byteLength(
                        payload
                      ),
                  }
                : {},
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
                    raw
                      ? JSON.parse(
                          raw
                        )
                      : null,
                });
              }
            );
          }
        );


      req.on(
        "error",
        reject
      );


      if (payload) {
        req.write(
          payload
        );
      }


      req.end();
    }
  );
}


async function createServer(
  service
) {
  const app =
    express();


  app.use(
    express.json()
  );


  app.use(
    "/api/v1/product/organization-profile",

    createProductOrganizationProfileRouter({
      service,

      readPreHandlers: [
        canonicalContextMiddleware,
      ],

      writePreHandlers: [
        canonicalContextMiddleware,
      ],
    })
  );


  const server =
    http.createServer(
      app
    );


  await new Promise(
    (
      resolve
    ) => {
      server.listen(
        0,
        "127.0.0.1",
        resolve
      );
    }
  );


  return server;
}


describe(
  "AIRA Phase 25.2B — Organization Profile Routes",
  () => {
    let server;
    let service;


    beforeEach(
      async () => {
        service =
          createMockService();


        server =
          await createServer(
            service
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
      "GET uses authenticated server organization context",
      async () => {
        const result =
          await requestJson(
            server,
            {
              method:
                "GET",

              path:
                "/api/v1/product/organization-profile",
            }
          );


        expect(
          result.status
        ).toBe(
          200
        );


        expect(
          service.getProfile
        ).toHaveBeenCalledWith({
          organizationId:
            "org_001",

          environmentId:
            "env_001",
        });
      }
    );


    test(
      "PUT updates profile using authenticated organization context",
      async () => {
        const result =
          await requestJson(
            server,
            {
              method:
                "PUT",

              path:
                "/api/v1/product/organization-profile",

              body: {
                legalName:
                  "Updated Company Ltd",

                industry:
                  "Cloud Infrastructure",
              },
            }
          );


        expect(
          result.status
        ).toBe(
          200
        );


        expect(
          service.upsertProfile
        ).toHaveBeenCalledWith({
          organizationId:
            "org_001",

          environmentId:
            "env_001",

          input: {
            legalName:
              "Updated Company Ltd",

            industry:
              "Cloud Infrastructure",
          },
        });
      }
    );


    test(
      "PUT rejects client-supplied organization authority",
      async () => {
        const result =
          await requestJson(
            server,
            {
              method:
                "PUT",

              path:
                "/api/v1/product/organization-profile",

              body: {
                organizationId:
                  "org_attacker",

                legalName:
                  "Wrong Tenant Ltd",
              },
            }
          );


        expect(
          result.status
        ).toBe(
          400
        );


        expect(
          result.body.error.code
        ).toBe(
          "PRODUCT_CLIENT_TENANT_AUTHORITY_REJECTED"
        );


        expect(
          service.upsertProfile
        ).not
          .toHaveBeenCalled();
      }
    );


    test(
      "PUT rejects client-supplied environment authority",
      async () => {
        const result =
          await requestJson(
            server,
            {
              method:
                "PUT",

              path:
                "/api/v1/product/organization-profile",

              body: {
                environmentId:
                  "production-attacker",

                legalName:
                  "Wrong Environment Ltd",
              },
            }
          );


        expect(
          result.status
        ).toBe(
          400
        );


        expect(
          service.upsertProfile
        ).not
          .toHaveBeenCalled();
      }
    );


    test(
      "product profile response never grants execution authority",
      async () => {
        const result =
          await requestJson(
            server,
            {
              method:
                "GET",

              path:
                "/api/v1/product/organization-profile",
            }
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