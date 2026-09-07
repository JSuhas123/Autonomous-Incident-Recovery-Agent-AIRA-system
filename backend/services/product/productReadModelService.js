"use strict";


const {
  Incident,
} =
  require(
    "../../persistence/operational/canonicalModels"
  );


const EnvironmentService =
  require(
    "../core/environmentService"
  );


const {
  ACTIVE_INCIDENT_STATUSES,
} =
  require(
    "../../constants/incidents"
  );


function stringId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  return (
    value
      ?.toString?.() ??
    String(
      value
    )
  );
}


function dateValue(
  value
) {
  if (!value) {
    return null;
  }


  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}


function ageLabel(
  value
) {
  const date =
    dateValue(
      value
    );


  if (!date) {
    return "unknown";
  }


  const deltaMs =
    Math.max(
      Date.now() -
        date.getTime(),
      0
    );


  const minutes =
    Math.floor(
      deltaMs /
      60000
    );


  if (
    minutes <
    1
  ) {
    return "<1m";
  }


  if (
    minutes <
    60
  ) {
    return `${minutes}m`;
  }


  const hours =
    Math.floor(
      minutes /
      60
    );


  if (
    hours <
    24
  ) {
    return `${hours}h`;
  }


  return `${Math.floor(
    hours /
      24
  )}d`;
}


function normalizeSeverity(
  severity
) {
  const value =
    String(
      severity ||
      "info"
    )
      .trim()
      .toLowerCase();


  if (
    value ===
    "critical"
  ) {
    return "critical";
  }


  if (
    value ===
    "warning" ||
    value ===
    "high"
  ) {
    return "warning";
  }


  return "info";
}


function productSeverity(
  severity
) {
  const value =
    normalizeSeverity(
      severity
    );


  if (
    value ===
    "critical"
  ) {
    return "critical";
  }


  if (
    value ===
    "warning"
  ) {
    return "high";
  }


  return "low";
}


function workflowState(
  incident
) {
  const status =
    String(
      incident
        ?.status ||
      "open"
    )
      .trim()
      .toLowerCase();


  if (
    status ===
    "investigating"
  ) {
    return "investigating";
  }


  if (
    status ===
    "recovering"
  ) {
    return "recovery_running";
  }


  if (
    status ===
    "resolved" ||
    status ===
    "closed"
  ) {
    return "verified";
  }


  if (
    incident
      ?.approvalRequired ===
    true
  ) {
    return "approval_required";
  }


  return "observing";
}


function incidentTitle(
  incident
) {
  return (
    incident
      ?.title ||
    "Untitled incident"
  );
}


function incidentServiceLabel(
  incident
) {
  return (
    incident
      ?.serviceName ||
    stringId(
      incident
        ?.serviceId
    ) ||
    "Unknown service"
  );
}


function safeIncident(
  incident
) {
  return {
    id:
      stringId(
        incident
          ?._id
      ),

    title:
      incidentTitle(
        incident
      ),

    description:
      incident
        ?.description ||
      null,

    service:
      incidentServiceLabel(
        incident
      ),

    serviceId:
      stringId(
        incident
          ?.serviceId
      ),

    severity:
      productSeverity(
        incident
          ?.severity
      ),

    rawSeverity:
      incident
        ?.severity ||
      "info",

    status:
      incident
        ?.status ||
      "open",

    workflowState:
      workflowState(
        incident
      ),

    source:
      incident
        ?.source ||
      null,

    providerCount:
      Number(
        incident
          ?.providerCount ||
        0
      ),

    evidenceCount:
      Number(
        incident
          ?.evidenceCount ||
        0
      ),

    correlationConfidence:
      typeof incident
        ?.correlationConfidence ===
        "number"
        ? incident
            .correlationConfidence
        : null,

    detectedAt:
      dateValue(
        incident
          ?.detectedAt
      )
        ?.toISOString() ||
      null,

    createdAt:
      dateValue(
        incident
          ?.createdAt
      )
        ?.toISOString() ||
      null,

    age:
      ageLabel(
        incident
          ?.detectedAt ||
        incident
          ?.createdAt
      ),

    executionAuthorized:
      false,
  };
}


async function readIncidents({
  organizationId,
  environmentId,
  limit = 50,
}) {
  if (
    !organizationId
  ) {
    throw new Error(
      "Product read model requires organizationId"
    );
  }


  if (
    !environmentId
  ) {
    throw new Error(
      "Product read model requires environmentId"
    );
  }


  return Incident
    .find({
      organizationId,

      environmentId,
    })
    .sort({
      createdAt:
        -1,
    })
    .limit(
      Math.min(
        Math.max(
          Number(
            limit
          ) || 50,
          1
        ),
        100
      )
    )
    .lean();
}


function activeIncidents(
  incidents
) {
  return incidents
    .filter(
      (
        incident
      ) =>
        ACTIVE_INCIDENT_STATUSES
          .includes(
            String(
              incident
                ?.status ||
              ""
            )
          )
    );
}


function severityCount(
  incidents,
  severity
) {
  return incidents
    .filter(
      (
        incident
      ) =>
        String(
          incident
            ?.severity ||
          ""
        ) ===
        severity
    )
    .length;
}


function overviewHealth(
  active
) {
  if (
    severityCount(
      active,
      "critical"
    ) >
    0
  ) {
    return "critical";
  }


  if (
    active.length >
    0
  ) {
    return "warning";
  }


  return "healthy";
}


