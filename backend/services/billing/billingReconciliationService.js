"use strict";

const PostgresBillingReconciliationRepository =
  require(
    "../../persistence/postgres/PostgresBillingReconciliationRepository"
  );

const {
  createPaymentProvider,
} =
  require(
    "./paymentProviders/paymentProviderFactory"
  );

const {
  succeedPaymentAttempt,

  failPaymentAttempt,
} =
  require(
    "./paymentService"
  );

const {
  paymentWebhookProcessor,
} =
  require(
    "./paymentWebhooks/paymentWebhookProcessor"
  );

const {
  RECONCILIATION_RUN_TYPES,

  RECONCILIATION_RUN_STATUS,

  RECONCILIATION_CLASSIFICATION,

  RECONCILIATION_REPAIR_STATUS,

  RECONCILIATION_SEVERITY,

  STALE_PAYMENT_PROCESSING_MS,
} =
  require(
    "../../constants/billingReconciliation"
  );


class BillingReconciliationService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresBillingReconciliationRepository(
        options
      );

    this.providerFactory =
      options.providerFactory ||
      createPaymentProvider;
  }


  async reconcilePayments({
    provider =
      null,

    limit =
      100,
  } = {}) {
    const run =
      await this.repository
        .createRun({
          runType:
            RECONCILIATION_RUN_TYPES
              .PAYMENT,

          provider,

          metadata: {
            source:
              "phase15_19",
          },
        });


    const counters = {
      scanned:
        0,

      matched:
        0,

      repaired:
        0,

      suspicious:
        0,

      failed:
        0,
    };


    try {
      const staleBefore =
        new Date(
          Date.now() -
          STALE_PAYMENT_PROCESSING_MS
        );


      const payments =
        await this.repository
          .listStaleProcessingPayments({
            staleBefore,

            provider,

            limit,
          });


      for (
        const payment
        of payments
      ) {
        counters.scanned++;


        try {
          if (
            !payment.provider ||
            !payment
              .provider_session_id ||
            !payment
              .attempt_code
          ) {
            counters.suspicious++;


            await this.repository
              .createFinding({
                runId:
                  run.id,

                organizationId:
                  payment
                    .organization_id,

                provider:
                  payment.provider,

                entityType:
                  "PAYMENT",

                entityId:
                  payment
                    .payment_code,

                providerEntityId:
                  payment
                    .provider_session_id,

                severity:
                  RECONCILIATION_SEVERITY
                    .CRITICAL,

                classification:
                  RECONCILIATION_CLASSIFICATION
                    .SUSPICIOUS_DRIFT,

                canonicalState: {
                  status:
                    payment.status,
                },

                providerState: {},

                repairAction:
                  "MANUAL_REVIEW",

                repairStatus:
                  RECONCILIATION_REPAIR_STATUS
                    .MANUAL_REVIEW,
              });


            continue;
          }


          const adapter =
            this
              .providerFactory(
                payment.provider
              );


          const providerState =
            await adapter
              .retrievePaymentState(
                payment
                  .provider_session_id
              );


          const canonicalStatus =
            payment.status;


          if (
            providerState
              .canonicalStatus ===
            canonicalStatus
          ) {
            counters.matched++;


            await this.repository
              .createFinding({
                runId:
                  run.id,

                organizationId:
                  payment
                    .organization_id,

                provider:
                  payment.provider,

                entityType:
                  "PAYMENT",

                entityId:
                  payment
                    .payment_code,

                providerEntityId:
                  payment
                    .provider_session_id,

                severity:
                  RECONCILIATION_SEVERITY
                    .INFO,

                classification:
                  RECONCILIATION_CLASSIFICATION
                    .MATCH,

                canonicalState: {
                  status:
                    canonicalStatus,
                },

                providerState,

                repairStatus:
                  RECONCILIATION_REPAIR_STATUS
                    .NOT_REQUIRED,
              });


            continue;
          }


          if (
            providerState
              .canonicalStatus ===
            "SUCCEEDED"
          ) {
            const finding =
              await this.repository
                .createFinding({
                  runId:
                    run.id,

                  organizationId:
                    payment
                      .organization_id,

                  provider:
                    payment.provider,

                  entityType:
                    "PAYMENT",

                  entityId:
                    payment
                      .payment_code,

                  providerEntityId:
                    payment
                      .provider_session_id,

                  severity:
                    RECONCILIATION_SEVERITY
                      .WARNING,

                  classification:
                    RECONCILIATION_CLASSIFICATION
                      .REPAIRABLE_DRIFT,

                  canonicalState: {
                    status:
                      canonicalStatus,
                  },

                  providerState,

                  repairAction:
                    "MARK_PAYMENT_SUCCEEDED",

                  repairStatus:
                    RECONCILIATION_REPAIR_STATUS
                      .PENDING,
                });


            await succeedPaymentAttempt({
              organizationId:
                payment
                  .organization_public_id,

              paymentCode:
                payment
                  .payment_code,

              attemptCode:
                payment
                  .attempt_code,

              providerPaymentId:
                providerState
                  .providerPaymentId ||
                providerState
                  .providerSessionId,

              providerPaymentIntentId:
                payment.provider ===
                  "stripe"
                  ? providerState
                      .providerSessionId
                  : null,

              responsePayload: {
                source:
                  "reconciliation",

                providerStatus:
                  providerState
                    .providerStatus,
              },
            });


            await this.repository
              .markFindingRepaired(
                finding.id
              );


            counters.repaired++;

            continue;
          }


          if (
            providerState
              .canonicalStatus ===
            "FAILED"
          ) {
            const finding =
              await this.repository
                .createFinding({
                  runId:
                    run.id,

                  organizationId:
                    payment
                      .organization_id,

                  provider:
                    payment.provider,

                  entityType:
                    "PAYMENT",

                  entityId:
                    payment
                      .payment_code,

                  providerEntityId:
                    payment
                      .provider_session_id,

                  severity:
                    RECONCILIATION_SEVERITY
                      .WARNING,

                  classification:
                    RECONCILIATION_CLASSIFICATION
                      .REPAIRABLE_DRIFT,

                  canonicalState: {
                    status:
                      canonicalStatus,
                  },

                  providerState,

                  repairAction:
                    "MARK_PAYMENT_FAILED",

                  repairStatus:
                    RECONCILIATION_REPAIR_STATUS
                      .PENDING,
                });


            await failPaymentAttempt({
              organizationId:
                payment
                  .organization_public_id,

              paymentCode:
                payment
                  .payment_code,

              attemptCode:
                payment
                  .attempt_code,

              failureCode:
                "RECONCILED_PROVIDER_FAILURE",

              failureMessage:
                "Provider reconciliation reported payment failure",

              responsePayload: {
                source:
                  "reconciliation",

                providerStatus:
                  providerState
                    .providerStatus,
              },
            });


            await this.repository
              .markFindingRepaired(
                finding.id
              );


            counters.repaired++;

            continue;
          }


          counters.suspicious++;


          await this.repository
            .createFinding({
              runId:
                run.id,

              organizationId:
                payment
                  .organization_id,

              provider:
                payment.provider,

              entityType:
                "PAYMENT",

              entityId:
                payment
                  .payment_code,

              providerEntityId:
                payment
                  .provider_session_id,

              severity:
                RECONCILIATION_SEVERITY
                  .WARNING,

              classification:
                RECONCILIATION_CLASSIFICATION
                  .STALE_PROCESSING,

              canonicalState: {
                status:
                  canonicalStatus,
              },

              providerState,

              repairAction:
                "WAIT_OR_MANUAL_REVIEW",

              repairStatus:
                RECONCILIATION_REPAIR_STATUS
                  .MANUAL_REVIEW,
            });

        } catch (
          error
        ) {
          counters.failed++;


          await this.repository
            .createFinding({
              runId:
                run.id,

              organizationId:
                payment
                  .organization_id,

              provider:
                payment.provider,

              entityType:
                "PAYMENT",

              entityId:
                payment
                  .payment_code,

              providerEntityId:
                payment
                  .provider_session_id,

              severity:
                RECONCILIATION_SEVERITY
                  .CRITICAL,

              classification:
                RECONCILIATION_CLASSIFICATION
                  .SUSPICIOUS_DRIFT,

              canonicalState: {
                status:
                  payment.status,
              },

              providerState: {},

              repairAction:
                "RECONCILIATION_FAILED",

              repairStatus:
                RECONCILIATION_REPAIR_STATUS
                  .FAILED,

              metadata: {
                code:
                  error.code,

                message:
                  error.message,
              },
            });
        }
      }


      const finalStatus =
        counters.failed >
          0
          ? RECONCILIATION_RUN_STATUS
              .PARTIAL
          : RECONCILIATION_RUN_STATUS
              .COMPLETED;


      await this.repository
        .completeRun({
          runId:
            run.id,

          status:
            finalStatus,

          scannedCount:
            counters.scanned,

          matchedCount:
            counters.matched,

          repairedCount:
            counters.repaired,

          suspiciousCount:
            counters.suspicious,

          failedCount:
            counters.failed,
        });


      return {
        runCode:
          run.run_code,

        status:
          finalStatus,

        counters,
      };

    } catch (
      error
    ) {
      await this.repository
        .completeRun({
          runId:
            run.id,

          status:
            RECONCILIATION_RUN_STATUS
              .FAILED,

          scannedCount:
            counters.scanned,

          matchedCount:
            counters.matched,

          repairedCount:
            counters.repaired,

          suspiciousCount:
            counters.suspicious,

          failedCount:
            counters.failed +
            1,
        });


      throw error;
    }
  }


  async replayFailedWebhooks({
    limit =
      100,
  } = {}) {
    const run =
      await this.repository
        .createRun({
          runType:
            RECONCILIATION_RUN_TYPES
              .WEBHOOK,

          metadata: {
            source:
              "phase15_19",
          },
        });


    const events =
      await this.repository
        .listFailedWebhookEvents(
          limit
        );


    const counters = {
      scanned:
        0,

      matched:
        0,

      repaired:
        0,

      suspicious:
        0,

      failed:
        0,
    };


    for (
      const event
      of events
    ) {
      counters.scanned++;


      try {
        const result =
          await paymentWebhookProcessor
            .process(
              event.id
            );


        if (
          result
            ?.duplicate
        ) {
          counters.matched++;
        } else {
          counters.repaired++;
        }

      } catch (
        _error
      ) {
        counters.failed++;
      }
    }


    const status =
      counters.failed >
        0
        ? RECONCILIATION_RUN_STATUS
            .PARTIAL
        : RECONCILIATION_RUN_STATUS
            .COMPLETED;


    await this.repository
      .completeRun({
        runId:
          run.id,

        status,

        scannedCount:
          counters.scanned,

        matchedCount:
          counters.matched,

        repairedCount:
          counters.repaired,

        suspiciousCount:
          counters.suspicious,

        failedCount:
          counters.failed,
      });


    return {
      runCode:
        run.run_code,

      status,

      counters,
    };
  }


  async reconcileInvoice(
    invoiceId
  ) {
    const before =
      await this.repository
        .getInvoicePaymentState(
          invoiceId
        );


    if (
      !before
    ) {
      return null;
    }


    const expectedPaid =
      Math.min(
        Number(
          before
            .succeeded_payment_minor
        ),

        Number(
          before
            .total_minor
        )
      );


    const expectedDue =
      Math.max(
        0,

        Number(
          before
            .total_minor
        ) -
        expectedPaid
      );


    const matches =
      Number(
        before
          .amount_paid_minor
      ) ===
        expectedPaid &&
      Number(
        before
          .amount_due_minor
      ) ===
        expectedDue;


    if (
      matches
    ) {
      return {
        repaired:
          false,

        before,
      };
    }


    const repaired =
      await this.repository
        .repairInvoicePaymentState(
          invoiceId
        );


    return {
      repaired:
        true,

      before,

      after:
        repaired,
    };
  }
}


const billingReconciliationService =
  new BillingReconciliationService();


module.exports = {
  BillingReconciliationService,

  billingReconciliationService,

  reconcilePayments:
    billingReconciliationService
      .reconcilePayments
      .bind(
        billingReconciliationService
      ),

  replayFailedPaymentWebhooks:
    billingReconciliationService
      .replayFailedWebhooks
      .bind(
        billingReconciliationService
      ),

  reconcileInvoice:
    billingReconciliationService
      .reconcileInvoice
      .bind(
        billingReconciliationService
      ),
};