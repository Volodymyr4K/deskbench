import { test, expect, type Page } from "@playwright/test";

// End-to-end coverage of the operator booking flow against a real browser and
// the test database. Locks in the mutations (book / cancel / reschedule) that
// were previously only verified by hand.

/** Navigate to a day that has at least one bookable slot (skips closed days). */
async function gotoDayWithSlots(page: Page) {
  await page.goto("/");
  for (let i = 0; i < 8; i++) {
    if ((await page.locator('a[href*="cStaff="]').count()) > 0) return;
    await page.getByRole("link", { name: "Next day" }).click();
  }
  throw new Error("no bookable day found within a week");
}

test("operator books a slot and captures the client", async ({ page }) => {
  const client = `E2E Buyer ${Date.now()}`;
  await gotoDayWithSlots(page);

  await page.locator('a[href*="cStaff="]').first().click();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toBeVisible();

  await page.locator('input[name="clientName"]').fill(client);
  await page.locator('input[name="clientPhone"]').fill("+380501110011");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  // After the redirect the new appointment shows on the board with the client.
  await expect(page.getByText(client)).toBeVisible();
});

test("operator cancels an appointment", async ({ page }) => {
  const client = `E2E Cancel ${Date.now()}`;
  await gotoDayWithSlots(page);

  await page.locator('a[href*="cStaff="]').first().click();
  await page.locator('input[name="clientName"]').fill(client);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  const row = page.locator("li", { hasText: client });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "cancel" }).click();

  await expect(page.getByText(client)).toHaveCount(0);
});

test("operator reschedules an appointment to a new slot", async ({ page }) => {
  const client = `E2E Move ${Date.now()}`;
  await gotoDayWithSlots(page);

  // Book it first.
  await page.locator('a[href*="cStaff="]').first().click();
  await page.locator('input[name="clientName"]').fill(client);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  const row = page.locator("li", { hasText: client });
  await expect(row).toBeVisible();
  const before = (await row.locator("span.tabular-nums").first().textContent())?.trim();

  // Enter reschedule mode and pick the first "move here" slot (the appointment's
  // own slot stays busy, so the first free target is a different time).
  await row.getByRole("link", { name: "move" }).click();
  await expect(page.getByText("Rescheduling")).toBeVisible();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();

  // The "move here" submit is a server action (fetch + soft refresh), so wait
  // for the board to leave reschedule mode before reading the new time.
  await expect(page.getByText("Rescheduling")).toHaveCount(0);

  const movedRow = page.locator("li", { hasText: client });
  await expect(movedRow).toBeVisible();
  const after = (await movedRow.locator("span.tabular-nums").first().textContent())?.trim();
  expect(after).not.toBe(before);
});

test("rejects a tampered out-of-hours booking server-side", async ({ page }) => {
  const client = `E2E Tamper ${Date.now()}`;
  await gotoDayWithSlots(page);
  await page.locator('a[href*="cStaff="]').first().click();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toBeVisible();

  // Tamper the hidden start time to a future but out-of-hours instant
  // (01:00 UTC ≈ 03:00–04:00 in Europe/Kyiv, before the 09:00 open). The UI would
  // never offer this; the server action must reject it anyway.
  const bad = new Date();
  bad.setUTCDate(bad.getUTCDate() + 2);
  bad.setUTCHours(1, 0, 0, 0);
  await page
    .locator('input[name="startISO"]')
    .evaluate((el, v) => ((el as HTMLInputElement).value = v), bad.toISOString());
  await page.locator('input[name="clientName"]').fill(client);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  // Rejected: the client must not appear anywhere on the board.
  await expect(page.getByText(client)).toHaveCount(0);
});

test("intake parses a free-text booking request", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("book a haircut tomorrow afternoon"));

  await expect(page.getByText("parsed →")).toBeVisible();
  // Parsed chips: intent BOOK, the haircut service, day tomorrow.
  await expect(page.getByText("BOOK", { exact: true })).toBeVisible();
  await expect(page.getByText("tomorrow", { exact: true })).toBeVisible();
});
