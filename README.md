# Kambio

**An AI operating system for SME exporters.**

Every shipment is a **room**: a living workspace that captures documents and messages, keeps one
source of truth, and lets every counterparty take part **without installing anything** — buyers,
CHAs and forwarders keep using email and WhatsApp, and Kambio structures it.

Each party standing in that room sees a different slice of it. The buyer never sees the shipping
bill. The forwarder never sees the CHA checklist. That is not a setting — it is the product.

---

## The one feature that matters

The **zero-install counterparty loop**:

1. The exporter forwards a buyer email / PO into Kambio (or uploads a document).
2. Kambio auto-creates a **Shipment** and extracts PO number, line items, HS codes, incoterms,
   amounts and parties — each field carrying a **confidence score and the verbatim source line**.
3. Kambio drafts the reply and proposes the next action. The exporter confirms with one tap.
   **Nothing financially consequential is ever sent or committed by AI.**
4. When the buyer replies, Kambio interprets it ("approved Invoice v3", "change qty on line 4")
   and proposes a workspace update. The exporter confirms; the timeline advances.

A brand-new user reaches step 2 in well under 10 minutes — the demo seed gets you there in one.

## The second thing that matters: the relay

After the order is confirmed, an exporter's job is being a **human copy-paste bridge**. The CHA
sends a checklist; the exporter checks it and sends corrections back. The CHA files and returns a
shipping bill; the exporter forwards it to the forwarder, who issues a BL draft; the exporter
sends the draft to the buyer, takes the buyer's comments, and relays them back. Every hop is a
download, a re-upload and a retyped email — and every hop is an opportunity to send the wrong
document to the wrong party.

Kambio removes the copy-paste and keeps the walls:

- Ask a party to review a document; Kambio **refuses** if that party is not entitled to see it.
- When they ask for changes, Kambio drafts the onward message **to whoever can actually fix it**
  (customs paperwork → CHA, bills of lading → forwarder) and raises it as a blocker.
- The drafting model is only ever shown the documents the **recipient** may see.
- If nobody answers, Kambio chases them — capped, and it stops the moment they reply.

---

## Quick start

### Option A — Docker (one command)

```bash
cp .env.example .env
docker compose up --build
```

Postgres, Redis, the web app and the background worker all come up. Migrations and the demo
seed run automatically. Open <http://localhost:3000>.

### Option B — Local

Needs Node 22+ and a running Postgres.

```bash
npm install
cp .env.example .env          # defaults point at localhost:5432/kambio
npm run db:migrate            # create the schema
npm run db:seed               # demo org + 3 shipments
npm run dev                   # http://localhost:3000
```

Redis is optional locally: the default `QUEUE_DRIVER=inline` runs jobs in the web process. Set
`QUEUE_DRIVER=redis` and run `npm run worker` in a second terminal to use the real queue.

### Sign in

| | |
|---|---|
| Email | `ops@meridiantextiles.example` |
| Password | `kambio-demo` |

### Walk the magic moment

1. Sign in — the **command center** opens on *what needs you today*, exceptions first.
2. In **Turn a buyer email into a shipment**, click **Use sample PO**, then **Ingest email**.
3. Reload. A new shipment appears with extracted fields, each showing a confidence chip and the
   quoted source line. Low-confidence fields are amber and raise a blocker.
4. Open it, correct anything wrong, and hit **Confirm and apply to shipment** — only now do the
   values become shipment truth, and the correction is recorded.
5. The AI-drafted reply sits there marked **Draft — not sent** until you press send.
6. **ROI** in the nav shows hours saved and AI spend, with the arithmetic shown, not asserted.
7. Create a **buyer view** link and open it in a private window — live status, no signup.

### Walk the relay

The seed ships shipment **KMB-2026-003** as a fully populated room. Open these three links side
by side — they are the same shipment seen by three different parties:

| Link | Who | What they see |
|---|---|---|
| `/app/shipments/…` (KMB-2026-003) | You | Everything, each document tagged with its audience |
| `/p/demo-cha-clearline` | The CHA | Checklist, shipping bill, certificates, BL draft |
| `/p/demo-fwd-seabridge` | The forwarder | Shipping bill and BL draft — **no checklist** |
| `/s/demo-buyer-atlas` | The buyer | Certificates and BL — **no shipping bill, no checklist** |

Then:

1. In the exporter workspace, every document header shows who it is **shared with** and, in red,
   who it is **hidden from**. Try **Request review** on the shipping bill: the buyer is not in
   the list, because they cannot be.
