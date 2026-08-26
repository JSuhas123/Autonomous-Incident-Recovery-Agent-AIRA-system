# AIRA — Phase 15: Billing, Entitlements, Metering & Financial Platform

**Status:** ✅ COMPLETE
**Certification:** Phase 15.20 passed
**Database:** PostgreSQL authoritative financial store
**Payment providers:** Razorpay + Stripe provider architecture
**Current operational provider:** Razorpay
**Currencies:** USD + INR
**Migrations:** `0048` → `0059`

---

## 1. Phase 15 Objective

Phase 15 transforms AIRA from an enterprise incident-recovery platform into a **commercially operable SaaS system**.

Before Phase 15, AIRA could determine whether an authenticated and authorized actor was permitted to perform an operation.

Phase 15 adds a second independent question:

```text
AUTHORIZATION
"Is this actor allowed to perform this operation?"

                +

ENTITLEMENT
"Has this organization purchased/accessed this capability?"

                +

QUOTA
"Has this organization exceeded its commercial allowance?"

                ↓

        EXECUTION DECISION
```

This separation is fundamental.

AIRA agents must never contain logic such as:

```js
if (
  plan ===
  "enterprise"
) {
  executeRecovery();
}
```

Instead:

```text
Organization
      │
      ▼
Subscription
      │
      ▼
Entitlement Engine
      │
      ▼
Capability / Quota Decision
```

Commercial policy therefore remains centralized rather than leaking into agents and infrastructure code.

---

# 2. Final Phase 15 Architecture

```text
                         CUSTOMER
                             │
                             ▼
                       ORGANIZATION
                             │
                             ▼
                       COMMERCIAL PLAN
                             │
                             ▼
                        PLAN VERSION
                             │
                             ▼
                         PRICE BOOK
                        /          \
                      USD          INR
                       │            │
                       └─────┬──────┘
                             ▼
                        SUBSCRIPTION
                             │
                             ▼
                     ENTITLEMENT ENGINE
                        /          \
                       /            \
                      ▼              ▼
               CAPABILITIES        QUOTAS
                      \              /
                       \            /
                        └─────┬────┘
                              ▼
                         AIRA RUNTIME
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
           USAGE EVENTS                 COST EVENTS
                │                           │
                ▼                           ▼
       IMMUTABLE USAGE LEDGER       IMMUTABLE COST LEDGER
                │                           │
                └─────────────┬─────────────┘
                              ▼
                       TENANT ECONOMICS
                              │
                              ▼
                        INVOICE ENGINE
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
              CREDITS      DISCOUNTS    ADJUSTMENTS
                 │            │            │
                 └────────────┼────────────┘
                              ▼
                        FINAL INVOICE
                              │
                              ▼
                       AIRA PAYMENT
                              │
                              ▼
                     PROVIDER ADAPTER
                         /         \
                        ▼           ▼
                   RAZORPAY       STRIPE
                        \           /
                         └────┬────┘
                              ▼
                        PROVIDER EVENT
                              │
                              ▼
                       SIGNED WEBHOOK
                              │
                              ▼
                     SIGNATURE VALIDATION
                              │
                              ▼
                       WEBHOOK LEDGER
                              │
                              ▼
                      PAYMENT ATTEMPT
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                SUCCEEDED             FAILED
                    │
                    ▼
             INVOICE SETTLEMENT
                    │
                    ▼
              RECONCILIATION
                    │
           ┌────────┴─────────┐
           ▼                  ▼
         MATCH             FINDING
```

---

# 3. Phase 15 Data Architecture

The final Phase 15 data architecture deliberately assigns different responsibilities to different databases and infrastructure components.

```text
                       AIRA BILLING PLATFORM
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    PostgreSQL               Redis               RabbitMQ
         │                     │                     │
 Financial Truth        Runtime State          Async Transport
         │                     │                     │
         │                     │                     │
         └──────────────┐      │      ┌──────────────┘
                        ▼      ▼      ▼
                         ClickHouse
                             │
                         Analytics

                         Neo4j
                             │
                 Infrastructure Graph
```