async function getOverview({
  organizationId,
  environmentId,
}) {
  const [
    incidents,
    environmentSummary,
  ] =
    await Promise.all([
      readIncidents({
        organizationId,
        environmentId,
        limit:
          50,
      }),

      EnvironmentService
        .getEnvironmentSummary(
          organizationId
        ),
    ]);


  const active =
    activeIncidents(
      incidents
    );


  const critical =
    severityCount(
      active,
      "critical"
    );


  const warning =
    severityCount(
      active,
      "warning"
    );


  return {
    generatedAt:
      new Date()
        .toISOString(),

    scope: {
      organizationId,
      environmentId,
    },

    health:
      overviewHealth(
        active
      ),

    metrics: [
      {
        id:
          "active-incidents",

        label:
          "Active incidents",

        value:
          String(
            active.length
          ),

        detail:
          `${critical} critical`,

        state:
          critical >
          0
            ? "critical"
            : active.length >
              0
              ? "warning"
              : "healthy",
      },

      {
        id:
          "critical-incidents",

        label:
          "Critical",

        value:
          String(
            critical
          ),

        detail:
          "Current environment",

        state:
          critical >
          0
            ? "critical"
            : "healthy",
      },

      {
        id:
          "warning-incidents",

        label:
          "Warnings",

        value:
          String(
            warning
          ),

        detail:
          "Current environment",

        state:
          warning >
          0
            ? "warning"
            : "healthy",
      },

      {
        id:
          "environments",

        label:
          "Environments",

        value:
          String(
            environmentSummary
              .total
          ),

        detail:
          `${environmentSummary.active} active`,

        state:
          environmentSummary
            .maintenance >
          0
            ? "warning"
            : "healthy",
      },

      {
        id:
          "plan",

        label:
          "Plan",

        value:
          String(
            environmentSummary
              .plan ||
            "unknown"
          ),

        detail:
          environmentSummary
            .limit ===
          null
            ? "Unlimited environments"
            : `${environmentSummary.remaining} slots remaining`,

        state:
          "info",
      },

      {
        id:
          "execution-authority",

        label:
          "Execution",

        value:
          "Not authorized",

        detail:
          "Product view cannot grant authority",

        state:
          "healthy",
      },
    ],

    incidents:
      active
        .slice(
          0,
          8
        )
        .map(
          safeIncident
        ),

    environmentSummary,

    safety: {
      executionAuthorized:
        false,

      personaGrantsAuthorization:
        false,
    },
  };
}


async function getOperations({
  organizationId,
  environmentId,
}) {
  const incidents =
    await readIncidents({
      organizationId,
      environmentId,
      limit:
        100,
    });


  const active =
    activeIncidents(
      incidents
    );


  const critical =
    severityCount(
      active,
      "critical"
    );


  const investigating =
    active.filter(
      (
        incident
      ) =>
        incident
          .status ===
        "investigating"
    ).length;


  const recovering =
    active.filter(
      (
        incident
      ) =>
        incident
          .status ===
        "recovering"
    ).length;


  const serialized =
    active.map(
      safeIncident
    );


  return {
    generatedAt:
      new Date()
        .toISOString(),

    scope: {
      organizationId,
      environmentId,
    },

    metrics: [
      {
        id:
          "active",

        label:
          "Active incidents",

        value:
          String(
            active.length
          ),

        detail:
          "Current environment",

        state:
          active.length >
          0
            ? "warning"
            : "healthy",
      },

      {
        id:
          "critical",

        label:
          "Critical",

        value:
          String(
            critical
          ),

        detail:
          "Requires immediate attention",

        state:
          critical >
          0
            ? "critical"
            : "healthy",
      },

      {
        id:
          "investigating",

        label:
          "Investigating",

        value:
          String(
            investigating
          ),

        detail:
          "Analysis in progress",

        state:
          investigating >
          0
            ? "info"
            : "healthy",
      },

      {
        id:
          "recovering",

        label:
          "Recovering",

        value:
          String(
            recovering
          ),

        detail:
          "Recovery workflow state",

        state:
          recovering >
          0
            ? "warning"
            : "healthy",
      },

      {
        id:
          "evidence",

        label:
          "Evidence",

        value:
          String(
            active.reduce(
              (
                total,
                incident
              ) =>
                total +
                Number(
                  incident
                    ?.evidenceCount ||
                  0
                ),
              0
            )
          ),

        detail:
          "Correlated evidence",

        state:
          "info",
      },

      {
        id:
          "execution",

        label:
          "Execution",

        value:
          "Not authorized",

        detail:
          "Read model only",

        state:
          "healthy",
      },
    ],

    primaryIncident:
      serialized[0] ||
      null,

    incidents:
      serialized,

    safety: {
      executionAuthorized:
        false,

      readModelOnly:
        true,
    },
  };
}


async function getIncidentList({
  organizationId,
  environmentId,
}) {
  const incidents =
    await readIncidents({
      organizationId,
      environmentId,
      limit:
        100,
    });


  return {
    generatedAt:
      new Date()
        .toISOString(),

    scope: {
      organizationId,
      environmentId,
    },

    incidents:
      incidents.map(
        safeIncident
      ),

    count:
      incidents.length,

    executionAuthorized:
      false,
  };
}


module.exports = {
  getOverview,
  getOperations,
  getIncidentList,

  safeIncident,
};