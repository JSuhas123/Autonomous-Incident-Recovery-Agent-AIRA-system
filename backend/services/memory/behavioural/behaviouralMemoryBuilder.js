"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  MEMORY_TYPES,
} =
  require(
    "../../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
} =
  require(
    "../../../constants/memoryScopes"
  );


const BASELINE_HEALTH_STATES =
  Object.freeze({
    HEALTHY:
      "HEALTHY",

    DEGRADED:
      "DEGRADED",

    INCIDENT:
      "INCIDENT",

    UNKNOWN:
      "UNKNOWN",
  });


class BehaviouralMemoryBuilder {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeMetricName(
    value
  ) {
    const normalized =
      String(
        value ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      !normalized
    ) {
      throw this.createError(
        "Behavioural memory metric name is required",
        "BEHAVIOURAL_MEMORY_METRIC_REQUIRED"
      );
    }


    return normalized;
  }


  normalizeObservation(
    observation
  ) {
    const value =
      Number(
        observation
          ?.value
      );


    return {
      observationId:
        observation
          ?.observationId ||
        null,

      value,

      validValue:
        Number.isFinite(
          value
        ),

      healthState:
        String(
          observation
            ?.healthState ||
          BASELINE_HEALTH_STATES
            .UNKNOWN
        )
          .trim()
          .toUpperCase(),

      incidentActive:
        observation
          ?.incidentActive ===
        true,

      degraded:
        observation
          ?.degraded ===
        true,

      baselineEligible:
        observation
          ?.baselineEligible !==
        false,

      qualityScore:
        Math.max(
          0,

          Math.min(
            1,

            Number(
              observation
                ?.qualityScore ??
              1
            )
          )
        ),

      observedAt:
        observation
          ?.observedAt ||
        null,

      sourceId:
        observation
          ?.sourceId ||
        observation
          ?.observationId ||
        null,
    };
  }


  isEligibleObservation(
    observation,
    minimumQuality =
      0.8
  ) {
    const normalized =
      this
        .normalizeObservation(
          observation
        );


    return (
      normalized.validValue ===
        true &&

      normalized.baselineEligible ===
        true &&

      normalized.healthState ===
        BASELINE_HEALTH_STATES
          .HEALTHY &&

      normalized.incidentActive ===
        false &&

      normalized.degraded ===
        false &&

      normalized.qualityScore >=
        minimumQuality
    );
  }


  percentile(
    sorted,
    percentile
  ) {
    if (
      sorted.length ===
        0
    ) {
      return null;
    }


    const position =
      (
        sorted.length -
        1
      ) *
      percentile;


    const lower =
      Math.floor(
        position
      );


    const upper =
      Math.ceil(
        position
      );


    if (
      lower ===
        upper
    ) {
      return sorted[
        lower
      ];
    }


    const weight =
      position -
      lower;


    return (
      sorted[
        lower
      ] *
      (
        1 -
        weight
      )
    ) +
    (
      sorted[
        upper
      ] *
      weight
    );
  }


  calculateStatistics(
    observations,
    minimumQuality =
      0.8
  ) {
    const normalized =
      observations.map(
        (
          observation
        ) =>
          this
            .normalizeObservation(
              observation
            )
      );


    const eligible =
      normalized.filter(
        (
          observation
        ) =>
          this
            .isEligibleObservation(
              observation,
              minimumQuality
            )
      );


    const rejected =
      normalized.filter(
        (
          observation
        ) =>
          !this
            .isEligibleObservation(
              observation,
              minimumQuality
            )
      );


    const values =
      eligible
        .map(
          (
            observation
          ) =>
            observation.value
        )
        .sort(
          (
            a,
            b
          ) =>
            a -
            b
        );


    if (
      values.length ===
        0
    ) {
      return {
        total:
          normalized.length,

        eligible:
          0,

        rejected:
          rejected.length,

        values:
          [],

        observations:
          normalized,
      };
    }


    const sum =
      values.reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      );


