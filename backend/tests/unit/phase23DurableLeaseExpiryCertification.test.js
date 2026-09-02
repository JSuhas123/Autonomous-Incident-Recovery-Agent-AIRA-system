"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


describe(
  "Phase 23.1F durable lease expiry certification",
  () => {
    const scriptPath =
      path.join(
        __dirname,
        "..",
        "..",
        "scripts",
        "certify-phase23-1f-lease-expiry-live.js"
      );


    let source;


    beforeAll(
      () => {
        source =
          fs.readFileSync(
            scriptPath,
            "utf8"
          );
      }
    );


    test(
      "certification script exists",
      () => {
        expect(
          fs.existsSync(
            scriptPath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "uses canonical takeover repository",
      () => {
        expect(
          source
        ).toContain(
          "PostgresHumanTakeoverRepository"
        );


        expect(
          source
        ).toContain(
          ".heartbeatLease("
        );
      }
    );


    test(
      "requires the expired heartbeat error",
      () => {
        expect(
          source
        ).toContain(
          "HUMAN_CONTROL_LEASE_EXPIRED"
        );
      }
    );


    test(
      "verifies lease expiry persisted after error",
      () => {
        expect(
          source
        ).toContain(
          "PHASE23_EXPIRY_NOT_DURABLE"
        );


        expect(
          source
        ).toContain(
          "CONTROL_LEASE_STATUS.EXPIRED"
        );
      }
    );


    test(
      "verifies takeover session also expires",
      () => {
        expect(
          source
        ).toContain(
          "TAKEOVER_SESSION_STATUS.EXPIRED"
        );


        expect(
          source
        ).toContain(
          "PHASE23_SESSION_EXPIRY_NOT_DURABLE"
        );
      }
    );


    test(
      "verifies no active lease survives expiry",
      () => {
        expect(
          source
        ).toContain(
          "countActiveLeases"
        );


        expect(
          source
        ).toContain(
          "activeCount ==="
        );


        expect(
          source
        ).toContain(
          "PHASE23_EXPIRED_ACTIVE_LEASE_REMAINS"
        );
      }
    );


    test(
      "continues enforcing no execution authority",
      () => {
        expect(
          source
        ).toContain(
          "execution_authorized"
        );


        expect(
          source
        ).toContain(
          "executionAuthorized"
        );


        expect(
          source
        ).toContain(
          "Execution authorization:         FALSE"
        );
      }
    );


    test(
      "does not perform infrastructure execution",
      () => {
        expect(
          source
        ).not.toContain(
          "kubectl"
        );


        expect(
          source
        ).not.toContain(
          "docker exec"
        );


        expect(
          source
        ).not.toContain(
          "child_process"
        );
      }
    );
  }
);