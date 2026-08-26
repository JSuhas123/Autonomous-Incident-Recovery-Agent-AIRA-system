# AIRA Phase 15 — Billing, Entitlements, Metering & Financial Platform

## Status

**COMPLETE — Phase 15.0 through Phase 15.20**

Phase 15 transforms AIRA from a technically capable incident-recovery platform into a commercially operable SaaS platform with:

- commercial plans
- USD and INR pricing
- subscriptions
- entitlements
- quotas
- usage metering
- internal cost attribution
- tenant economics
- invoices
- credits and discounts
- payments
- Razorpay / Stripe provider boundaries
- signed webhooks
- reconciliation
- financial security certification

---

# 1. Architectural principles

AIRA's billing architecture follows several strict principles.

## PostgreSQL is financial authority

PostgreSQL stores authoritative:

- plans
- plan versions
- prices
- subscriptions
- entitlements
- usage events
- usage aggregates
- cost events
- tenant economics
- invoices
- invoice items
- financial adjustments
- payments
- payment attempts
- refunds
- provider mappings
- webhook events
- reconciliation findings
- subscription change events

Redis and ClickHouse are not financial ledgers.

---

## Redis is runtime acceleration

Redis is used for:

- entitlement cache
- quota counters
- rate limits
- runtime billing cache
- idempotent/runtime acceleration

Redis loss must not cause permanent financial data loss.

PostgreSQL can reconstruct commercial state.

---

## ClickHouse is analytical

ClickHouse is intended for large-scale analytical workloads such as:

- long-term usage analytics
- tenant economics analysis
- product analytics
- operational cost analysis
- plan-level margin reporting
- large historical usage queries

ClickHouse does not define invoice truth.

---

## RabbitMQ is asynchronous transport

RabbitMQ is used for:

- billing events
- usage-event publication
- aggregation jobs
- webhook processing
- retries
- analytics projections

RabbitMQ does not become authoritative financial storage.

---

## Neo4j remains infrastructure topology storage

Neo4j continues to own infrastructure and dependency graph use cases.

It is not part of the financial ledger.

---

# 2. Payment providers

AIRA supports a provider-neutral payment architecture.

Current provider boundary:

- Razorpay
- Stripe

AIRA owns the canonical payment lifecycle.

Provider objects are external execution objects.

Examples:

- Razorpay Order
- Stripe PaymentIntent

Neither replaces the AIRA `billing.payments` record.

Current practical certification:

- Razorpay Test Mode integration validated
- Stripe adapter structurally implemented
- Stripe India live/test account certification deferred while new Indian accounts remain access restricted

---

# 3. Commercial flow