    const mean =
      sum /
      values.length;


    const variance =
      values.reduce(
        (
          total,
          value
        ) =>
          total +
          Math.pow(
            value -
            mean,
            2
          ),
        0
      ) /
      values.length;


    const standardDeviation =
      Math.sqrt(
        variance
      );


    return {
      total:
        normalized.length,

      eligible:
        eligible.length,

      rejected:
        rejected.length,

      minimum:
        values[0],

      maximum:
        values[
          values.length -
          1
        ],

      mean,

      median:
        this
          .percentile(
            values,
            0.5
          ),

      p90:
        this
          .percentile(
            values,
            0.9
          ),

      p95:
        this
          .percentile(
            values,
            0.95
          ),

      p99:
        this
          .percentile(
            values,
            0.99
          ),

      standardDeviation,

      values,

      observations:
        normalized,

      eligibleObservations:
        eligible,

      rejectedObservations:
        rejected,
    };
  }


  determineScope({
    organizationId,

    environmentId,

    serviceId,

    resourceId,
  }) {
    if (
      resourceId
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Resource behavioural memory requires environment",
          "BEHAVIOURAL_MEMORY_ENVIRONMENT_REQUIRED"
        );
      }


      return {
        organizationId,

        environmentId,

        serviceId:
          serviceId ||
          null,

        resourceId,

        scopeType:
          MEMORY_SCOPES
            .RESOURCE,
      };
    }


    if (
      serviceId
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Service behavioural memory requires environment",
          "BEHAVIOURAL_MEMORY_ENVIRONMENT_REQUIRED"
        );
      }


      return {
        organizationId,

        environmentId,

        serviceId,

        resourceId:
          null,

        scopeType:
          MEMORY_SCOPES
            .SERVICE,
      };
    }


    if (
      environmentId
    ) {
      return {
        organizationId,

        environmentId,

        serviceId:
          null,

        resourceId:
          null,

        scopeType:
          MEMORY_SCOPES
            .ENVIRONMENT,
      };
    }


    return {
      organizationId,

      environmentId:
        null,

      serviceId:
        null,

      resourceId:
        null,

      scopeType:
        MEMORY_SCOPES
          .TENANT,
    };
  }


  buildPublicId({
    organizationId,

    environmentId,

    serviceId,

    resourceId,

    metricName,
  }) {
    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            organizationId,

            environmentId ||
              "",

            serviceId ||
              "",

            resourceId ||
              "",

            metricName,
          ]
            .join(
              "|"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        );


    return (
      "mem_behaviour_" +
      hash
    );
  }


  build({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    metricName,

    metricUnit =
      null,

    observations,

    minimumSamples =
      10,

    minimumQuality =
      0.8,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization required for behavioural memory",
        "BEHAVIOURAL_MEMORY_ORGANIZATION_REQUIRED"
      );
    }


    if (
      !Array.isArray(
        observations
      )
    ) {
      throw this.createError(
        "Behavioural observations must be an array",
        "BEHAVIOURAL_MEMORY_OBSERVATIONS_REQUIRED"
      );
    }


    const normalizedMetric =
      this
        .normalizeMetricName(
          metricName
        );


    const statistics =
      this
        .calculateStatistics(
          observations,
          minimumQuality
        );


    if (
      statistics.eligible <
      minimumSamples
    ) {
      return {
        eligible:
          false,

        reason:
          "INSUFFICIENT_HEALTHY_OBSERVATIONS",

        statistics,
      };
    }


    const scope =
      this
        .determineScope({
          organizationId,

          environmentId,

          serviceId,

          resourceId,
        });


    const sampleFactor =
      Math.min(
        statistics.eligible /
        100,
        1
      );


    const rejectionRatio =
      statistics.total >
        0
        ? statistics.rejected /
          statistics.total
        : 0;


    const confidence =
      Math.max(
        0,

        Math.min(
          0.98,

          0.65 +
          (
            sampleFactor *
            0.25
          ) -
          (
            rejectionRatio *
            0.15
          )
        )
      );


    const trustScore =
      Math.max(
        0,

        Math.min(
          0.98,

          0.7 +
          (
            sampleFactor *
            0.2
          ) -
          (
            rejectionRatio *
            0.1
          )
        )
      );


    const sources =
      statistics
        .eligibleObservations
        .filter(
          (
            observation
          ) =>
            observation.sourceId
        )
        .map(
          (
            observation
          ) => ({
            sourceType:
              "TELEMETRY_OBSERVATION",

            sourceId:
              observation.sourceId,

            evidenceRole:
              "SUPPORTING",

            observedAt:
              observation.observedAt,
          })
        );


    return {
      eligible:
        true,

      statistics,

      sources,

      memory: {
        publicId:
          this
            .buildPublicId({
              organizationId,

              environmentId,

              serviceId,

              resourceId,

              metricName:
                normalizedMetric,
            }),

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        serviceId:
          scope.serviceId,

        resourceId:
          scope.resourceId,

        incidentId:
          null,

        memoryType:
          MEMORY_TYPES
            .BEHAVIOURAL,

        scopeType:
          scope.scopeType,

        title:
          `Behavioural baseline: ${normalizedMetric}`,

        summary:
          (
            `${normalizedMetric} normally averages ` +
            `${statistics.mean.toFixed(2)}` +
            (
              metricUnit
                ? ` ${metricUnit}`
                : ""
            ) +
            ` with a p95 of ${statistics.p95.toFixed(2)}` +
            (
              metricUnit
                ? ` ${metricUnit}`
                : ""
            ) +
            ` across ${statistics.eligible} trusted healthy observations.`
          ),

        content: {
          baseline: {
            metric:
              normalizedMetric,

            unit:
              metricUnit,

            sampleCount:
              statistics.eligible,

            minimum:
              statistics.minimum,

            maximum:
              statistics.maximum,

            mean:
              statistics.mean,

            median:
              statistics.median,

            p90:
              statistics.p90,

            p95:
              statistics.p95,

            p99:
              statistics.p99,

            standardDeviation:
              statistics.standardDeviation,
          },

          evidenceQuality: {
            totalObserved:
              statistics.total,

            baselineEligible:
              statistics.eligible,

            rejected:
              statistics.rejected,

            minimumSamples,

            minimumQuality,
          },

          applicability: {
            organizationId,

            environmentId,

            serviceId,

            resourceId,
          },

          learningPolicy: {
            healthyOnly:
              true,

            incidentObservationsExcluded:
              true,

            degradedObservationsExcluded:
              true,

            lowQualityObservationsExcluded:
              true,

            executionAuthorized:
              false,

            suppressAlerts:
              false,
          },
        },

        confidence,

        trustScore,

        importance:
          0.8,

        status:
          "ACTIVE",

        sourceType:
          "BEHAVIOURAL_BASELINE_SYNTHESIS",

        sourceCount:
          0,

        evidenceCount:
          sources.length,

        observationCount:
          statistics.eligible,

        observedAt:
          new Date(),

        validFrom:
          null,

        validUntil:
          null,

        supersedesMemoryId:
          null,

        legacySourceType:
          null,

        legacySourceId:
          null,

        metadata: {
          phase:
            "16.13",

          generator:
            "behaviouralMemoryBuilder",

          authoritativeStore:
            "postgresql",

          retrievalStore:
            "qdrant",

          executionAuthorized:
            false,

          suppressAlerts:
            false,

          healthyOnlyLearning:
            true,

          minimumSamples,

          minimumQuality,
        },

        schemaVersion:
          1,
      },
    };
  }
}


const behaviouralMemoryBuilder =
  new BehaviouralMemoryBuilder();


module.exports = {
  BASELINE_HEALTH_STATES,

  BehaviouralMemoryBuilder,

  behaviouralMemoryBuilder,
};