2. Open the buyer link. The BL draft is waiting on them and has been for over a day.
3. Press **Run follow-up sweep now** on the dashboard. A chaser goes out and the ledger records
   it as a system action — not as an AI one.
4. Open `/p/demo-cha-clearline` and use **Request changes** on something. The buyer's words come
   back to the exporter as a drafted message addressed to the CHA, with a blocker task attached.

There is nothing to configure for any of this: `AI_PROVIDER=mock` needs no key and no network,
and `EMAIL_PROVIDER=mock` logs mail to the console instead of sending it.

---

## Architecture

### Event-sourced shipment ledger

`Event` is append-only and is **the source of truth**. Every other shipment-scoped table is a
projection kept in step inside the same transaction that appends the event.

```
command → appendEvent() ──┬─→ Event row      (immutable, seq-numbered per shipment)
                          └─→ Shipment row   (read model, folded from the same event)
```

- `src/server/domain/events.ts` — the event vocabulary, each payload a Zod schema. Payloads are
  validated *before* they reach the ledger, so a bad write is impossible rather than unlikely.
- `src/server/domain/projection.ts` — a **pure** fold (`applyEvent`) plus the status state
  machine. No database access, which is why it is exhaustively unit tested.
- `src/server/domain/ledger.ts` — `appendEvent`, `projectFromLedger` and `rebuildShipment`.
  `(shipmentId, seq)` is unique, so two concurrent appends can't collide silently; the loser
  retries with the next slot.

Because the projection is disposable, `rebuildShipment()` can reconstruct it from history at any
time — there is a test that corrupts a row and rebuilds it.

### Model-agnostic AI gateway

Nothing outside `src/server/ai/providers/` imports a vendor SDK.

```
ai.extractDocument() ─→ gateway ─→ provider (mock | anthropic | openai) ─→ AiCall row (cost)
```

- One interface, three implementations. Swap with `AI_PROVIDER`, or per task with
  `AI_PROVIDER_EXTRACT_DOCUMENT` / `_CLASSIFY_MESSAGE` / `_DRAFT_REPLY` — a cheap model for
  classification and a strong one for extraction is a config change.
- Every call writes an `AiCall` row with tokens, latency and **cost attributed per shipment**.
- A misconfigured provider degrades to `mock` and logs loudly rather than taking the app down.
- The active provider is shown in the app header, so an operator always knows who answered.

**The mock provider is a real rules-based extractor, not a canned blob.** It responds to whatever
you actually paste and quotes genuine source snippets, with some confidences deliberately below
the review threshold so the human-in-the-loop path is exercised in the demo.

### Provenance and human-in-the-loop

Every AI output carries `confidence` plus a **verbatim `sourceSnippet`**, surfaced in the UI as a
hoverable chip. Fields below `EXTRACTION_REVIEW_THRESHOLD` (default 0.85) raise a blocking task.

The boundaries are enforced in code, not convention:

- `decideApproval()` throws if the actor is AI.
- `confirmExtraction()` throws if the actor is AI.
- `sendDraftedReply()` throws if the actor is AI — drafts sit unsent until a human presses send.
- `advanceStatus()` is the only path to a status change and validates the state machine.

### The permissioned room

`src/server/domain/visibility.ts` holds one table, and it is the business rule:

| Document | Exporter | CHA | Forwarder | Buyer |
|---|:--:|:--:|:--:|:--:|
| Checklist | ● | ● | | |
| Shipping bill | ● | ● | ● | |
| Fumigation / phytosanitary / origin cert | ● | ● | | ● |
| BL draft, Bill of lading | ● | ● | ● | ● |
| Commercial invoice, Packing list | ● | ● | | ● |
| Purchase order, Final doc set | ● | | | ● |
| *Unclassified* | ● | | | |

An unclassified document is exporter-only: the policy **fails closed**, and so does a row whose
`visibleTo` is empty. The same table is read two ways — `canSeeDocument()` for a single document
and `visibilityWhere()` as a Prisma filter — and a test asserts the two never disagree, because a
drift between them is exactly what a leak looks like.

Enforcement is not advisory:

- Reads go through `visibleDocuments()`, which filters by the viewer's party type.
- The buyer link (`/s/<token>`) applies the importer filter at the query, so a confirmed shipping
  bill simply is not in the result set.