```text
Customer
   |
   v
Plan
   |
   v
Plan Version
   |
   v
Price
   |
   v
Subscription
   |
   v
Entitlement Engine
   |
   +---- capability access
   |
   +---- quota limits
   |
   v
AIRA Product Activity
   |
   v
Usage Meter
   |
   v
Immutable PostgreSQL Usage Ledger
4. Billing flow
Subscription
     +
Usage
     +
Overage rates
     |
     v
Invoice Engine
     |
     +-- Subscription lines
     +-- Usage lines
     +-- Debit adjustments
     +-- Discounts
     +-- Credits
     +-- Tax reservation
     |
     v
Finalized Invoice
     |
     v
Canonical AIRA Payment
     |
     v
Provider Attempt
     |
     +----------+
     |          |
     v          v
 Razorpay     Stripe
     |          |
     +----+-----+
          |
          v
Signed Webhook
          |
          v
AIRA Payment State
          |
          v
Invoice Settlement
5. Canonical payment lifecycle
REQUIRES_PAYMENT
       |
       v
PROCESSING
   |    |    |
   v    v    v
SUCCESS FAILED CANCELLED

Successful payments are financially immutable.

Duplicate provider success events must not double-pay an invoice.

6. Usage metering

AIRA meters product and infrastructure activity including:

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

Meters are useful both for billing and unit economics.

Not every meter must be billable.

7. Internal cost attribution

AIRA tracks its own COGS independently from customer pricing.

Cost categories include:

LLM
compute
database
storage
network
vector
notifications
payment processing
other

Customer revenue and internal cost are intentionally separate domains.

8. Tenant economics

AIRA can calculate:

Revenue
   -
Internal COGS
   =
Gross Profit

And:

Gross Profit / Revenue
   =
Gross Margin

This allows future reporting such as:

revenue per tenant
LLM cost per tenant
infrastructure cost per tenant
recovery cost per incident
margin by plan
margin by customer
margin by period
9. Financial corrections

Finalized invoices are never silently rewritten.

Corrections use explicit:

credits
fixed discounts
percentage discounts
debit adjustments
credit adjustments

The application of each financial adjustment is durably recorded.

10. Webhook security

Payment webhooks use:

raw HTTP request bodies
provider signatures
provider event IDs
durable PostgreSQL ingestion
replay protection
bounded retries
asynchronous processing

Razorpay webhook verification uses HMAC-SHA256 against the exact raw body.

Browser payment-success callbacks are not financial authority.

11. Reconciliation

Webhooks are not assumed to be perfect.

AIRA actively supports reconciliation for:

stale processing payments
missed provider events
failed webhook replay
payment / invoice drift
subscription state drift
suspicious provider discrepancies

Reconciliation findings are classified as:

MATCH
REPAIRABLE_DRIFT
SUSPICIOUS_DRIFT
ORPHAN_PROVIDER_OBJECT
STALE_PROCESSING
FAILED_WEBHOOK
SUBSCRIPTION_DRIFT

Suspicious financial discrepancies require manual review.

12. Financial invariants

Phase 15 freezes the following invariants.

Money

Financial values use integer minor currency units.

Examples:

USD 100 = $1.00
INR 100 = ₹1.00

Floating-point financial ledger values are prohibited.

Usage

billing.usage_events is immutable financial usage truth.

Costs

billing.cost_events is immutable internal-cost truth.

Invoices

Finalized invoice financial content and invoice items are immutable.

Payments

Succeeded payment financial identity is immutable.

Webhooks

Provider event identity and verified payload are immutable.

Reconciliation

Reconciliation may repair current operational state.

It may not rewrite historical usage or cost ledgers.

13. Database architecture
                    PostgreSQL
                         |
       +-----------------+------------------+
       |                 |                  |
       v                 v                  v
   Commercial          Usage             Finance
       |                 |                  |
 plans               usage_events       invoices
 prices              aggregates         payments
 subscriptions                          refunds
 entitlements                           adjustments
                                        webhooks
                                        reconciliation


                    Redis
                       |
         entitlement + quota cache


                  RabbitMQ
                       |
              asynchronous events


                  ClickHouse
                       |
              analytical projection


                    Neo4j
                       |
          infrastructure dependency graph
14. Phase 15 implementation map
15.0–15.2

Commercial model and price architecture.

15.3–15.5

Subscriptions, entitlement engine and meter catalogue.

15.6–15.8

Immutable usage ledger, financial idempotency and aggregation.

15.9

Runtime entitlement and quota acceleration.

15.10

Autonomous-recovery billing boundary.

15.11

Product metering adapters.

15.12

AI and infrastructure cost attribution.

15.13

Tenant economics and gross margin.

15.14

Invoice engine.

15.15

Credits, discounts and adjustments.

15.16

Provider-neutral payment state machine.

15.17

Stripe and Razorpay adapters.

15.18

Signed payment webhook ingestion.

15.19

Billing reconciliation and subscription synchronization.

15.20

Financial security and architecture certification.

15. Phase completion

Phase 15 is considered complete when:

Every Phase 15 unit suite passes.
Phase 14 authorization regression passes.
PostgreSQL migrations through 0059 are present.
Razorpay Test Mode order creation works.
Signed webhook handling is deployed.
Duplicate payment success cannot double-settle an invoice.
Financial history is immutable.
Reconciliation detects and repairs controlled drift.
Redis and ClickHouse cannot become invoice authority.
Phase 15.20 certification suites pass.

At that point AIRA has a production-oriented billing, entitlement and financial-control foundation suitable for the next enterprise-product phase.


---

# 4. README completion section

At the end of your main:

```text
README.md

add:

---

## Phase 15 — Billing, Entitlements & Metering

**Status: COMPLETE**

AIRA Phase 15 introduces the enterprise commercial and financial platform.

Implemented capabilities include:

- versioned commercial plans and pricing
- USD / INR price books
- tenant subscriptions
- capability entitlements
- runtime quotas
- immutable usage metering
- usage aggregation
- autonomous-recovery metering
- AI / infrastructure cost attribution
- tenant unit economics
- gross margin calculation
- invoice generation
- credits and discounts
- financial adjustments
- provider-neutral payment lifecycle
- Razorpay integration
- Stripe provider architecture
- signed payment webhooks
- webhook replay protection
- payment reconciliation
- subscription synchronization
- financial security certification

### Financial architecture

