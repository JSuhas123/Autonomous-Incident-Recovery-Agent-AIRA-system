#!/usr/bin/env node
"use strict";


require(
  "dotenv"
).config();


const {
  getPostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const {
  memoryIndexService,
} =
  require(
    "../services/memory/vector/memoryIndexService"
  );


const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


async function main() {
  const pool =
    getPostgresPool();


  try {
    console.log(
      "============================================================"
    );

    console.log(
      "AIRA PHASE 16 — REINDEX OPERATIONAL MEMORIES"
    );

    console.log(
      "============================================================"
    );


    const result =
      await pool.query(
        `
          SELECT
            m.public_id,
            m.memory_type,
            m.scope_type,
            m.status,
            o.public_id AS organization_public_id

          FROM memory.memories m

          JOIN tenancy.organizations o
            ON o.id =
              m.organization_id

          WHERE
            m.status =
              'ACTIVE'

            AND m.memory_type IN (
              'EPISODIC',
              'OUTCOME',
              'PROCEDURAL',
              'SEMANTIC',
              'HUMAN',
              'BEHAVIOURAL'
            )

          ORDER BY
            m.memory_type,
            m.public_id
        `
      );


    console.log(
      `Found ${result.rows.length} ACTIVE memories.`
    );


    let indexed =
      0;


    let failed =
      0;


    for (
      const memory
      of result.rows
    ) {
      console.log(
        `\n[${memory.memory_type}] ${memory.public_id}`
      );


      try {
        const reindexResult =
          await memoryIndexService
            .indexMemory({
              organizationId:
                memory
                  .organization_public_id,

              publicId:
                memory.public_id,
            });


        console.log({
          indexed:
            reindexResult.indexed,

          duplicate:
            reindexResult.duplicate,

          pointId:
            reindexResult.pointId,
        });


        indexed +=
          1;

      } catch (
        error
      ) {
        failed +=
          1;


        console.error({
          publicId:
            memory.public_id,

          code:
            error.code,

          message:
            error.message,
        });
      }
    }


    console.log(
      "\n============================================================"
    );

    console.log(
      "REINDEX SUMMARY"
    );

    console.log(
      "============================================================"
    );


    console.log({
      total:
        result.rows.length,

      indexed,

      failed,
    });


    if (
      failed >
        0
    ) {
      process.exitCode =
        1;
    }

  } catch (
    error
  ) {
    console.error({
      code:
        error.code,

      message:
        error.message,

      stack:
        error.stack,
    });


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();