## PostgreSQL — authoritative source of truth

PostgreSQL owns all durable transactional and financial state.

This includes:

```text
Commercial Catalogue
├── plans
├── plan_versions
└── prices

Subscription
├── subscriptions
├── subscription items/state
├── entitlements
└── tenant overrides

Metering
├── usage_events
├── usage_daily_aggregates
└── usage_period_aggregates

Economics
├── cost_events
└── tenant_economics_snapshots

Invoices
├── invoices
├── invoice_items
├── credit_grants
└── financial adjustments

Payments
├── payments
├── payment_attempts
├── payment_provider_sessions
└── payment_webhook_events

Financial Control
├── reconciliation_runs
└── reconciliation_findings
```

The final database certification confirmed the critical tables:

```text
billing.plans
billing.plan_versions
billing.prices

billing.usage_events
billing.cost_events
billing.tenant_economics_snapshots

billing.invoices
billing.invoice_items
billing.credit_grants

billing.payments
billing.payment_attempts
billing.payment_provider_sessions
billing.payment_webhook_events

billing.reconciliation_runs
billing.reconciliation_findings
```

All resolved successfully in PostgreSQL.

---

# 4. Redis — Runtime Acceleration

Redis is deliberately **not financial truth**.

Its responsibilities include:

```text
Redis
├── entitlement cache
├── quota counters
├── rate limits
├── runtime usage acceleration
└── idempotency/cache state
```

A Redis failure must not destroy the authoritative commercial state.

The system should be capable of reconstructing commercial decisions from PostgreSQL.

Therefore:

```text
Redis says X
PostgreSQL says Y

        ↓

PostgreSQL wins.
```

Invoices must never be generated from Redis counters alone.

---

# 5. RabbitMQ — Billing Event Transport

RabbitMQ provides asynchronous processing.

```text
PostgreSQL Transaction
        │
        ▼
Transactional Outbox
        │
        ▼
RabbitMQ
        │
   ┌────┼─────────────┐
   ▼    ▼             ▼
Usage  Aggregation   Billing
Jobs   Jobs          Events
        │
        ├── webhook processing
        ├── retries
        └── analytics projection
```

RabbitMQ is transport.

It is not financial storage.

If RabbitMQ loses transient runtime state, authoritative records remain recoverable from PostgreSQL/outbox state.

---

# 6. ClickHouse — Analytical Platform

ClickHouse is reserved for massive analytical workloads.

Examples:

```text
Usage by tenant
Usage by plan
Usage by environment
Usage by meter
LLM consumption
Recovery frequency
Cost trends
Margin trends
Historical telemetry
Large-scale product analytics
```

Future analytics can therefore execute against ClickHouse without placing analytical pressure on PostgreSQL.

But:

```text
ClickHouse
     ↓
analytics

NOT

ClickHouse
     ↓
invoice truth
```

Historical analytical projections can be rebuilt.

Financial ledgers cannot.

---

# 7. Neo4j — Infrastructure Graph

Neo4j remains separate from the commercial system.

Its role is:

```text
Service
   │
   ├── depends_on ──► Database
   │
   ├── calls ───────► API
   │
   ├── deployed_on ─► Cluster
   │
   └── connected_to ► Queue
```

This allows AIRA to understand infrastructure/dependency relationships.

Neo4j does not store billing truth.

---

# 8. Commercial Catalogue

Phase 15 introduces a versioned commercial catalogue.

```text
PLAN
 │
 ▼
PLAN VERSION
 │
 ▼
PRICE
```

Separating plan identity from plan version is important.

Suppose Growth originally provides:

```text
Growth 2026
Resources: 100
Autonomous recoveries: 20
```

Later AIRA introduces:

```text
Growth 2027
Resources: 150
Autonomous recoveries: 30
```

Existing contracts do not have to be silently rewritten.

