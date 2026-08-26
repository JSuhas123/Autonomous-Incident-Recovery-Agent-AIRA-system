"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const crypto =
  require(
    "node:crypto"
  );


const {
  calculateInvoiceTotal,
} =
  require(
    "../../constants/invoice"
  );

const {
  calculateGrossProfitMinor,

  calculateGrossMarginBasisPoints,
} =
  require(
    "../../constants/tenantEconomics"
  );

const {
  calculatePercentageDiscount,
} =
  require(
    "../../constants/financialAdjustments"
  );

const {
  verifyRazorpaySignature,
} =
  require(
    "../../services/billing/paymentWebhooks/webhookSignatureService"
  );

const {
  isKnownPaymentProvider,
} =
  require(
    "../../constants/payments"
  );


function migrationPath(
  file
) {
  return path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    file
  );
}


function readMigration(
  file
) {
  return fs.readFileSync(
    migrationPath(
      file
    ),
    "utf8"
  );
}


describe(
  "Phase 15.20 financial security certification",
  () => {

    // ========================================================================
    // MONEY
    // ========================================================================

    test(
      "financial money columns use integer minor units",
      () => {
        const sources = [
          readMigration(
            "0052_cost_attribution.sql"
          ),

          readMigration(
            "0054_invoice_engine.sql"
          ),

          readMigration(
            "0055_financial_adjustments.sql"
          ),

          readMigration(
            "0056_payment_state_machine.sql"
          ),
        ];


        for (
          const source
          of sources
        ) {
          expect(
            source
          ).not.toMatch(
            /\b(?:FLOAT|REAL|DOUBLE\s+PRECISION)\b[\s\S]{0,80}(?:amount|price|cost|total)/i
          );
        }
      }
    );


    test(
      "invoice arithmetic rejects floating point minor units",
      () => {
        expect(
          () =>
            calculateInvoiceTotal({
              subtotalMinor:
                100.25,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "INVOICE_AMOUNT_INVALID",
          })
        );
      }
    );


    test(
      "gross profit calculation is deterministic",
      () => {
        expect(
          calculateGrossProfitMinor({
            revenueMinor:
              50000,

            costMinor:
              12500,
          })
        ).toBe(
          37500
        );


        expect(
          calculateGrossMarginBasisPoints({
            revenueMinor:
              50000,

            grossProfitMinor:
              37500,
          })
        ).toBe(
          7500
        );
      }
    );


    test(
      "discount arithmetic uses basis points rather than percentages as floats",
      () => {
        expect(
          calculatePercentageDiscount({
            subtotalMinor:
              25000,

            percentageBasisPoints:
              1250,
          })
        ).toBe(
          3125
        );
      }
    );


    // ========================================================================
    // IMMUTABILITY
    // ========================================================================

    test(
      "usage ledger remains authoritative and durable",
      () => {
        const source =
          readMigration(
            "0050_usage_ledger_aggregation.sql"
          );


        expect(
          source
        ).toContain(
          "billing.usage_events"
        );


        expect(
          source
        ).toContain(
          "Never invoice from Redis or ClickHouse"
        );
      }
    );


    test(
      "cost events are immutable",
      () => {
        const source =
          readMigration(
            "0052_cost_attribution.sql"
          );


        expect(
          source
        ).toContain(
          "aira_prevent_cost_event_mutation"
        );


        expect(
          source
        ).toContain(
          "BEFORE UPDATE"
        );


        expect(
          source
        ).toContain(
          "BEFORE DELETE"
        );
      }
    );


    test(
      "finalized invoices protect financial fields",
      () => {
        const source =
          readMigration(
            "0054_invoice_engine.sql"
          );


        expect(
          source
        ).toContain(
          "aira_protect_finalized_invoice_financials"
        );


        expect(
          source
        ).toContain(
          "finalized invoice financial fields are immutable"
        );
      }
    );


    test(
      "finalized invoice items cannot be rewritten",
      () => {
        const source =
          readMigration(
            "0054_invoice_engine.sql"
          );


        expect(
          source
        ).toContain(
          "aira_protect_finalized_invoice_items"
        );


        expect(
          source
        ).toContain(
          "finalized invoice items are immutable"
        );
      }
    );


    test(
      "financial correction applications are immutable",
      () => {
        const source =
          readMigration(
            "0055_financial_adjustments.sql"
          );


        expect(
          source
        ).toContain(
          "aira_prevent_financial_application_mutation"
        );


        expect(
          source
        ).toContain(
          "invoice financial applications are immutable"
        );
      }
    );


    // ========================================================================
    // PAYMENT SAFETY
    // ========================================================================

    test(
      "payment terminal states are protected",
      () => {
        const source =
          readMigration(
            "0056_payment_state_machine.sql"
          );


        expect(
          source
        ).toContain(
          "aira_validate_payment_transition"
        );


        expect(
          source
        ).toContain(
          "terminal payment state"
        );
      }
    );


    test(
      "succeeded payment financial identity is immutable",
      () => {
        const source =
          readMigration(
            "0056_payment_state_machine.sql"
          );


        expect(
          source
        ).toContain(
          "aira_protect_succeeded_payment_financials"
        );


        expect(
          source
        ).toContain(
          "succeeded payment financial fields are immutable"
        );
      }
    );


    test(
      "only approved providers are accepted",
      () => {
        expect(
          isKnownPaymentProvider(
            "razorpay"
          )
        ).toBe(
          true
        );


        expect(
          isKnownPaymentProvider(
            "stripe"
          )
        ).toBe(
          true
        );


        expect(
          isKnownPaymentProvider(
            "attacker-provider"
          )
        ).toBe(
          false
        );
      }
    );


    // ========================================================================
    // WEBHOOK SECURITY
    // ========================================================================

    test(
      "Razorpay webhook signature binds the exact raw body",
      () => {
        const secret =
          "phase15-certification-secret";


        const original =
          Buffer.from(
            '{"event":"payment.captured","value":1}',
            "utf8"
          );


        const tampered =
          Buffer.from(
            '{"event":"payment.captured","value":2}',
            "utf8"
          );


        const signature =
          crypto
            .createHmac(
              "sha256",
              secret
            )
            .update(
              original
            )
            .digest(
              "hex"
            );


        expect(
          verifyRazorpaySignature({
            rawBody:
              original,

            signature,

            secret,
          })
        ).toBe(
          true
        );


        expect(
          () =>
            verifyRazorpaySignature({
              rawBody:
                tampered,

              signature,

              secret,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "RAZORPAY_WEBHOOK_SIGNATURE_INVALID",
          })
        );
      }
    );


    test(
      "provider webhook event identity is unique",
      () => {
        const source =
          readMigration(
            "0058_payment_webhooks.sql"
          );


        expect(
          source
        ).toMatch(
          /UNIQUE\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i
        );
      }
    );


    test(
      "webhook identity and payload are immutable",
      () => {
        const source =
          readMigration(
            "0058_payment_webhooks.sql"
          );


        expect(
          source
        ).toContain(
          "aira_protect_webhook_identity"
        );


        expect(
          source
        ).toContain(
          "payment webhook identity and payload are immutable"
        );
      }
    );


    test(
      "webhook retry count is bounded",
      () => {
        const repositoryPath =
          path.join(
            __dirname,
            "..",
            "..",
            "persistence",
            "postgres",
            "PostgresPaymentWebhookRepository.js"
          );


        const source =
          fs.readFileSync(
            repositoryPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "PAYMENT_WEBHOOK_MAX_ATTEMPTS"
        );


        expect(
          source
        ).toMatch(
          /attempt_count\s*</i
        );
      }
    );


    // ========================================================================
    // RECONCILIATION SAFETY
    // ========================================================================

    test(
      "reconciliation findings preserve detected identity",
      () => {
        const source =
          readMigration(
            "0059_billing_reconciliation.sql"
          );


        expect(
          source
        ).toContain(
          "aira_protect_reconciliation_finding_identity"
        );
      }
    );


    test(
      "reconciliation supports manual review for suspicious drift",
      () => {
        const source =
          readMigration(
            "0059_billing_reconciliation.sql"
          );


        expect(
          source
        ).toContain(
          "SUSPICIOUS_DRIFT"
        );


        expect(
          source
        ).toContain(
          "MANUAL_REVIEW"
        );
      }
    );
  }
);