- `requestReview()` throws rather than ask a party to review something they may not see.
- Re-classification re-applies the policy: an unlabelled upload recognised as a checklist stops
  being buyer-visible the moment extraction finishes.

Participation is the exporter's choice, per counterparty: a **scoped guest link** (`/p/<token>`,
zero install, the default), a **real account** (`PARTNER` role, scoped to their own parties), or
neither and it stays pure email relay. All three land on the same room and see the same slice.

The CHA is a standing `Counterparty` (`isDefault`) that attaches to new shipments; the forwarder
is chosen per shipment, because in real life it changes every sailing.

### One thread per shipment, per party

An exporter should never have to hunt across five subject lines for one shipment. Every message
Kambio sends a party goes into a single RFC 5322 chain: a stable reference-prefixed subject
(`[KMB-2026-003] …`), `In-Reply-To` and an accumulated `References` header, tracked on
`EmailThread` with `@@unique([shipmentId, partyId])`. Replies land back on the same shipment via
a per-shipment reply-to address (`ship+<token>@…`).

`EMAIL_PROVIDER=resend` is the real-provider path; `mock` logs to the console.

### Follow-ups — the one narrow auto-send exception

`sweepFollowUps()` finds review requests that are overdue and unanswered, drafts a chaser, and —
when `FOLLOWUP_AUTO_SEND=true` — sends it without a human. That is a deliberate exception to
"AI drafts, humans send", and it is narrow by construction:

- a chaser makes **no commitment** — no price, no date, no approval;
- it is capped at `FOLLOWUP_MAX`, after which the shipment is escalated to a human as a blocker;
- it stops the instant the party responds, and never runs on a closed or cancelled shipment;
- every send is an event on the ledger, attributed to the **system**, not to a model;
- setting `FOLLOWUP_AUTO_SEND=false` turns the whole thing into drafts plus tasks.

The sweep is idempotent in effect: it advances `dueAt` and `reminderCount` as it goes, so running
it twice in a minute sends nothing the second time. The worker runs it every 15 minutes; an
external scheduler can hit `POST /api/cron/followups` with `CRON_SECRET` instead.

### Integration layer

| Concern | Interface | Drivers |
|---|---|---|
| AI | `AiProvider` | `mock`, `anthropic`, `openai` (any OpenAI-compatible endpoint) |
| OCR | `OcrProvider` | `mock` (native text + PDF text-layer salvage), Textract/GCV seams |
| Storage | `StorageDriver` | `local`, `s3` (AWS, MinIO, R2) |
| Queue | `QueueDriver` | `inline`, `redis` (BullMQ) |
| Outbound | `deliver()` | mock, **Resend**, Postmark, SendGrid, WhatsApp Cloud API |

Inbound email accepts a generic payload plus Postmark's and SendGrid's shapes, so changing
provider is configuration. Inbound routing is explicit and ordered — per-shipment address →
quoted reference → known counterparty → new shipment — and the reason is returned to the caller
rather than being a black box.

### Tenant isolation

`tenantDb(orgId)` is a Prisma client extension that rewrites **every** query on a tenant-scoped
model: `orgId` is merged into `where`, forced onto `data`, and a write naming a different org
throws `TenantViolationError`. A call site that forgets to filter still cannot read or write
another tenant's rows. The seed creates a second org, and the tests assert the boundary from both
sides.

### Async jobs

`document.extract` and `message.interpret` run through the queue. Both handlers are idempotent —
re-extracting a confirmed document and re-interpreting a classified message are no-ops — and
inbound ingestion dedupes on `(channel, externalId)` so webhook retries are safe. The web process
and the worker register handlers from the same module, so the two cannot drift.

---

## Testing

```bash
npm test          # 83 unit + integration tests (vitest)
npm run test:e2e  # Playwright: the magic moment, end to end
npm run typecheck
```

- **Domain tests** cover the pure fold, determinism, the status machine and payload validation.
- **Integration tests** cover ledger sequencing under concurrent appends, replay equality between
  the ledger and the read model, projection rebuild, and six tenant-isolation properties. They
  skip themselves automatically when Postgres is unreachable.
- **Visibility tests** are the ones to read first. They are written as flat statements about the
  real world — *never shows the buyer the shipping bill* — because if one fails, a document has
  reached someone who should never have had it.
- **Relay tests** drive the loop against a real database: a review request is refused when it
  would leak, a buyer's change request produces a draft addressed to the CHA, and the follow-up
  sweep chases, re-arms, caps, escalates, and goes quiet the moment the party answers.
