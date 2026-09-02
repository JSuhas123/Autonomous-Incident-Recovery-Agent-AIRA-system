"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const projectRoot =
  path.join(
    __dirname,
    "..",
    "..",
    ".."
  );


function readFrontend(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      projectRoot,
      "frontend",
      "src",
      relativePath
    ),
    "utf8"
  );
}


describe(
  "Phase 23.7 Incident Command UI V1",
  () => {
    test(
      "Incident Detail mounts canonical Incident Command panel",
      () => {
        const source =
          readFrontend(
            "pages/IncidentDetailPage.tsx"
          );


        expect(
          source
        ).toContain(
          "IncidentCommandPanel"
        );


        expect(
          source
        ).toContain(
          "<IncidentCommandPanel"
        );
      }
    );


    test(
      "UI consumes server-calculated capabilities",
      () => {
        const source =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        expect(
          source
        ).toContain(
          "capabilities.acknowledge"
        );


        expect(
          source
        ).toContain(
          "capabilities.requestControl"
        );


        expect(
          source
        ).toContain(
          "capabilities.authorizeControl"
        );


        expect(
          source
        ).toContain(
          "capabilities.acquireControl"
        );


        expect(
          source
        ).toContain(
          "capabilities.heartbeatControl"
        );


        expect(
          source
        ).toContain(
          "capabilities.returnControl"
        );
      }
    );


    test(
      "UI never locally infers Take Control from task status",
      () => {
        const source =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        expect(
          source
        ).not.toMatch(
          /task\.status\s*===\s*['"]ACKNOWLEDGED['"]/
        );


        expect(
          source
        ).not.toMatch(
          /session\.status\s*===\s*['"]AUTHORIZED['"]/
        );


        expect(
          source
        ).toContain(
          "capabilities.acquireControl"
        );
      }
    );


    test(
      "client exposes complete Batch 7 command surface",
      () => {
        const source =
          readFrontend(
            "api/incidentCommandApi.ts"
          );


        expect(
          source
        ).toContain(
          "'/acknowledge'"
        );


        expect(
          source
        ).toContain(
          "'/take-control/request'"
        );


        expect(
          source
        ).toContain(
          "'/take-control/authorize'"
        );


        expect(
          source
        ).toContain(
          "'/take-control/acquire'"
        );


        expect(
          source
        ).toContain(
          "'/take-control/heartbeat'"
        );


        expect(
          source
        ).toContain(
          "'/return-control'"
        );
      }
    );


    test(
      "command client preserves environment and CSRF context",
      () => {
        const source =
          readFrontend(
            "api/incidentCommandApi.ts"
          );


        expect(
          source
        ).toContain(
          "X-AIRA-Environment-Id"
        );


        expect(
          source
        ).toContain(
          "X-CSRF-Token"
        );


        expect(
          source
        ).toContain(
          "credentials:"
        );


        expect(
          source
        ).toContain(
          "'include'"
        );
      }
    );


    test(
      "human control UI exposes authoritative lease visibility",
      () => {
        const source =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        expect(
          source
        ).toContain(
          "HUMAN CONTROL ACTIVE"
        );


        expect(
          source
        ).toContain(
          "Last heartbeat"
        );


        expect(
          source
        ).toContain(
          "Expires"
        );


        expect(
          source
        ).toContain(
          "controlEpoch"
        );
      }
    );


    test(
      "return-control UI explicitly displays fresh-evaluation fence",
      () => {
        const source =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        expect(
          source
        ).toContain(
          "Fresh AIRA evaluation required"
        );


        expect(
          source
        ).toContain(
          "pre-takeover"
        );


        expect(
          source
        ).toContain(
          "fresh diagnosis"
        );


        expect(
          source
        ).toContain(
          "fresh recovery decision"
        );
      }
    );


    test(
      "UI explicitly preserves execution-authority separation",
      () => {
        const panel =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        const types =
          readFrontend(
            "types/incidentCommand.ts"
          );


        expect(
          panel
        ).toContain(
          "execution authority: NO"
        );


        expect(
          panel
        ).toContain(
          "never grant AIRA infrastructure"
        );


        expect(
          types
        ).toContain(
          "executionAuthorized: false"
        );


        expect(
          types
        ).toContain(
          "stalePlanResumeAllowed: false"
        );
      }
    );


    test(
      "Incident Command UI does not import execution infrastructure",
      () => {
        const panel =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        const api =
          readFrontend(
            "api/incidentCommandApi.ts"
          );


        const combined =
          `${panel}\n${api}`;


        expect(
          combined
        ).not.toContain(
          "k8sClient"
        );


        expect(
          combined
        ).not.toContain(
          "docker"
        );


        expect(
          combined
        ).not.toContain(
          "executionService"
        );


        expect(
          combined
        ).not.toContain(
          "executeRecovery"
        );
      }
    );


    test(
      "UI surfaces handoff package without treating it as authority",
      () => {
        const source =
          readFrontend(
            "components/incidents/IncidentCommandPanel.tsx"
          );


        expect(
          source
        ).toContain(
          "Incident handoff"
        );


        expect(
          source
        ).toContain(
          "handoffBrief"
        );


        expect(
          source
        ).toContain(
          "Canonical handoff package"
        );
      }
    );
  }
);