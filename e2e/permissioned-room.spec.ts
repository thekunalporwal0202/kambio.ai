import { expect, test } from "@playwright/test";

/**
 * The permissioned room, end to end.
 *
 * Three parties open the same shipment through three different doors and see
 * three different things. The assertions that matter are the negative ones:
 * a document appearing where it should not is the failure mode this whole
 * product exists to prevent.
 *
 * Assumes the app is running and seeded (`npm run db:seed`).
 */

const EMAIL = "ops@meridiantextiles.example";
const PASSWORD = "kambio-demo";

test("the CHA sees the checklist and the shipping bill", async ({ page }) => {
  await page.goto("/p/demo-cha-clearline");

  await expect(page.getByText("KMB-2026-003")).toBeVisible();
  await expect(page.getByText("Scoped access")).toBeVisible();

  // Each row shows the file name and, under it, the document-type label — so
  // match the first of each rather than asserting a single node.
  await expect(page.getByText("Checklist").first()).toBeVisible();
  await expect(page.getByText("Shipping bill").first()).toBeVisible();
  await expect(page.getByText("Phytosanitary certificate").first()).toBeVisible();
});

test("the forwarder gets the shipping bill but never the CHA's checklist", async ({ page }) => {
  await page.goto("/p/demo-fwd-seabridge");

  await expect(page.getByText("KMB-2026-003")).toBeVisible();
  await expect(page.getByText("Shipping bill").first()).toBeVisible();
  await expect(page.getByText("BL draft").first()).toBeVisible();

  // The wall. The checklist is exporter↔CHA working paper.
  await expect(page.getByText("Checklist")).toHaveCount(0);
});

test("the buyer never sees the shipping bill or the checklist", async ({ page }) => {
  await page.goto("/s/demo-buyer-atlas");

  await expect(page.getByText("KMB-2026-003")).toBeVisible();
  // What they are entitled to.
  await expect(page.getByText("Phytosanitary certificate").first()).toBeVisible();
  await expect(page.getByText("BL draft").first()).toBeVisible();

  // What they are not. These are the two assertions the customer asked for.
  await expect(page.getByText("Shipping bill")).toHaveCount(0);
  await expect(page.getByText("Checklist")).toHaveCount(0);
});

test("the exporter sees everything, labelled with who it is hidden from", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL(/\/app$/, { timeout: 30_000 });

  await page.getByRole("link", { name: /KMB-2026-003/ }).first().click();
  await page.waitForURL(/\/app\/shipments\//, { timeout: 30_000 });

  // Everything is here — it is the exporter's room.
  await expect(page.getByText("Shipping bill").first()).toBeVisible();
  await expect(page.getByText("Checklist").first()).toBeVisible();

  // And every document says out loud who can and cannot see it.
  await expect(page.getByText(/hidden from Buyer/).first()).toBeVisible();
  await expect(page.getByText(/Shared with CHA/).first()).toBeVisible();
});

test("the dashboard shows who we are waiting on and can chase them", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL(/\/app$/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "Waiting on others" })).toBeVisible();
  await expect(page.getByText("BL draft v1").first()).toBeVisible();

  // The seed's request starts overdue, but a previous sweep may already have
  // chased it and re-armed the clock — so assert on either state, not on a
  // pristine database.
  await expect(page.getByText(/overdue|chase/).first()).toBeVisible();

  await page.getByRole("button", { name: /Run follow-up sweep now/ }).click();
  await expect(page.getByText(/pending request/)).toBeVisible({ timeout: 30_000 });
});