- **E2E** drives the real magic moment (sign in → ingest an email → extraction appears with
  confidence and source → human confirms → status advances → ledger reflects it) and then opens
  the same seeded shipment through all four doors, asserting that the forwarder's room contains
  no checklist and the buyer's contains neither the shipping bill nor the checklist.

The e2e assumes the app is already running and seeded. In a sandbox that ships its own browser,
set `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`. Traces are off by default because Playwright's
trace instrumentation interferes with Next's dev-mode server actions; enable with `PW_TRACE=1`
against a production build.

---

## Configuration

Every key is documented in [`.env.example`](.env.example). The defaults are chosen so the app
runs **fully offline with no API keys**: mock AI, local disk storage, in-process queue.

The settings you are most likely to change:

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `mock` | `mock` \| `anthropic` \| `openai` |
| `AI_MODEL` | `claude-opus-5` | |
| `EXTRACTION_REVIEW_THRESHOLD` | `0.85` | Below this, a field goes to human review |
| `QUEUE_DRIVER` | `inline` | `redis` for a real worker |
| `STORAGE_DRIVER` | `local` | `s3` for AWS/MinIO/R2 |
| `INBOUND_WEBHOOK_SECRET` | *(empty)* | **Set this in production** — empty means the inbound webhook is open |
| `EMAIL_PROVIDER` | `mock` | `resend` \| `postmark` \| `sendgrid`; `mock` logs instead of sending |
| `FOLLOWUP_AUTO_SEND` | `true` | `false` leaves every chaser as a draft with a task |
| `FOLLOWUP_MAX` | `3` | Chasers before the shipment is escalated to a human |
| `CRON_SECRET` | *(empty)* | Bearer token for `POST /api/cron/followups`; empty disables it |

`@aws-sdk/client-s3` is deliberately not a dependency; install it only if you set
`STORAGE_DRIVER=s3`.

---

## Project layout

```
prisma/schema.prisma        data model + the event ledger
prisma/seed.ts              demo org, 3 shipments, a full relay room, a second org
src/env.ts                  Zod-validated config with safe defaults
src/server/
  tenant.ts                 query-layer tenant isolation
  domain/                   events, ledger, projection, commands
    visibility.ts           WHO SEES WHAT — the policy table
    relay.ts                cross-party review + drafting, scoped to the recipient
    followups.ts            the capped, ledger-audited chaser
    portal.ts               scoped guest links and PARTNER accounts
  ai/                       gateway, prompts, providers
  ocr/ storage/ queue/      pluggable infrastructure
  integrations/             inbound routing/ingest, outbound delivery
  analytics/roi.ts          ROI derived from the ledger
src/app/
  (marketing)/              landing, pricing, contact, demo, legal
  app/                      the exporter workspace
  p/[token]/                the counterparty room (CHA, forwarder)
  s/[token]/                the read-only buyer view
  api/                      inbound webhooks, cron
worker/index.ts             BullMQ worker (same handlers as the web process)
```

---

## Deliberate non-goals

Trade finance, lending, payments, insurance, marketplace, supplier discovery, procurement,
customs filing, autonomous agents, digital twins, blockchain. **None of it is built.** The event
ledger is the clean extension point when any of it becomes real — it is already the audit trail
and the underwriting substrate.

## Known gaps

- **Real OCR is a seam, not an implementation.** Scanned PDFs need `OCR_PROVIDER=textract|gcv`,
  which throws today. Text documents and PDF text layers work.
- **Line-item provenance is per row, not per cell.** Field-level snippets are per field.
- **WhatsApp templates** are implemented but no template is registered; free-form sends only
  work inside Meta's 24-hour window.
- **Carrier tracking** (`TRACKING_PROVIDER`) is configured but not wired into the UI.
- **Buyer "graduation"** links to signup; claiming an existing `BuyerLink` into the new account
  is modelled (`claimedByUserId`) but not implemented.
- Roles exist (`OWNER`/`OPS`/`VIEWER`/`PARTNER`) but are not yet enforced per action.
- **The marketing site's pricing is placeholder.** The tiers and figures on `/pricing` were
  invented to fill the page and must be replaced with real numbers before it goes anywhere near
  a customer.
- **Guest links do not expire.** `portalToken` is revocable but has no TTL.
- Marketing leads are written to the `Lead` table but nothing reads it — no inbox, no CRM
  hand-off, no notification.
