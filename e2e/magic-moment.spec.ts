import { expect, test } from "@playwright/test";

/**
 * The magic moment, end to end:
 *   forward an email → shipment created → fields extracted with provenance
 *   → human confirms → status advances.
 *
 * Assumes the app is running and seeded (`npm run db:seed`).
 */

const EMAIL = "ops@meridiantextiles.example";
const PASSWORD = "kambio-demo";

// Unique per run: a repeat run must not be routed onto the previous run's
// shipment by the known-counterparty rule.
const RUN = `${Date.now().toString().slice(-7)}`;
const SENDER = `erik+${RUN}@lindqvist-nordic.example`;
const SUBJECT = `Purchase Order — e2e denim programme ${RUN}`;

const PO_BODY = `Hello Priya,

Please process the following order.

Purchase Order No: PO-E2E-${RUN}
Incoterm: CIF
Currency: USD
Payment terms: LC at sight

Description | HS Code | Qty | Unit Price | Amount
Indigo denim 12oz | 5209.42 | 6000 | 5.20 | 31200.00

Total: 31200.00
Port of loading: Nhava Sheva
Port of discharge: Gothenburg
ETD: 2026-10-05
ETA: 2026-11-02

Please confirm receipt.

Erik Lindqvist`;

test("forward an email, get structured data, confirm it, advance the shipment", async ({ page }) => {
  // --- sign in ------------------------------------------------------------
  await page.goto("/login");
  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "What needs you today" })).toBeVisible();

  // --- ingest a buyer email ----------------------------------------------
  await page.getByLabel("From").fill(SENDER);
  await page.getByLabel("Subject").fill(SUBJECT);
  await page.getByLabel("Email body").fill(PO_BODY);
  await page.getByRole("button", { name: "Ingest email" }).click();

  await expect(page.getByText(/Created shipment and queued extraction/)).toBeVisible({
    timeout: 30_000,
  });

  // --- open the new shipment ---------------------------------------------
  const shipmentLink = page
    .getByRole("link", { name: new RegExp(`e2e denim programme ${RUN}`) })
    .first();
  await expect(async () => {
    await page.reload();
    await expect(shipmentLink).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });

  await shipmentLink.click();
  await expect(page.getByRole("heading", { name: new RegExp(`e2e denim programme ${RUN}`) })).toBeVisible();

  // --- extraction lands, with confidence + verbatim source ---------------
  const poField = page.locator('input[name="field_poNumber"]');
  await expect(async () => {
    await page.reload();
    await expect(poField).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });

  await expect(poField).toHaveValue(/PO-E2E-\d+/);
  await expect(page.locator('input[name="field_incoterm"]')).toHaveValue("CIF");
  await expect(page.locator('input[name="field_destPort"]')).toHaveValue("Gothenburg");

  // Provenance is on screen, not just in the database.
  await expect(page.getByText(/confident/).first()).toBeVisible();
  await expect(page.getByText(/Purchase Order No/).first()).toBeVisible();

  // AI proposed a reply but has NOT sent it.
  await expect(page.getByText("Draft — not sent").first()).toBeVisible();

  // --- human confirms -----------------------------------------------------
  await page.getByRole("button", { name: /Confirm and apply to shipment/ }).click();
  await expect(page.getByText(/Confirmed/).first()).toBeVisible({ timeout: 20_000 });

  // Confirmed values reached the shipment record.
  await page.reload();
  await expect(page.getByText("Nhava Sheva").first()).toBeVisible();

  // --- status advances ----------------------------------------------------
  await page.getByRole("button", { name: /Move to PO confirmed/ }).click();
  await expect(page.getByText("PO confirmed").first()).toBeVisible({ timeout: 20_000 });

  // The ledger recorded the whole story.
  await expect(page.getByText(/Extraction complete/).first()).toBeVisible();
  await expect(page.getByText(/Extracted data confirmed/).first()).toBeVisible();
});

test("buyer magic link works with no signup", async ({ page }) => {
  await page.goto("/s/demo-buyer-nordwind");

  await expect(page.getByText("KMB-2026-001")).toBeVisible();
  await expect(page.getByText("Live shipment status")).toBeVisible();
  await expect(page.getByText("Hamburg")).toBeVisible();
  // The graduation path is offered, not forced.
  await expect(page.getByRole("link", { name: /Create free account/ })).toBeVisible();
});
