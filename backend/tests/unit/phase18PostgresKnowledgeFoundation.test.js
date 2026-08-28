"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const MIGRATION_PATH =
  path.join(
    __dirname,
    "../../persistence/postgres/migrations/0070_production_knowledge_foundation.sql"
  );


describe(
  "Phase 18.3 PostgreSQL Knowledge Foundation",
  () => {

    let sql;


    beforeAll(
      () => {

        sql =
          fs.readFileSync(
            MIGRATION_PATH,
            "utf8"
          );
      }
    );


    test(
      "creates the canonical knowledge schema",
      () => {

        expect(
          sql
        )
          .toMatch(
            /CREATE SCHEMA IF NOT EXISTS\s+knowledge/i
          );
      }
    );


    test(
      "creates the knowledge domain registry",
      () => {

        expect(
          sql
        )
          .toMatch(
            /knowledge\.domains/i
          );


        expect(
          sql
        )
          .toContain(
            "database.postgres"
          );


        expect(
          sql
        )
          .toContain(
            "database.mongodb"
          );
      }
    );


    test(
      "creates stable FailureMode definitions and separate versions",
      () => {

        expect(
          sql
        )
          .toMatch(
            /knowledge\.failure_mode_definitions/i
          );


        expect(
          sql
        )
          .toMatch(
            /knowledge\.failure_mode_versions/i
          );
      }
    );


    test(
      "creates stable Playbook definitions and separate versions",
      () => {

        expect(
          sql
        )
          .toMatch(
            /knowledge\.playbook_definitions/i
          );


        expect(
          sql
        )
          .toMatch(
            /knowledge\.playbook_versions/i
          );
      }
    );


    test(
      "creates stable Runbook definitions and separate versions",
      () => {

        expect(
          sql
        )
          .toMatch(
            /knowledge\.runbook_definitions/i
          );


        expect(
          sql
        )
          .toMatch(
            /knowledge\.runbook_versions/i
          );
      }
    );


    test(
      "preserves legacy Mongo identifiers only for controlled migration",
      () => {

        const occurrences =
          sql.match(
            /legacy_mongo_id/gi
          ) || [];


        expect(
          occurrences.length
        )
          .toBeGreaterThanOrEqual(
            3
          );


        expect(
          sql
        )
          .toContain(
            "MONGO_MIGRATION"
          );
      }
    );


    test(
      "does not create MongoDB as an AIRA persistence authority",
      () => {

        expect(
          sql
        )
          .not
          .toMatch(
            /mongoose\./i
          );


        expect(
          sql
        )
          .not
          .toMatch(
            /mongodb:\/\/|mongodb\+srv:\/\//i
          );
      }
    );


    test(
      "keeps customer MongoDB as a supported operational knowledge domain",
      () => {

        expect(
          sql
        )
          .toContain(
            "database.mongodb"
          );
      }
    );


    test(
      "stores full canonical Playbook and Runbook version documents in PostgreSQL",
      () => {

        expect(
          sql
        )
          .toMatch(
            /knowledge\.playbook_versions[\s\S]*definition jsonb NOT NULL/i
          );


        expect(
          sql
        )
          .toMatch(
            /knowledge\.runbook_versions[\s\S]*definition jsonb NOT NULL/i
          );
      }
    );


    test(
      "retains immutable-version lifecycle fields needed for execution locking",
      () => {

        expect(
          sql
        )
          .toMatch(
            /immutable boolean NOT NULL/i
          );


        expect(
          sql
        )
          .toMatch(
            /locked_at timestamptz/i
          );


        expect(
          sql
        )
          .toMatch(
            /first_executed_at timestamptz/i
          );
      }
    );


    test(
      "forces non-authorizing safety semantics into canonical knowledge",
      () => {

        expect(
          sql
        )
          .toContain(
            '"executionAuthorized": false'
          );


        expect(
          sql
        )
          .toContain(
            '"grantsExecutionPermission": false'
          );


        expect(
          sql
        )
          .toContain(
            '"bypassesPolicy": false'
          );


        expect(
          sql
        )
          .toContain(
            '"bypassesAuthorization": false'
          );
      }
    );


    test(
      "enables and forces RLS on tenant-aware knowledge tables",
      () => {

        const enabled =
          sql.match(
            /ENABLE ROW LEVEL SECURITY/gi
          ) || [];


        const forced =
          sql.match(
            /FORCE ROW LEVEL SECURITY/gi
          ) || [];


        expect(
          enabled.length
        )
          .toBeGreaterThanOrEqual(
            6
          );


        expect(
          forced.length
        )
          .toBeGreaterThanOrEqual(
            6
          );
      }
    );


    test(
      "allows global knowledge reads but not ordinary tenant writes",
      () => {

        expect(
          sql
        )
          .toMatch(
            /p_scope_type = 'GLOBAL'/i
          );


        expect(
          sql
        )
          .toMatch(
            /CREATE OR REPLACE FUNCTION\s+knowledge\.scope_visible/i
          );


        expect(
          sql
        )
          .toMatch(
            /CREATE OR REPLACE FUNCTION\s+knowledge\.scope_writable/i
          );


        const writableFunction =
          sql.match(
            /CREATE OR REPLACE FUNCTION\s+knowledge\.scope_writable[\s\S]*?\$\$;/i
          );


        expect(
          writableFunction
        )
          .not
          .toBeNull();


        expect(
          writableFunction[0]
        )
          .not
          .toMatch(
            /p_scope_type = 'GLOBAL'/
          );
      }
    );


    test(
      "preserves PostgreSQL public-ID and canonical UUID separation",
      () => {

        expect(
          sql
        )
          .toMatch(
            /id uuid PRIMARY KEY/i
          );


        expect(
          sql
        )
          .toMatch(
            /public_id text NOT NULL UNIQUE/i
          );
      }
    );


    test(
      "does not create execution authorization inside the knowledge schema",
      () => {

        expect(
          sql
        )
          .not
          .toMatch(
            /authorization_granted\s+boolean/i
          );


        expect(
          sql
        )
          .not
          .toMatch(
            /execution_authorized\s+boolean\s+default\s+true/i
          );
      }
    );
  }
);