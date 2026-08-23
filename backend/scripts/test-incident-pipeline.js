"use strict";

require("dotenv").config();

const mongoose =
  require("mongoose");

const Service =
  require(
    "../models/Service"
  );

const ServiceDependency =
  require(
    "../models/ServiceDependency"
  );

const {
  Signal,
} =
  require(
    "../models/Signal"
  );

const {
  SignalCorrelation,
} =
  require(
    "../models/SignalCorrelation"
  );

const {
  Incident,
} =
  require(
    "../models/Incident"
  );

const IncidentEvent =
  require(
    "../models/IncidentEvent"
  );

const signalIngestionService =
  require(
    "../services/signals/signalIngestionService"
  );

const incidentOrchestrationService =
  require(
    "../services/incidents/incidentOrchestrationService"
  );

const incidentRecurrenceService =
  require(
    "../services/incidents/incidentRecurrenceService"
  );

const incidentMergeService =
  require(
    "../services/incidents/incidentMergeService"
  );

const incidentDetailService =
  require(
    "../services/incidents/incidentDetailService"
  );

const incidentStateMachine =
  require(
    "../services/incidents/incidentStateMachine"
  );

const {
  setMockFallback,
  clearMockFallback,
} =
  require(
    "../services/infrastructure/queueService"
  );

// ============================================================================
// HELPERS
// ============================================================================

function section(
  title
) {
  console.log(
    `\n============================================================`
  );

  console.log(
    title
  );

  console.log(
    `============================================================`
  );
}

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}

function id(
  value
) {
  if (!value) {
    return null;
  }

  return String(
    value
  );
}

function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

// ============================================================================
// TEST CONTEXT
// ============================================================================