```text
Plan
  ↓
Price
  ↓
Subscription
  ↓
Entitlements / Quotas
  ↓
AIRA Usage
  ↓
Immutable Usage Ledger
  ↓
Invoice
  ↓
Payment
  ↓
Razorpay / Stripe
  ↓
Signed Webhook
  ↓
Canonical Settlement
  ↓
Reconciliation

PostgreSQL remains the authoritative transactional and financial datastore.

Redis provides runtime entitlement/quota acceleration.

RabbitMQ provides asynchronous event delivery.

ClickHouse is reserved for large-scale analytical workloads.

Neo4j remains the infrastructure/dependency graph database

16. Final Razorpay architecture check

The end-to-end path you have now is:

                  CUSTOMER
                      │
                      ▼
                 AIRA Invoice
                      │
                      ▼
                AIRA Payment
                      │
                      ▼
             Razorpay Test Order
                      │
                      ▼
               Razorpay Checkout
                      │
                      ▼
               signed webhook
                      │
              HMAC raw-body check
                      │
            ┌─────────┴─────────┐
            │                   │
         INVALID              VALID
            │                   │
            ▼                   ▼
          reject        webhook ledger
                                │
                                ▼
                        provider mapping
                                │
                                ▼
                       payment attempt
                                │
                     ┌──────────┴──────────┐
                     ▼                     ▼
                 SUCCEEDED               FAILED
                     │
                     ▼
                  Invoice
                     │
                     ▼
                    PAID
                     │
                     ▼
              reconciliation

That is a solid provider-neutral financial boundary.

17. Final Phase 15 architecture

After certification:

                         AIRA
                          │
                          ▼
                     CUSTOMER
                          │
                          ▼
                    ORGANIZATION
                          │
                          ▼
                         PLAN
                          │
                          ▼
                       PRICE
                          │
                          ▼
                    SUBSCRIPTION
                          │
                          ▼
                 ENTITLEMENT ENGINE
                    │           │
                    ▼           ▼
               Capability      Quota
                    │           │
                    └─────┬─────┘
                          ▼
                    AIRA ACTIVITY
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
              USAGE              COST
                 │                 │
                 ▼                 ▼
        PostgreSQL Ledger   PostgreSQL Ledger
                 │                 │
                 └────────┬────────┘
                          ▼
                  TENANT ECONOMICS
                          │
                          ▼
                       INVOICE
                          │
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
       Discount          Credit        Adjustment
          │               │                │
          └───────────────┼────────────────┘
                          ▼
                     FINAL TOTAL
                          │
                          ▼
                    AIRA PAYMENT
                          │
                          ▼
                 PROVIDER ADAPTER
                    │           │
                    ▼           ▼
                Razorpay      Stripe
                    │
                    ▼
               Signed Webhook
                    │
                    ▼
               Payment State
                    │
                    ▼
              Invoice Settlement
                    │
                    ▼
                Reconciliation

And the data architecture remains:

PostgreSQL
    └── transactional + financial truth

Redis
    └── entitlement/quota/runtime acceleration

RabbitMQ
    └── asynchronous domain transport

ClickHouse
    └── large-scale analytics

Neo4j
    └── infrastructure/dependency graph
Phase 15 final status

Once the two new certification suites and the full regressions pass:

15.0   Commercial model reconciliation            ✅
15.1   Commercial catalogue                       ✅
15.2   USD / INR pricing                          ✅
15.3   Subscription lifecycle                     ✅
15.4   Entitlement engine                         ✅
15.5   Meter catalogue                            ✅
15.6   Immutable usage ledger                     ✅
15.7   Financial idempotency                      ✅
15.8   Usage aggregation                          ✅
15.9   Runtime entitlement / quota                ✅
15.10  Autonomous recovery billing boundary       ✅
15.11  Product metering adapters                  ✅
15.12  AI + infrastructure cost attribution       ✅
15.13  Tenant economics                           ✅
15.14  Invoice engine                             ✅
15.15  Credits / discounts / adjustments          ✅
15.16  Payment state machine                      ✅
15.17  Stripe / Razorpay provider architecture    ✅
15.18  Signed webhook processing                  ✅
15.19  Reconciliation / subscription sync         ✅
15.20  Financial security certification           ← FINAL


AIRA Organization
       │
       ▼
Plan + Plan Version
       │
       ├──────────────► Price (USD / INR)
       │
       ▼
Subscription
       │
       ▼
Entitlement Engine
       │
       ├── capability access
       ├── quotas
       └── limits
       │
       ▼
AIRA Runtime
       │
       ├── Usage Events ────────────────┐
       │                                │
       └── Cost Events ─────────────┐   │
                                    ▼   ▼
                              Tenant Economics
                                    │
                                    ▼
                              Usage Aggregation
                                    │
                                    ▼
                                  Invoice
                                    │
                             ┌──────┴──────┐
                             ▼             ▼
                          Credits       Amount Due
                                           │
                                           ▼
                                  Payment Provider
                                    │           │
                                Razorpay      Stripe*
                                    │           │
                                    └─────┬─────┘
                                          ▼
                                   Payment Attempt
                                          │
                                          ▼
                                  Verified Webhook
                                          │
                                          ▼
                                  Payment Finalized
                                          │
                                          ▼
                                    Reconciliation
                                          │
                                  ┌───────┴────────┐
                                  ▼                ▼
                               MATCHED          FINDING