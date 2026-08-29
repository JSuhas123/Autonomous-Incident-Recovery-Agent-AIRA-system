"use strict";

const CoverageQueryService =
  require(
    "../coverage/CoverageQueryService"
  );

const CoverageRefreshOrchestrator =
  require(
    "../coverage/CoverageRefreshOrchestrator"
  );


const queryService =
  new CoverageQueryService();


const refreshOrchestrator =
  new CoverageRefreshOrchestrator();


async function summary(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getSummary(
          requestScope(
            req
          )
        );


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function resources(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getResources({
          ...requestScope(
            req
          ),

          classification:
            req.query
              .classification ||
            null,

          resourceType:
            req.query
              .resourceType ||
            null,

          resourceId:
            req.query
              .resourceId ||
            null,

          limit:
            req.query.limit,

          offset:
            req.query.offset,
        });


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function failureModes(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getFailureModes({
          ...requestScope(
            req
          ),

          classification:
            req.query
              .classification ||
            null,

          failureModeKey:
            req.query
              .failureModeKey ||
            null,

          limit:
            req.query.limit,

          offset:
            req.query.offset,
        });


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function domains(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getDomains(
          requestScope(
            req
          )
        );


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function gaps(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getGaps({
          ...requestScope(
            req
          ),

          severity:
            req.query
              .severity ||
            null,

          reasonCode:
            req.query
              .reasonCode ||
            null,

          classification:
            req.query
              .classification ||
            null,

          resourceType:
            req.query
              .resourceType ||
            null,

          includeResolved:
            String(
              req.query
                .includeResolved ||
              ""
            )
              .toLowerCase() ===
            "true",

          limit:
            req.query.limit,

          offset:
            req.query.offset,
        });


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function history(
  req,
  res,
  next
) {
  try {
    const data =
      await queryService
        .getHistory({
          ...requestScope(
            req
          ),

          limit:
            req.query.limit,

          offset:
            req.query.offset,
        });


    return res.json({
      success:
        true,

      data,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


async function refresh(
  req,
  res,
  next
) {
  try {
    const data =
      await refreshOrchestrator
        .refresh(
          requestScope(
            req
          )
        );


    return res
      .status(
        201
      )
      .json({
        success:
          true,

        data: {
          refreshedAt:
            data.refreshedAt,

          score:
            data.score,

          gapSummary:
            data.gapSummary,

          snapshot:
            data.snapshot,

          currentGapCount:
            data.currentGaps
              ?.length ||
            0,

          historicalGapCount:
            data.historicalGapCount ||
            0,

          dynamicKnowledgeDiscovery:
            true,

          coverageImpliesExecution:
            false,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });
  } catch (
    error
  ) {
    next(
      error
    );
  }
}


function requestScope(
  req
) {
  const organizationId =
    req.context
      ?.organizationId ||
    req.auth
      ?.organizationId;


  const environmentId =
    req.context
      ?.environmentId ||
    req.environment
      ?.environmentId ||
    req.auth
      ?.environmentId;


  if (
    !organizationId ||
    !environmentId
  ) {
    throw Object.assign(
      new Error(
        "Coverage API requires organization and environment context"
      ),
      {
        statusCode:
          400,

        code:
          "COVERAGE_REQUEST_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    organizationId,
    environmentId,
  };
}


module.exports = {
  summary,

  resources,

  failureModes,

  domains,

  gaps,

  history,

  refresh,
};