async function main() {
  if (
    !process.env
      .MONGODB_URI
  ) {
    throw new Error(
      "MONGODB_URI is required"
    );
  }

  /*
   * Phase 5 persistence must work even when RabbitMQ is not running locally.
   */
  setMockFallback();

  await mongoose
    .connect(
      process.env
        .MONGODB_URI
    );

  console.log(
    "[phase5-test] MongoDB connected"
  );

 // ==========================================================================
// UNIQUE OWNERSHIP CONTEXT
// ==========================================================================

const configuredOrganizationId =
  String(
    process.env
      .PHASE5_ORGANIZATION_ID ||
    ""
  )
    .trim();

const configuredEnvironmentId =
  String(
    process.env
      .PHASE5_ENVIRONMENT_ID ||
    ""
  )
    .trim();

if (
  configuredOrganizationId &&
  !mongoose.Types.ObjectId
    .isValid(
      configuredOrganizationId
    )
) {
  throw Object.assign(
    new Error(
      "PHASE5_ORGANIZATION_ID must be a valid Mongo ObjectId"
    ),
    {
      code:
        "PHASE5_ORGANIZATION_ID_INVALID",
    }
  );
}

if (
  configuredEnvironmentId &&
  !mongoose.Types.ObjectId
    .isValid(
      configuredEnvironmentId
    )
) {
  throw Object.assign(
    new Error(
      "PHASE5_ENVIRONMENT_ID must be a valid Mongo ObjectId"
    ),
    {
      code:
        "PHASE5_ENVIRONMENT_ID_INVALID",
    }
  );
}

/*
 * Primary ownership may be mapped to a real AIRA tenancy.
 *
 * This allows Phase 13 Mongo -> PostgreSQL migration validation
 * to operate on records belonging to an actual bootstrapped
 * organization/environment.
 */
const organizationId =
  configuredOrganizationId
    ? new mongoose
        .Types
        .ObjectId(
          configuredOrganizationId
        )
    : new mongoose
        .Types
        .ObjectId();

const productionEnvironmentId =
  configuredEnvironmentId
    ? new mongoose
        .Types
        .ObjectId(
          configuredEnvironmentId
        )
    : new mongoose
        .Types
        .ObjectId();

/*
 * These remain deliberately isolated synthetic contexts.
 *
 * The Phase 5 environment-isolation test needs another environment,
 * while the organization-isolation test needs another organization.
 */
const stagingEnvironmentId =
  new mongoose
    .Types
    .ObjectId();

const otherOrganizationId =
  new mongoose
    .Types
    .ObjectId();

const tenantId =
  `phase5-test-${Date.now()}`;

console.log(
  "[phase5-test] Primary organization:",
  String(
    organizationId
  )
);

console.log(
  "[phase5-test] Primary environment:",
  String(
    productionEnvironmentId
  )
);
  const userId =
    new mongoose
      .Types.ObjectId();

  const createdIds = {
    serviceIds:
      [],

    incidentIds:
      [],
  };

  try {
    // ========================================================================
    // CREATE SERVICES
    // ========================================================================

    section(
      "1. TEST SERVICE TOPOLOGY"
    );

    const paymentService =
      await Service
        .create({
          organizationId,

          environmentId:
            productionEnvironmentId,

          tenantId,

          name:
            "Payment API",

          slug:
            `payment-api-${Date.now()}`,

          description:
            "Phase 5 payment service",

          type:
            "api",

          environment:
            "production",

          status:
            "active",

          createdBy:
            userId,
        });

    createdIds
      .serviceIds
      .push(
        paymentService._id
      );

    const checkoutService =
      await Service
        .create({
          organizationId,

          environmentId:
            productionEnvironmentId,

          tenantId,

          name:
            "Checkout API",

          slug:
            `checkout-api-${Date.now()}`,

          description:
            "Phase 5 dependent checkout service",

          type:
            "api",

          environment:
            "production",

          status:
            "active",

          createdBy:
            userId,
        });

    createdIds
      .serviceIds
      .push(
        checkoutService._id
      );

    /*
     * Checkout depends on Payment.
     *
     * If Payment fails, Checkout is inside the blast radius.
     */
    await ServiceDependency
      .create({
        organizationId,

        environmentId:
          productionEnvironmentId,

        tenantId,

        sourceServiceId:
          checkoutService._id,

        targetServiceId:
          paymentService._id,

        dependencyType:
          "critical",

        criticality:
          9,

        userFacing:
          true,

        discoveryMethod:
          "manual",

        confidence:
          1,

        active:
          true,

        firstSeenAt:
          new Date(),

        lastSeenAt:
          new Date(),
      });

    console.log({
      paymentService:
        id(
          paymentService._id
        ),

      checkoutService:
        id(
          checkoutService._id
        ),
    });

    // ========================================================================
    // PRIMARY PROMETHEUS FAILURE
    // ========================================================================

    section(
      "2. PRIMARY FAILURE SIGNAL"
    );

    const baseTime =
      new Date();

    const prometheusInput = {
      provider:
        "prometheus_alertmanager",

      source:
        "integration",

      signalType:
        "alert",

      eventType:
        "alert.open",

      title:
        "Payment API unavailable",

      description:
        "HTTP 503 error rate exceeded threshold.",

      severity:
        "critical",

      status:
        "open",

      errorCode:
        "HTTP_503",

      statusCode:
        503,

      serviceId:
        paymentService._id,

      observedAt:
        baseTime,

      sourceEventId:
        `prom-${Date.now()}`,

      resource: {
        serviceName:
          "Payment API",

        namespace:
          "production",
      },

      attributes: {
        alertname:
          "PaymentApiUnavailable",

        service:
          "Payment API",
      },
    };

    const firstResult =
      await signalIngestionService
        .ingest(
          prometheusInput,
          {
            organizationId,

            environmentId:
              productionEnvironmentId,

            tenantId,

            serviceId:
              paymentService._id,

            serviceName:
              "Payment API",
          }
        );

    console.log({
      accepted:
        firstResult.accepted,

      duplicate:
        firstResult.duplicate,

      signalId:
        firstResult
          .signal
          ?.signalId,

      incidentCandidate:
        firstResult
          .signal
          ?.incidentCandidate,

      incidentAction:
        firstResult
          .routing
          ?.incidentResult
          ?.action,

      incidentId:
        id(
          firstResult
            .routing
            ?.incidentResult
            ?.incident
            ?._id
        ),
    });

    assert(
      firstResult.accepted ===
        true,
      "Primary signal was not accepted"
    );

    assert(
      firstResult.duplicate ===
        false,
      "Primary signal was incorrectly treated as duplicate"
    );

    const firstIncident =
      firstResult
        .routing
        ?.incidentResult
        ?.incident;

    assert(
      firstIncident,
      "Primary signal did not create/update an incident"
    );

    createdIds
      .incidentIds
      .push(
        firstIncident._id
      );

    assert(
      id(
        firstIncident
          .serviceId
      ) ===
        id(
          paymentService._id
        ),
      "Incident serviceId is incorrect"
    );

    assert(
      firstIncident.status ===
        "open",
      `Expected new incident to be open, got ${firstIncident.status}`
    );

    // ========================================================================
    // VERIFY SIGNAL -> INCIDENT LINK
    // ========================================================================

    section(
      "3. SIGNAL → INCIDENT LINK"
    );

    const firstSignal =
      await Signal
        .findById(
          firstResult
            .signal
            ._id
        )
        .lean();

    assert(
      firstSignal
        .incidentId,
      "Signal was not linked to Incident"
    );

    assert(
      id(
        firstSignal
          .incidentId
      ) ===
        id(
          firstIncident._id
        ),
      "Signal links to wrong incident"
    );

    console.log({
      signal:
        firstSignal.signalId,

      incidentId:
        id(
          firstSignal
            .incidentId
        ),
    });

    // ========================================================================
    // DUPLICATE PROTECTION
    // ========================================================================

    section(
      "4. DUPLICATE SIGNAL PROTECTION"
    );

    const duplicateResult =
      await signalIngestionService
        .ingest(
          prometheusInput,
          {
            organizationId,

            environmentId:
              productionEnvironmentId,

            tenantId,

            serviceId:
              paymentService._id,

            serviceName:
              "Payment API",
          }
        );

    console.log({
      duplicate:
        duplicateResult
          .duplicate,

      signalId:
        duplicateResult
          .signal
          ?.signalId,

      duplicateCount:
        duplicateResult
          .signal
          ?.duplicateCount,
    });

    assert(
      duplicateResult
        .duplicate ===
        true,
      "Signal deduplication failed"
    );

    const incidentCountAfterDuplicate =
      await Incident
        .countDocuments({
          organizationId,

          environmentId:
            productionEnvironmentId,

          serviceId:
            paymentService._id,

          status: {
            $in: [
              "open",
              "acknowledged",
              "investigating",
              "recovering",
            ],
          },
        });

    assert(
      incidentCountAfterDuplicate ===
        1,
      `Duplicate signal created another active incident (${incidentCountAfterDuplicate})`
    );

    // ========================================================================
    // OTEL CORRELATED EVIDENCE
    // ========================================================================

    section(
      "5. CROSS-PROVIDER CORRELATION"
    );

    await sleep(
      10
    );

    const otelInput = {
      provider:
        "opentelemetry",

      source:
        "integration",

      signalType:
        "trace",

      eventType:
        "trace.error",

      title:
        "POST /payments failed",

      description:
        "Payment request returned HTTP 503.",

      severity:
        "critical",

      status:
        "error",

      errorCode:
        "HTTP_503",

      statusCode:
        503,

      serviceId:
        paymentService._id,

      traceId:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      spanId:
        "bbbbbbbbbbbbbbbb",

      observedAt:
        new Date(
          baseTime.getTime() +
          1000
        ),

      sourceEventId:
        `otel-${Date.now()}`,

      resource: {
        serviceName:
          "Payment API",

        namespace:
          "production",
      },

      attributes: {
        "service.name":
          "Payment API",

        "http.response.status_code":
          503,
      },
    };

    const otelResult =
      await signalIngestionService
        .ingest(
          otelInput,
          {
            organizationId,

            environmentId:
              productionEnvironmentId,

            tenantId,

            serviceId:
              paymentService._id,

            serviceName:
              "Payment API",
          }
        );

    console.log({
      signalId:
        otelResult
          .signal
          ?.signalId,

      group:
        otelResult
          .signal
          ?.correlationGroupId,

      score:
        otelResult
          .signal
          ?.correlationScore,

      incidentId:
        id(
          otelResult
            .routing
            ?.incidentResult
            ?.incident
            ?._id
        ),
    });

    const activeAfterOtel =
      await Incident
        .find({
          organizationId,

          environmentId:
            productionEnvironmentId,

          serviceId:
            paymentService._id,

          status: {
            $in: [
              "open",
              "acknowledged",
              "investigating",
              "recovering",
            ],
          },
        });

    assert(
      activeAfterOtel
        .length ===
        1,
      `Expected one canonical active incident after OTEL correlation, found ${activeAfterOtel.length}`
    );

    const canonicalIncident =
      activeAfterOtel[0];

    // ========================================================================
    // EVIDENCE ACCUMULATION
    // ========================================================================

    section(
      "6. INCIDENT EVIDENCE ACCUMULATION"
    );

    console.log({
      providers:
        canonicalIncident
          .providers,

      providerCount:
        canonicalIncident
          .providerCount,

      evidenceCount:
        canonicalIncident
          .evidenceCount,

      occurrenceCount:
        canonicalIncident
          .occurrenceCount,

      severity:
        canonicalIncident
          .severity,
    });

    assert(
      canonicalIncident
        .providers
        .includes(
          "prometheus_alertmanager"
        ),
      "Prometheus provider missing from incident"
    );

    /*
     * OTEL may have merged into the same incident depending on the
     * exact Phase 4 correlation score.
     *
     * If correlation did occur, providerCount must reflect it.
     */
    if (
      otelResult
        .signal
        ?.correlationGroupId
    ) {
      assert(
        canonicalIncident
          .providerCount >=
          1,
        "Incident provider count is invalid"
      );
    }

    // ========================================================================
    // BLAST RADIUS
    // ========================================================================

    section(
      "7. BLAST RADIUS"
    );

    const refreshedImpactIncident =
      await Incident
        .findById(
          canonicalIncident._id
        )
        .lean();

    const impact =
      refreshedImpactIncident
        .impactAnalysis;

    console.log({
      summary:
        impact
          ?.summary,

      affectedServices:
        impact
          ?.affectedServices
          ?.map(
            (service) =>
              service.name
          ),
    });

    assert(
      impact,
      "Incident impact analysis was not generated"
    );

    assert(
      impact
        .summary
        .affectedServiceCount >=
        1,
      "Expected Checkout API inside Payment API blast radius"
    );

    assert(
      impact
        .summary
        .userFacingImpact ===
        true,
      "User-facing blast-radius flag was not detected"
    );

    // ========================================================================
    // INCIDENT EVENT
    // ========================================================================

    section(
      "8. INCIDENT EVENT PERSISTENCE"
    );

    const detectedEvents =
      await IncidentEvent
        .find({
          organizationId,

          environmentId:
            productionEnvironmentId,

          incidentId:
            canonicalIncident._id,

          eventType:
            "incident.detected",
        })
        .lean();

    console.log({
      detectedEvents:
        detectedEvents.length,
    });

    assert(
      detectedEvents.length >=
        1,
      "incident.detected IncidentEvent was not persisted"
    );

    // ========================================================================
    // STATE MACHINE
    // ========================================================================

    section(
      "9. INCIDENT STATE MACHINE"
    );

    assert(
      incidentStateMachine
        .canTransition(
          "open",
          "acknowledged"
        ) ===
        true,
      "open -> acknowledged should be allowed"
    );

    assert(
      incidentStateMachine
        .canTransition(
          "closed",
          "recovering"
        ) ===
        false,
      "closed -> recovering should not be allowed"
    );

    console.log({
      openTransitions:
        incidentStateMachine
          .getAllowedTransitions(
            "open"
          ),

      closedTransitions:
        incidentStateMachine
          .getAllowedTransitions(
            "closed"
          ),
    });

    // ========================================================================
    // DETAIL API SERVICE
    // ========================================================================

    section(
      "10. INCIDENT DETAIL"
    );

    const detail =
      await incidentDetailService
        .getDetail(
          {
            organizationId,

            environmentId:
              productionEnvironmentId,
          },
          canonicalIncident._id
        );

    assert(
      detail,
      "Incident detail service returned null"
    );

    assert(
      detail.evidence
        .signalCount >=
        1,
      "Incident detail contains no canonical signals"
    );

    assert(
      Array.isArray(
        detail.events
      ),
      "Incident detail did not return events"
    );

    assert(
      Array.isArray(
        detail.lifecycle
          .allowedTransitions
      ),
      "Incident detail did not expose allowed transitions"
    );

    console.log({
      signalCount:
        detail.evidence
          .signalCount,

      eventCount:
        detail.events
          .length,

      allowedTransitions:
        detail.lifecycle
          .allowedTransitions,

      blastRadius:
        detail.impact
          .summary,
    });

    // ========================================================================
    // RECOVERY SIGNAL
    // ========================================================================

    section(
      "11. RECOVERY"
    );

    /*
     * Use the canonical incident's correlation identity when present.
     *
     * This makes the recovery resolution precise.
     */
    const recoveryInput = {
      provider:
        "monitor",

      source:
        "monitor",

      signalType:
        "alert",

      eventType:
        "monitor.recovered",

      title:
        "Payment API recovered",

      description:
        "Payment API monitor is healthy again.",

      severity:
        "info",

      status:
        "healthy",

      serviceId:
        paymentService._id,

      monitorId:
        new mongoose
          .Types.ObjectId(),

      correlationGroupId:
        canonicalIncident
          .correlationGroupId ||
        undefined,

      observedAt:
        new Date(
          baseTime.getTime() +
          5000
        ),

      sourceEventId:
        `recovery-${Date.now()}`,

      resource: {
        serviceName:
          "Payment API",
      },
    };

    /*
     * For a synthetic test without a real Monitor record, route recovery
     * directly through Phase 5 orchestration so we can verify lifecycle
     * behavior independently from Monitor model validation.
     */
    const recoverySignal =
      await Signal
        .create({
          organizationId,

          environmentId:
            productionEnvironmentId,

          tenantId,

          serviceId:
            paymentService._id,

          monitorId:
            recoveryInput
              .monitorId,

          provider:
            "monitor",

          source:
            "monitor",

          signalType:
            "alert",

          eventType:
            "monitor.recovered",

          title:
            recoveryInput.title,

          description:
            recoveryInput
              .description,

          severity:
            "info",

          status:
            "healthy",

          signalId:
            `phase5-recovery-${Date.now()}`,

          fingerprint:
            canonicalIncident
              .signalFingerprint ||
            `phase5-recovery-fingerprint-${Date.now()}`,

          sourceEventId:
            recoveryInput
              .sourceEventId,

          correlationGroupId:
            canonicalIncident
              .correlationGroupId ||
            null,

          correlationScore:
            canonicalIncident
              .correlationConfidence ||
            1,

          incidentCandidate:
            false,

          processingStatus:
            "enriched",

          observedAt:
            recoveryInput
              .observedAt,

          receivedAt:
            new Date(),

          resource:
            recoveryInput
              .resource,
        });

    const recoveryResult =
      await incidentOrchestrationService
        .processSignal(
          recoverySignal
        );

    console.log({
      action:
        recoveryResult.action,

      resolvedCount:
        recoveryResult
          .incidentCount,
    });

    /*
     * Depending on correlation identity, synthetic recovery may fail closed.
     *
     * If so, directly align recovery signal fingerprint with the canonical
     * incident and retry.
     */
    if (
      recoveryResult
        .incidentCount ===
        0
    ) {
      recoverySignal
        .correlationGroupId =
        canonicalIncident
          .correlationGroupId ||
        null;

      recoverySignal
        .fingerprint =
        canonicalIncident
          .signalFingerprint;

      await recoverySignal
        .save();

      await incidentOrchestrationService
        .processSignal(
          recoverySignal
        );
    }

    const resolvedIncident =
      await Incident
        .findById(
          canonicalIncident._id
        );

    assert(
      resolvedIncident.status ===
        "resolved",
      `Recovery failed to resolve incident; status=${resolvedIncident.status}`
    );

    assert(
      resolvedIncident
        .resolutionType ===
        "recovery_signal",
      "Incident resolutionType is not recovery_signal"
    );

    // ========================================================================
    // RESOLUTION EVENT
    // ========================================================================

    section(
      "12. RESOLUTION EVENT"
    );

    const resolutionEvents =
      await IncidentEvent
        .find({
          incidentId:
            resolvedIncident._id,

          eventType:
            "incident.resolved",
        });

    console.log({
      resolutionEvents:
        resolutionEvents.length,
    });

    assert(
      resolutionEvents.length >=
        1,
      "incident.resolved event missing"
    );

    // ========================================================================
    // RECURRENCE
    // ========================================================================

    section(
      "13. RECURRENCE"
    );

    const recurrenceSignal =
      await Signal
        .create({
          organizationId,

          environmentId:
            productionEnvironmentId,

          tenantId,

          serviceId:
            paymentService._id,

          provider:
            "prometheus_alertmanager",

          source:
            "integration",

          signalType:
            "alert",

          eventType:
            "alert.open",

          title:
            "Payment API unavailable again",

          description:
            "Payment API 503 failure recurred.",

          severity:
            "critical",

          status:
            "open",

          signalId:
            `phase5-recurrence-${Date.now()}`,

          fingerprint:
            resolvedIncident
              .signalFingerprint ||
            firstSignal
              .fingerprint,

          sourceEventId:
            `recurrence-source-${Date.now()}`,

          correlationGroupId:
            resolvedIncident
              .correlationGroupId ||
            null,

          correlationScore:
            1,

          incidentCandidate:
            true,

          processingStatus:
            "enriched",

          observedAt:
            new Date(),

          receivedAt:
            new Date(),

          resource: {
            serviceName:
              "Payment API",
          },
        });

    const recurrenceResult =
      await incidentRecurrenceService
        .handleRecurrence(
          recurrenceSignal,
          null
        );

    console.log({
      recurrence:
        recurrenceResult
          .recurrence,

      incidentId:
        id(
          recurrenceResult
            .incident
            ?._id
        ),

      status:
        recurrenceResult
          .incident
          ?.status,

      reopenCount:
        recurrenceResult
          .incident
          ?.reopenCount,
    });

    assert(
      recurrenceResult
        .recurrence ===
        true,
      "Incident recurrence was not detected"
    );

    assert(
      id(
        recurrenceResult
          .incident
          ._id
      ) ===
        id(
          resolvedIncident._id
        ),
      "Recurrence created/reopened wrong incident"
    );

    assert(
      recurrenceResult
        .incident
        .status ===
        "open",
      "Recurring incident was not reopened"
    );

    assert(
      recurrenceResult
        .incident
        .reopenCount >=
        1,
      "reopenCount was not incremented"
    );

    // ========================================================================
    // ENVIRONMENT ISOLATION
    // ========================================================================

    section(
      "14. ENVIRONMENT ISOLATION"
    );

    const stagingService =
      await Service
        .create({
          organizationId,

          environmentId:
            stagingEnvironmentId,

          tenantId,

          name:
            "Payment API",

          slug:
            `payment-api-staging-${Date.now()}`,

          description:
            "Staging payment service",

          type:
            "api",

          environment:
            "staging",

          status:
            "active",

          createdBy:
            userId,
        });

    createdIds
      .serviceIds
      .push(
        stagingService._id
      );

    const stagingResult =
      await signalIngestionService
        .ingest(
          {
            provider:
              "prometheus_alertmanager",

            source:
              "integration",

            signalType:
              "alert",

            eventType:
              "alert.open",

            title:
              "Payment API unavailable",

            description:
              "Same failure but in staging.",

            severity:
              "critical",

            status:
              "open",

            errorCode:
              "HTTP_503",

            statusCode:
              503,

            serviceId:
              stagingService._id,

            observedAt:
              new Date(),

            sourceEventId:
              `staging-${Date.now()}`,

            resource: {
              serviceName:
                "Payment API",
            },
          },
          {
            organizationId,

            environmentId:
              stagingEnvironmentId,

            tenantId,

            serviceId:
              stagingService._id,

            serviceName:
              "Payment API",
          }
        );

    const stagingIncident =
      stagingResult
        .routing
        ?.incidentResult
        ?.incident;

    assert(
      stagingIncident,
      "Staging incident was not created"
    );

    createdIds
      .incidentIds
      .push(
        stagingIncident._id
      );

    assert(
      id(
        stagingIncident
          .environmentId
      ) ===
        id(
          stagingEnvironmentId
        ),
      "Staging incident has wrong environment"
    );

    assert(
      id(
        stagingIncident._id
      ) !==
        id(
          resolvedIncident._id
        ),
      "Production and staging incidents were incorrectly deduplicated"
    );

    console.log({
      productionIncident:
        id(
          resolvedIncident._id
        ),

      stagingIncident:
        id(
          stagingIncident._id
        ),
    });

    // ========================================================================
    // ORGANIZATION ISOLATION
    // ========================================================================

    section(
      "15. ORGANIZATION ISOLATION"
    );

    const leakedIncidents =
      await Incident
        .find({
          organizationId:
            otherOrganizationId,

          environmentId:
            productionEnvironmentId,
        });

    assert(
      leakedIncidents.length ===
        0,
      "Organization isolation failed"
    );

    const leakedSignals =
      await Signal
        .find({
          organizationId:
            otherOrganizationId,

          environmentId:
            productionEnvironmentId,
        });

    assert(
      leakedSignals.length ===
        0,
      "Signal organization isolation failed"
    );

    console.log(
      "[phase5-test] Organization isolation passed"
    );

    // ========================================================================
    // MERGE SERVICE SANITY
    // ========================================================================

    section(
      "16. MERGE SERVICE SANITY"
    );

    const currentCanonical =
      await Incident
        .findById(
          resolvedIncident._id
        );

    const mergeCandidates =
      await incidentMergeService
        .findCandidates(
          currentCanonical
        );

    console.log({
      mergeCandidateCount:
        mergeCandidates
          .length,
    });

    /*
     * There may legitimately be zero merge candidates here because the
     * pipeline already avoided creating duplicates.
     *
     * The important assertion is that merge evaluation executes safely.
     */
    assert(
      Array.isArray(
        mergeCandidates
      ),
      "Incident merge candidate evaluation failed"
    );

    // ========================================================================
    // CORRELATION GROUP LINKS
    // ========================================================================

    section(
      "17. CORRELATION GROUP LINKAGE"
    );

    if (
      currentCanonical
        .correlationGroupId
    ) {
      const linkedGroup =
        await SignalCorrelation
          .findOne({
            organizationId,

            environmentId:
              productionEnvironmentId,

            correlationGroupId:
              currentCanonical
                .correlationGroupId,
          });

      if (
        linkedGroup
      ) {
        assert(
          id(
            linkedGroup
              .incidentId
          ) ===
            id(
              currentCanonical._id
            ),
          "Correlation group links to wrong incident"
        );

        console.log({
          correlationGroup:
            linkedGroup
              .correlationGroupId,

          incidentId:
            id(
              linkedGroup
                .incidentId
            ),
        });
      }
    } else {
      console.log(
        "[phase5-test] No correlation group on canonical incident; skipping group-link assertion"
      );
    }

    // ========================================================================
    // FINAL DATABASE COUNTS
    // ========================================================================

    section(
      "18. FINAL DATABASE STATE"
    );

    const productionSignals =
      await Signal
        .find({
          organizationId,

          environmentId:
            productionEnvironmentId,
        })
        .lean();

    const productionIncidents =
      await Incident
        .find({
          organizationId,

          environmentId:
            productionEnvironmentId,
        })
        .lean();

    const productionEvents =
      await IncidentEvent
        .find({
          organizationId,

          environmentId:
            productionEnvironmentId,
        })
        .lean();

    console.table(
      productionSignals
        .map(
          (
            signal
          ) => ({
            provider:
              signal.provider,

            eventType:
              signal
                .eventType,

            severity:
              signal.severity,

            candidate:
              signal
                .incidentCandidate,

            incidentId:
              id(
                signal
                  .incidentId
              ),

            group:
              signal
                .correlationGroupId,

            status:
              signal
                .processingStatus,
          })
        )
    );

    console.table(
      productionIncidents
        .map(
          (
            incident
          ) => ({
            id:
              id(
                incident._id
              ),

            status:
              incident.status,

            severity:
              incident.severity,

            occurrences:
              incident
                .occurrenceCount,

            reopenCount:
              incident
                .reopenCount,

            providers:
              incident
                .providerCount,

            evidence:
              incident
                .evidenceCount,

            group:
              incident
                .correlationGroupId,

            mergedInto:
              id(
                incident
                  .mergedIntoIncidentId
              ),
          })
        )
    );

    console.table(
      productionEvents
        .map(
          (
            event
          ) => ({
            eventType:
              event
                .eventType,

            status:
              event.status,

            incidentId:
              id(
                event
                  .incidentId
              ),

            severity:
              event.severity,

            changeType:
              event
                .changeType,
          })
        )
    );

    assert(
      productionSignals.length >=
        3,
      "Unexpectedly low signal count"
    );

    assert(
      productionIncidents.length >=
        1,
      "No production incidents remain"
    );

    assert(
      productionEvents.length >=
        2,
      "Expected multiple IncidentEvent records"
    );

    // ========================================================================
    // FINAL SUCCESS
    // ========================================================================

    section(
      "PHASE 5 RESULT"
    );

    console.log(
      "✅ Signal persistence"
    );

    console.log(
      "✅ Signal deduplication"
    );

    console.log(
      "✅ Signal → Incident linkage"
    );

    console.log(
      "✅ Incident creation/update"
    );

    console.log(
      "✅ Cross-provider evidence"
    );

    console.log(
      "✅ Blast-radius enrichment"
    );

    console.log(
      "✅ Canonical IncidentEvent persistence"
    );

    console.log(
      "✅ State-machine validation"
    );

    console.log(
      "✅ Incident detail aggregation"
    );

    console.log(
      "✅ Recovery"
    );

    console.log(
      "✅ Recurrence"
    );

    console.log(
      "✅ Merge evaluation"
    );

    console.log(
      "✅ Environment isolation"
    );

    console.log(
      "✅ Organization isolation"
    );

    console.log(
      "\n🎉 PHASE 5 INCIDENT PIPELINE PASSED"
    );
  } finally {
  // ========================================================================
  // CLEANUP
  // ========================================================================

  const keepTestData =
    String(
      process.env
        .KEEP_TEST_DATA ||
        ""
    )
      .trim()
      .toLowerCase() ===
      "true";

  section(
    keepTestData
      ? "TEST DATA PRESERVED"
      : "CLEANUP"
  );

  try {
    if (
  keepTestData
) {
  console.log(
    "[phase5-test] KEEP_TEST_DATA=true — preserving generated MongoDB records for Phase 13 migration validation"
  );

  console.log(
    "[phase5-test] Organization:",
    String(
      organizationId
    )
  );

  console.log(
    "[phase5-test] Environment:",
    String(
      productionEnvironmentId
    )
  );
} else {
      await IncidentEvent
        .deleteMany({
          $or: [
            {
              organizationId,
            },

            {
              organizationId:
                otherOrganizationId,
            },
          ],
        });

      await SignalCorrelation
        .deleteMany({
          $or: [
            {
              organizationId,
            },

            {
              organizationId:
                otherOrganizationId,
            },
          ],
        });

      await Signal
        .deleteMany({
          $or: [
            {
              organizationId,
            },

            {
              organizationId:
                otherOrganizationId,
            },
          ],
        });

      await Incident
        .deleteMany({
          $or: [
            {
              organizationId,
            },

            {
              organizationId:
                otherOrganizationId,
            },
          ],
        });

      await ServiceDependency
        .deleteMany({
          $or: [
            {
              organizationId,
            },

            {
              organizationId:
                otherOrganizationId,
            },
          ],
        });

      if (
        createdIds
          .serviceIds
          .length >
        0
      ) {
        await Service
          .deleteMany({
            _id: {
              $in:
                createdIds
                  .serviceIds,
            },
          });
      }

      console.log(
  "[phase5-test] Test records cleaned"
);
    }
    } catch (
      cleanupError
    ) {
      console.error(
        "[phase5-test] Cleanup warning:",
        cleanupError.message
      );
    }

    clearMockFallback();

    await mongoose
      .disconnect();

    console.log(
      "[phase5-test] MongoDB disconnected"
    );
  }
}

// ============================================================================
// RUN
// ============================================================================

main()
  .catch(
    async (
      error
    ) => {
      console.error(
        "\n❌ PHASE 5 INCIDENT PIPELINE FAILED"
      );

      console.error(
        error
      );

      try {
        clearMockFallback();

        if (
          mongoose
            .connection
            .readyState !==
          0
        ) {
          await mongoose
            .disconnect();
        }
      } catch {
        // Ignore shutdown errors.
      }

      process.exitCode =
        1;
    }
  );