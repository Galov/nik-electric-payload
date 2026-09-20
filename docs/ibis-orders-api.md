# Ibis → NIK orders (implementation for review; not activated)

## Transport and authentication

`POST /api/integrations/ibis/orders` over HTTPS, JSON body and
`Authorization: Bearer <server-only key>`. Never embed the key in browser code.

The handler is disabled unless `IBIS_ORDERS_ENABLED=true`. It uses
`IBIS_ORDERS_BG_KEY` and `IBIS_ORDERS_RO_KEY` independently; configured keys must
be different. These are proposed deployment variables, not configured secrets.
No production configuration is changed by this branch. The existing deployment
workflow runs on main, not this feature branch. Do not merge/activate before approval.

A BG key accepts only `BG:` identifiers; an RO key accepts only `RO:` identifiers.
Both resolve exactly one NIK user with `partnerCode = "412"` on each new acceptance.
Missing or ambiguous matches fail closed. The user profile is not modified.

Read-only verification on 2026-09-20 found one matching user,
Ибис-Електроникс ЕООД, whose existing `priceTier` is `general`.
Ibis incoming orders explicitly use `priceGroup1`; normal checkout retains its
existing customer pricing rules.

## Request

```json
{
  "externalOrderId": "BG:123456",
  "items": [
    { "sku": "167MI07", "quantity": 1 }
  ]
}
```

RO uses the same URL and body structure with, for example, `RO:123456` and its own key.
Original source order IDs must remain stable on retries; preserve the prefix even
if the key is rotated. BG and RO send directly to NIK.

Only the displayed fields are accepted. Unknown fields at either level are rejected,
including prices, partner IDs, Microinvest IDs, addresses and customer personal data.

- `externalOrderId`: case-sensitive string matching
  `^(BG|RO):[A-Za-z0-9][A-Za-z0-9._:-]{0,124}$` (maximum 128 characters).
- `items`: 1–500 rows.
- `sku`: exact, case-sensitive string, 1–128 UTF-16 code units, no surrounding
  whitespace or ASCII control characters. No implicit case normalization.
- `quantity`: JSON number, safe positive integer, maximum 1,000,000 per row.
- Repeated SKU rows are rejected, not summed.
- All SKU matches must be unambiguous. Required product data: finite `stockQty`,
  positive safe-integer `miProductId`, finite positive `priceGroup1`.
- No wholesale/retail fallback for Ibis. Unit prices are snapshotted from group1.
  Currency is EUR, matching existing NIK checkout. Existing currency rounding is
  retained: line totals are rounded to two decimals, order amount is stored in cents,
  and Microinvest unit prices are exported to two decimals. No new VAT conversion is introduced.
- Insufficient stock on any valid row rejects the entire request. No partial order,
  transaction, stock change, key reservation or external call is committed.
- Publication and `backordersAllowed` do not override this stock check.

## Accepted response

New acceptance returns **201** only after the MongoDB transaction commits:

```json
{
  "orderId": "<NIK order ID>",
  "externalOrderId": "BG:123456",
  "replayed": false,
  "acceptanceStatus": "accepted",
  "microinvestExport": { "status": "sent" },
  "ibisStockSync": { "status": "sent" }
}
```

`accepted` means persisted in NIK with all stock reductions committed. It does not
mean customer payment, supplier fulfilment, or completed Microinvest stock movement.
Settlement remains offline. No customer cancellation or refund is triggered by this API.

Microinvest status: `pending | sending | sent | failed | unknown`.
BG stock sync status: `pending | sending | sent | failed`.
Either can be `unavailable` in the response if reading delivery status fails after
acceptance. This is a response-only fallback, not a stored state.

`sent` for Microinvest means HTTP 2xx acknowledgement under the existing contract; it does not prove a completed stock movement. For BG, every submitted item must have exactly one matching `updated` result. HTTP 200 alone is insufficient.

## Retries and conflicts

An identical accepted request returns **200**, the same `orderId`, `replayed: true`
and the current delivery statuses. It never reduces stock, reprices, sends email,
or re-exports to Microinvest. Item ordering is ignored when comparing requests.