They can remain attached to the commercial version under which they were purchased.

---

# 9. USD + INR Pricing

Phase 15 supports explicit price books rather than dynamically converting every invoice from a live FX rate.

Conceptually:

```text
              PLAN VERSION
                    │
             ┌──────┴──────┐
             ▼             ▼
         USD PRICE       INR PRICE
```

For example, usage rates can independently contain:

```text
Growth
│
├── autonomous_recoveries
│     ├── USD
│     └── INR
│
└── resources
      ├── USD
      └── INR
```

This is preferable to making customer invoices depend on a constantly changing exchange rate.

Commercial INR prices can therefore be intentionally set rather than mechanically converted.

---

# 10. Entitlement Architecture

The entitlement engine answers questions such as:

```text
Can this tenant use autonomous recovery?

Can this tenant create another environment?

Can this tenant add another resource?

Can this tenant access this integration?

Can this tenant execute this capability?
```

The application asks:

```text
entitlements.can(
    tenant,
    capability
)
```

rather than:

```text
if plan === "growth"
```

This gives AIRA flexibility for:

```text
custom contracts
enterprise overrides
trials
grandfathered plans
temporary feature grants
sales agreements
future add-ons
```

without changing agent logic.

---

# 11. Quota Architecture

Entitlements determine **whether** something is available.

Quotas determine **how much** is available.

```text
ENTITLEMENT

autonomous_recovery = true

           +

QUOTA

autonomous_recovery.monthly.included = N

           ↓

Runtime decision
```

Redis can accelerate quota evaluation.

PostgreSQL remains authoritative for durable usage.

---

# 12. Usage Metering

Phase 15 defines product/economic meters including:

```text
incidents_processed
agent_runs

llm_input_tokens
llm_output_tokens

integration_queries
telemetry_bytes

playbook_executions
autonomous_recoveries

evidence_storage
vector_embeddings

notifications

environments
users
resources
```

An important design rule is:

> **Metering does not imply charging.**

AIRA should measure more than it bills.

This gives the platform visibility into its economics.

---

# 13. Immutable Usage Ledger

The authoritative usage path is:

```text
AIRA operation
      │
      ▼
Usage Meter Service
      │
      ▼
Idempotency Check
      │
      ▼
billing.usage_events
      │
      ▼
Transactional Outbox
      │
      ▼
Aggregation
```

`billing.usage_events` is the authoritative immutable usage ledger.

This means:

```text
Redis counter      ≠ billing truth
ClickHouse metric  ≠ billing truth
RabbitMQ message   ≠ billing truth

billing.usage_events = billing truth
```

---

# 14. Idempotency

Billing operations must tolerate retries.

For example:

```text
Recovery completes
       │
       ▼
record usage
       │
       X network timeout
       │
       ▼
caller retries
```

Without idempotency:

```text
1 recovery
    ↓
2 usage events
    ↓
customer charged twice
```

With idempotency:

```text
same organization
+
same meter
+
same idempotency identity

        ↓

one authoritative event
```

This is one of the major financial guarantees introduced in Phase 15.

---

# 15. Usage Aggregation

Raw events remain immutable.

Aggregates are derived.

```text
billing.usage_events
        │
        ├────────► daily aggregate
        │
        └────────► billing-period aggregate
```

Therefore aggregates can be rebuilt.

The raw ledger remains the source.

---

# 16. Cost Attribution

AIRA now records not only customer usage but **AIRA's own cost of delivering the service**.

Examples include:

```text
LLM cost
Compute cost
Database cost
Storage cost
Network cost
Vector/embedding cost
Notification cost
Payment processing cost
Other infrastructure COGS
```

This creates two separate flows:

```text
CUSTOMER USAGE
      │
      ▼
Revenue

AIRA RESOURCE CONSUMPTION
      │
      ▼
COGS
```

They must never be confused.

---

# 17. Tenant Economics

Phase 15 can therefore derive:

```text
Revenue
   -
COGS
   =
Gross Profit
```

