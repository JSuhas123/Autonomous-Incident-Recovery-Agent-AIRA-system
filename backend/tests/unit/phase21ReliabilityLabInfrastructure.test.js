"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../..",
    ".."
  );


function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


describe(
  "Phase 21.4 Docker Reliability Lab",
  () => {
    const compose =
      read(
        "reliability-lab/docker/docker-compose.yml"
      );


    test(
      "Docker lab is explicitly isolated from production",
      () => {
        expect(
          compose
        ).toContain(
          "name: aira-reliability-lab"
        );


        expect(
          compose
        ).toContain(
          "aira.safety-class: \"LAB_ONLY\""
        );


        expect(
          compose
        ).toContain(
          "aira.reliability-lab: \"true\""
        );


        expect(
          compose
        ).not.toMatch(
          /environment:\s*production/i
        );
      }
    );


    test(
      "Docker lab contains deterministic dependency topology",
      () => {
        for (
          const service
          of [
            "postgres:",
            "redis:",
            "rabbitmq:",
            "lab-api:",
            "lab-worker:",
          ]
        ) {
          expect(
            compose
          ).toContain(
            service
          );
        }
      }
    );


    test(
      "Docker dependencies use ephemeral lab storage",
      () => {
        expect(
          compose
        ).toContain(
          "tmpfs:"
        );


        expect(
          compose
        ).toContain(
          "/var/lib/postgresql/data"
        );


        expect(
          compose
        ).toContain(
          "/data"
        );
      }
    );


    test(
      "application services wait for healthy dependencies",
      () => {
        expect(
          compose
        ).toContain(
          "condition: service_healthy"
        );
      }
    );


    test(
      "Docker lab uses dedicated host ports",
      () => {
        expect(
          compose
        ).toContain(
          "\"18080:8080\""
        );


        expect(
          compose
        ).toContain(
          "\"18081:8081\""
        );


        expect(
          compose
        ).toContain(
          "\"15433:5432\""
        );
      }
    );
  }
);


describe(
  "Phase 21.5 Kubernetes Reliability Lab",
  () => {
    const kind =
      read(
        "reliability-lab/kubernetes/kind-config.yaml"
      );


    const namespace =
      read(
        "reliability-lab/kubernetes/00-namespace.yaml"
      );


    const dependencies =
      read(
        "reliability-lab/kubernetes/01-dependencies.yaml"
      );


    const workloads =
      read(
        "reliability-lab/kubernetes/02-workloads.yaml"
      );


    test(
      "kind cluster has a dedicated Reliability Lab identity",
      () => {
        expect(
          kind
        ).toContain(
          "name: aira-reliability-lab"
        );


        expect(
          kind
        ).toContain(
          "aira.safety-class=LAB_ONLY"
        );


        expect(
          kind
        ).toContain(
          "aira.reliability-lab=true"
        );
      }
    );


    test(
      "kind cluster exposes only dedicated lab workload ports",
      () => {
        expect(
          kind
        ).toContain(
          "hostPort: 18080"
        );


        expect(
          kind
        ).toContain(
          "hostPort: 18081"
        );
      }
    );


    test(
      "Kubernetes lab uses dedicated namespace",
      () => {
        expect(
          namespace
        ).toContain(
          "name: aira-reliability-lab"
        );


        expect(
          namespace
        ).toContain(
          "aira.safety-class: \"LAB_ONLY\""
        );
      }
    );


    test(
      "Kubernetes dependencies are complete",
      () => {
        expect(
          dependencies
        ).toContain(
          "name: postgres"
        );


        expect(
          dependencies
        ).toContain(
          "name: redis"
        );


        expect(
          dependencies
        ).toContain(
          "name: rabbitmq"
        );


        expect(
          dependencies
        ).toContain(
          "rabbitmq-diagnostics"
        );
      }
    );


    test(
      "Kubernetes workloads use locally certified lab image",
      () => {
        expect(
          workloads
        ).toContain(
          "aira-reliability-fixture:21.6-v1"
        );


        expect(
          workloads
        ).toContain(
          "imagePullPolicy: Never"
        );
      }
    );


    test(
      "Kubernetes workloads expose readiness and liveness probes",
      () => {
        expect(
          workloads
        ).toContain(
          "readinessProbe:"
        );


        expect(
          workloads
        ).toContain(
          "livenessProbe:"
        );


        expect(
          workloads
        ).toContain(
          "path: /ready"
        );


        expect(
          workloads
        ).toContain(
          "path: /health"
        );
      }
    );
  }
);


describe(
  "Phase 21.6 deterministic fixture",
  () => {
    const server =
      read(
        "reliability-lab/apps/fixture/server.js"
      );


    const dockerfile =
      read(
        "reliability-lab/apps/fixture/Dockerfile"
      );


    const packageJson =
      read(
        "reliability-lab/apps/fixture/package.json"
      );


    test(
      "fixture supports API and worker roles",
      () => {
        expect(
          server
        ).toContain(
          "\"api\""
        );


        expect(
          server
        ).toContain(
          "\"worker\""
        );
      }
    );


    test(
      "fixture depends on PostgreSQL Redis and RabbitMQ",
      () => {
        expect(
          packageJson
        ).toContain(
          "\"pg\""
        );


        expect(
          packageJson
        ).toContain(
          "\"redis\""
        );


        expect(
          packageJson
        ).toContain(
          "\"amqplib\""
        );
      }
    );


    test(
      "fixture refuses non-lab safety class",
      () => {
        expect(
          server
        ).toContain(
          "SAFETY_CLASS !=="
        );


        expect(
          server
        ).toContain(
          "\"LAB_ONLY\""
        );
      }
    );


    test(
      "fixture cannot grant execution authorization",
      () => {
        expect(
          server
        ).toContain(
          "executionAuthorized:"
        );


        expect(
          server
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "fixture contains no chaos or failure injection HTTP API",
      () => {
        expect(
          server
        ).not.toMatch(
          /app\.(post|put|patch|delete)\s*\(\s*[\"'`]\/(?:chaos|inject|failure)/i
        );
      }
    );


    test(
      "container runs as non-root user",
      () => {
        expect(
          dockerfile
        ).toContain(
          "USER aira"
        );
      }
    );


    test(
      "lab lifecycle scripts exist",
      () => {
        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "reliability-lab/scripts/docker-lab.ps1"
            )
          )
        ).toBe(
          true
        );


        expect(
          fs.existsSync(
            path.join(
              ROOT,
              "reliability-lab/scripts/kind-lab.ps1"
            )
          )
        ).toBe(
          true
        );
      }
    );
  }
);