```json
{
  "orderId": "<same NIK order ID>",
  "externalOrderId": "BG:123456",
  "replayed": true,
  "acceptanceStatus": "accepted",
  "microinvestExport": { "status": "unknown" },
  "ibisStockSync": { "status": "sent" }
}
```

A changed SKU set or quantity for an accepted ID returns **409**:

```json
{ "error": { "code": "IDEMPOTENCY_CONFLICT", "details": [] } }
```

Rejected pre-commit requests do not permanently occupy an ID. After manual review,
the sender may correct the rows and reuse that ID. For network failures/503, repeat
the same ID and body: acceptance may have committed before the response was lost.
Do not generate a new ID merely to retry. Bounded transaction contention can return
503; the sender should retry with backoff.

## Errors

All application error bodies have `{ "error": { "code": "...", "details": [] } }`.
Details contain only input indexes/SKUs and, for shortages, quantities. They never
contain upstream responses, credentials, customer data or database exceptions.

| HTTP | Codes |
| --- | --- |
| 400 | `INVALID_JSON`, `INVALID_REQUEST`, `INVALID_EXTERNAL_ORDER_ID`, `INVALID_ITEMS`, `INVALID_ITEM` |
| 401 | `UNAUTHORIZED` |
| 422 | `INVALID_SKU`, `DUPLICATE_ITEM_SKU`, `INVALID_QUANTITY`, `SKU_NOT_FOUND`, `SKU_AMBIGUOUS`, `INVALID_GROUP1_PRICE`, `PRODUCT_DATA_INCOMPLETE`, `INVALID_ORDER_TOTAL` |
| 409 | `INSUFFICIENT_STOCK`, `IDEMPOTENCY_CONFLICT` |
| 503 | `INTEGRATION_DISABLED`, `INTEGRATION_NOT_READY`, `PARTNER_NOT_FOUND`, `PARTNER_AMBIGUOUS`, `PARTNER_DATA_INCOMPLETE`, `IDEMPOTENCY_INDEX_UNAVAILABLE`, `TRANSACTIONS_UNAVAILABLE`, `TRANSACTION_ALREADY_ACTIVE`, `TEMPORARILY_UNAVAILABLE` |