and:

```text
Gross Profit
────────────
  Revenue

     ↓

Gross Margin
```

This gives future AIRA analytics access to:

```text
Revenue / tenant
Cost / tenant
LLM cost / tenant
Infrastructure cost / tenant
Recovery cost / incident
Revenue / incident
Margin / tenant
Margin / plan
Margin / period
```

This information becomes extremely valuable when determining future commercial pricing.

---

# 18. Invoice Engine

The invoice engine combines:

```text
Subscription
     +
Billable usage
     +
Overages
     +
Adjustments
     -
Discounts
     -
Credits
     +
Future taxes
     │
     ▼
Final Invoice
```

Invoices contain explicit invoice items rather than only a single opaque total.

This provides traceability for both AIRA and customers.

---

# 19. Money Representation

Financial values use **integer minor currency units**.

Examples:

```text
USD

$1.00
=
100 minor units
```

```text
INR

₹1.00
=
100 minor units
```

Therefore:

```text
$125.50
=
12550
```

rather than:

```text
125.50 floating point
```

Floating-point ledger arithmetic is prohibited.

---

# 20. Credits, Discounts & Adjustments

Finalized invoices must not be silently rewritten.

Instead AIRA supports explicit financial correction concepts:

```text
Credits
Discounts
Debit adjustments
Credit adjustments
```

For example:

```text
Original invoice
₹10,000

Customer service credit
-₹1,000

Final payable
₹9,000
```

The original financial history remains auditable.

---

# 21. Canonical Payment Architecture

AIRA owns the canonical payment record.

```text
billing.payments
       │
       ▼
billing.payment_attempts
       │
       ▼
Provider Adapter
```

The external payment provider does **not** replace AIRA's payment domain.

This means:

```text
Razorpay Order
       ≠
AIRA Payment
```

and:

```text
Stripe PaymentIntent
       ≠
AIRA Payment
```

They are external provider objects linked to AIRA's canonical financial record.

---

# 22. Payment State Machine

Conceptually:

```text
              REQUIRES_PAYMENT
                     │
                     ▼
                 PROCESSING
               /      |      \
              /       |       \
             ▼        ▼        ▼
        SUCCEEDED   FAILED   CANCELLED
```

Terminal financial states are protected.

A successful payment cannot casually transition backward into a mutable processing state.

---

# 23. Razorpay + Stripe

The provider architecture supports:

```text
                AIRA
                  │
                  ▼
          Provider Interface
             /          \
            ▼            ▼
       Razorpay        Stripe
```

AIRA therefore avoids putting provider-specific logic throughout the billing system.

Current practical configuration:

```text
Razorpay
    └── configured / test integration

Stripe
    └── architecture retained
        provider activation deferred
```

This means Stripe can be activated later without redesigning the financial domain.

---

# 24. Provider Secret Architecture

Provider secrets belong in environment/secret-management infrastructure.

Examples:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

They must not be persisted inside ordinary billing database records.

Database records may contain provider identifiers.

They should not contain provider credentials.

---

# 25. Payment Webhook Security

Payment providers asynchronously notify AIRA through:

```text
POST /api/billing/webhooks/...
```

The critical HTTP architecture is:

```text
Incoming HTTP
     │
     ▼
Payment webhook route
     │
     ▼
express.raw()
     │
     ▼
Signature verification
     │
     ▼
Webhook processing

--------------------------------

Other HTTP requests
     │
     ▼
express.json()
```

Therefore the webhook route must remain mounted **before the global JSON parser**.

This is now protected by the Phase 15 architecture certification tests.

---

# 26. Razorpay Signature Verification

Razorpay signs the exact request body.

AIRA verifies:

```text
raw webhook body
       +
webhook secret
       │
       ▼
HMAC-SHA256
       │
       ▼
expected signature
       │
       ▼
constant-time comparison
       │
       ├── mismatch → reject
       │
       └── match → ingest
```

If an attacker changes:

```json
{
  "amount": 100
}
```