Examples:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "details": [{ "sku": "167MI07", "requested": 2, "available": 1 }]
  }
}
```

```json
{
  "error": {
    "code": "INVALID_GROUP1_PRICE",
    "details": [{ "sku": "167MI07" }]
  }
}
```

A shortage keeps the customer order in BG/RO for manual agreement about partial
fulfilment or cancellation. This NIK response never authorizes an automatic refund.

## Persistence and delivery

`completeOrder` is shared by manual checkout and Ibis acceptance. It starts a real
MongoDB transaction and checks that the adapter has an active session. No
non-transactional fallback is allowed. All order/transaction/product/cart/key writes
use that session. `inventory` equals `stockQty`; `stockStatus` is not changed by sales.
Commit 3f87fae's manual endpoint override remains in place, so the ecommerce plugin
cannot perform a second inventory decrement.

`ibis-order-keys` has a required unique `externalOrderId`, fingerprint and order
relationship. The endpoint verifies the actual MongoDB unique index before use.
The key is committed in the same transaction as the order and stock writes. Old
orders without an external ID are unaffected. REST mutation of keys is denied;
Local API writes are restricted to authenticated server logic.

Inside the transaction, product HTTP hooks, order emails and category count
recalculation are suppressed. After commit, the existing `product.price_stock_updated`
payload is sent to BG with absolute committed quantities, then the existing
Microinvest order payload is sent. Each has an independent durable pending/sending/
result state and a 15-second HTTP timeout. Category counts and order emails run
only after commit. There is no worker, cron or new service.

The existing BG protocol still requires positive retail price and SKU. Missing
retail price never rejects a valid group1 order. Each failed item is recorded in
`ibisStockSyncResults` with product ID, SKU and safe error code; valid items continue.
BG results must match SKU and supplied sourceId exactly once and report `updated`.
`not_found`, `invalid`, missing/duplicate results and invalid response bodies fail.
The aggregate status is `sent` only when all order products succeed.

The proposed price-independent contract is documented in
[ibis-stock-only-proposal.md](ibis-stock-only-proposal.md). It is not implemented or
activated. BG→RO remains BG's responsibility. Concurrent absolute-stock updates
and stale Microinvest snapshots remain an existing limitation.

Administrative creation and duplication retain automatic Microinvest export and
order notifications. Their original Payload REST handlers run inside a real
transaction; dispatch happens only after commit. Administrative creation does not
reduce inventory. Checkout and Ibis retain their single transactional reduction.
Ordinary order edits do not trigger exports or duplicate failure notifications.

## Protected administrative recovery

`POST /api/orders/:id/delivery-action` requires a logged-in administrator. The order
form exposes the same actions. A non-empty `reason` (up to 2000 characters) and
`expectedAttemptId` (the currently displayed channel attempt UUID, or null for a
never-attempted order) are required. Stale/concurrent actions fail with 409.

- `send-mi`: allowed for `pending` or a proven `failed` / `before-send` result only.
- `confirm-mi-accepted`: after reconciliation, marks MI acceptance without sending.
- `authorize-mi-retry`: after reconciliation, changes MI to pending; a separate
  `send-mi` action is required to actually send.
- Both reconciliation actions require `reconciled: true` and an explanation. They
  apply to `unknown`, interrupted `sending` (older than 60 seconds), or legacy
  `failed` records without proof that HTTP had not started. They are never automatic.
- `retry-bg`: allowed for pending/failed or sending older than 60 seconds. It reads
  current absolute quantities from the order's product references, including zero.

Claims and immutable `order-delivery-actions` audit records commit together before
HTTP. Records identify the order, administrator, action, reason, attempt UUID and
creation time. Concurrent database write conflicts do not automatically retry.
Final writes match the sending attempt UUID, preventing a late response from
replacing a reconciled result. Generic REST updates cannot edit delivery fields.
Recovery creates neither orders nor stock movements.

MI timeout, network exception or non-2xx is `unknown`; configuration/payload errors
before fetch are `failed` with `before-send`. The winning failed attempt invokes
the existing administrative error email once, after its status is persisted.
Notification outcome is recorded separately. Normal edits never send it again.
A crash can leave `pending` notification or `sending` delivery for manual review;
there is no worker, cron, automatic email retry or promise of exactly-once email.
Delivery errors do not roll back acceptance. No production guard or secret changes.

## Isolated verification

The replica-set tests explicitly require `IBIS_TEST_DATABASE=local` and hard-code
`mongodb://127.0.0.1:27028/nik_ibis_orders_test?replicaSet=rs0`. They clear only this
fixture database; HTTP is mocked and email delivery is disabled. They exercise the
real Payload collection hooks, MongoDB commits, rollback and unique-index races.

```sh
docker run -d --name nik-ibis-orders-test-db -p 127.0.0.1:27028:27028 mongo:7 --replSet rs0 --port 27028 --bind_ip_all
docker exec nik-ibis-orders-test-db mongosh --port 27028 --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27028"}]})'
IBIS_TEST_DATABASE=local npm run test:int -- tests/int/ibis-orders.int.spec.ts tests/int/manual-checkout.int.spec.ts
```

Use a checkout without production `.env` files. Do not run the general API/e2e
suite against production credentials. Production activation and real external
order tests remain outside this PR's authorization.

## Verification results (2026-09-20)

- 42 targeted tests passed: 34 with a real isolated MongoDB replica set and 8
  checkout regression tests with mocked persistence. They cover acceptance, admin
  export, failure notification, recovery, concurrent claims, reconciliation,
  per-item BG results and current-stock retries.
- Concurrent identical requests and concurrent conflicting requests touching
  different products were tested, exercising both transaction conflicts and the
  unique-key constraint.
- Type generation and import-map generation include the recovery fields and component.
- TypeScript (`tsc --noEmit --incremental false`) and targeted ESLint passed.
- Production Next.js build passed. Existing repository lint warnings remain.
- Docker build is validated locally; no image is pushed and no deployment is run.

Senders should allow at least 60 seconds for the synchronous first attempt. If the
connection fails, retry the same ID and body; do not infer rejection from a timeout.