to:

```json
{
  "amount": 10000
}
```

the signature no longer matches.

The webhook is rejected.

---

# 27. Webhook Replay Protection

Payment providers may retry webhook delivery.

Therefore:

```text
Provider
   │
   ├── event XYZ
   │
   ├── event XYZ
   │
   └── event XYZ
```

must result in:

```text
one logical provider event
```

not:

```text
three payments
```

Provider + provider-event identity is protected by durable idempotency.

---

# 28. Durable Webhook Ledger

Verified provider events are stored in:

```text
billing.payment_webhook_events
```

This enables:

```text
auditability
retry
failure analysis
reconciliation
provider debugging
security investigation
```

The verified webhook identity/payload becomes protected historical evidence.

---

# 29. Reconciliation

Webhooks alone are not sufficient for an enterprise billing system.

Events can be:

```text
late
duplicated
missed
temporarily unprocessable
delivered out of order
```

Therefore Phase 15 introduces reconciliation.

```text
AIRA Financial State
          │
          │ compare
          ▼
Provider Financial State
          │
          ▼
Reconciliation Engine
          │
   ┌──────┴─────────┐
   ▼                ▼
 MATCH            DRIFT
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
     Repairable           Suspicious
          │                    │
          ▼                    ▼
       Repair             Manual Review
```

---

# 30. Reconciliation Classification

Phase 15 supports findings such as:

```text
MATCH
REPAIRABLE_DRIFT
SUSPICIOUS_DRIFT
ORPHAN_PROVIDER_OBJECT
STALE_PROCESSING
FAILED_WEBHOOK
SUBSCRIPTION_DRIFT
```

Suspicious financial drift must not be silently repaired.

It is surfaced for review.

---

# 31. Financial Immutability

Phase 15 introduces strong historical guarantees.

### Usage

```text
billing.usage_events

immutable authoritative usage history
```

### Cost

```text
billing.cost_events

immutable COGS history
```

### Invoice

After finalization:

```text
financial fields protected
invoice items protected
```

### Payment

After success:

```text
financial identity protected
```

### Webhook

After verified ingestion:

```text
provider identity protected
payload protected
```

### Reconciliation

May repair operational state.

It must **not rewrite historical usage/cost truth**.

---

# 32. Failure Model

The architecture now handles several important failures.

```text
Redis unavailable
      │
      ▼
degraded runtime acceleration
      │
      ▼
PostgreSQL truth survives
```

```text
RabbitMQ unavailable
      │
      ▼
outbox remains durable
      │
      ▼
publish later
```

```text
ClickHouse unavailable
      │
      ▼
analytics delayed
      │
      ▼
billing unaffected
```

```text
Webhook duplicated
      │
      ▼
idempotency
      │
      ▼
no duplicate settlement
```

```text
Webhook missed
      │
      ▼
reconciliation
```

```text
Razorpay unavailable
      │
      ▼
payment remains incomplete
      │
      ▼
no fake success
```

This is the behavior we want from an enterprise financial subsystem.

---

# 33. Phase 15 Security Boundary

```text
Authentication
      │
      ▼
Who are you?
      │
      ▼
Authorization
      │
      ▼
Are you allowed?
      │
      ▼
Organization Scope
      │
      ▼
Which tenant?
      │
      ▼
Entitlement
      │
      ▼
Has this capability been purchased?
      │
      ▼
Quota
      │
      ▼
Is usage available?
      │
      ▼
Execution
      │
      ▼
Metering
      │
      ▼
Financial Accounting
```

This creates a much stronger boundary than simply checking subscription plan names inside application code.

---

# 34. Phase 15 Migrations

The final Phase 15 persistence chain is:

```text
0048_billing_commercial_catalogue.sql
0049_subscription_entitlement_meter_foundation.sql
0050_usage_ledger_aggregation.sql
0051_runtime_entitlements_quota.sql
0052_cost_attribution.sql
0053_tenant_economics.sql
0054_invoice_engine.sql
0055_financial_adjustments.sql
0056_payment_state_machine.sql
0057_payment_provider_sessions.sql
0058_payment_webhooks.sql
0059_billing_reconciliation.sql
```

Phase 15.20 deliberately introduced **no migration**.

15.20 certifies existing invariants rather than inventing another schema change merely to increment the migration number.

---

# 35. Phase 15 Certification

Phase 15.20 introduced:

```text
tests/unit/
├── phase15FinancialSecurity.test.js
└── phase15ArchitectureCertification.test.js
```

These protect architecture guarantees such as:

```text
✓ financial minor-unit arithmetic

✓ immutable usage ledger

✓ immutable cost ledger

✓ finalized invoice protection

✓ invoice item protection

✓ payment terminal-state protection

✓ succeeded payment protection

✓ approved payment providers

✓ Razorpay raw-body signature verification

✓ webhook replay protection

✓ webhook payload protection

✓ bounded webhook retries

✓ reconciliation identity protection

✓ suspicious-drift manual review

✓ PostgreSQL financial authority

✓ Redis not being financial truth

✓ provider-neutral invoice engine

✓ provider secret isolation

✓ webhook-before-JSON-parser ordering

✓ entitlement-driven capabilities

✓ cost/revenue separation

✓ reconciliation ledger safety

✓ complete Phase 15 migration chain
```

---

# 36. Final Certified Database State

The final PostgreSQL certification returned:

```text
billing.plans
billing.plan_versions
billing.prices

billing.usage_events
billing.cost_events
billing.tenant_economics_snapshots

billing.invoices
billing.invoice_items
billing.credit_grants

billing.payments
billing.payment_attempts
billing.payment_provider_sessions
billing.payment_webhook_events

billing.reconciliation_runs
billing.reconciliation_findings
```

All critical Phase 15 financial domains are present.

---

# 37. Phase 15 Completion Matrix

| Phase | Capability                           | Status |
| ----- | ------------------------------------ | -----: |
| 15.0  | Commercial architecture              |      ✅ |
| 15.1  | Commercial catalogue                 |      ✅ |
| 15.2  | USD/INR pricing                      |      ✅ |
| 15.3  | Subscription lifecycle               |      ✅ |
| 15.4  | Entitlement engine                   |      ✅ |
| 15.5  | Meter catalogue                      |      ✅ |
| 15.6  | Immutable usage ledger               |      ✅ |
| 15.7  | Usage idempotency                    |      ✅ |
| 15.8  | Usage aggregation                    |      ✅ |
| 15.9  | Runtime entitlement/quota            |      ✅ |
| 15.10 | Autonomous recovery billing boundary |      ✅ |
| 15.11 | Product metering adapters            |      ✅ |
| 15.12 | Cost attribution                     |      ✅ |
| 15.13 | Tenant economics                     |      ✅ |
| 15.14 | Invoice engine                       |      ✅ |
| 15.15 | Credits/discounts/adjustments        |      ✅ |
| 15.16 | Payment state machine                |      ✅ |
| 15.17 | Razorpay/Stripe adapters             |      ✅ |
| 15.18 | Signed webhook processing            |      ✅ |
| 15.19 | Reconciliation/subscription sync     |      ✅ |
| 15.20 | Financial security certification     |      ✅ |

# **PHASE 15 — COMPLETE AND FROZEN ✅**

From this point forward, we should treat these as architectural invariants:

```text
PostgreSQL = financial truth

Redis      = runtime acceleration

RabbitMQ   = asynchronous transport

ClickHouse = analytical workloads

Neo4j      = infrastructure/dependency graph
```

And:

```text
Authorization ≠ Entitlement ≠ Quota

Usage ≠ Cost

AIRA Payment ≠ Provider Payment Object

Webhook ≠ unconditional truth

Analytics ≠ financial ledger

Finalized financial history ≠ mutable state
```

Future phases may **extend** these systems, but they should not bypass these boundaries.

