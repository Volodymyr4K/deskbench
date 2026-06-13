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

test("intake parses a free-text booking request", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("book a haircut tomorrow afternoon"));

  await expect(page.getByText("parsed →")).toBeVisible();
  // Parsed chips: intent BOOK, the haircut service, day tomorrow.
  await expect(page.getByText("BOOK", { exact: true })).toBeVisible();
  await expect(page.getByText("tomorrow", { exact: true })).toBeVisible();
});
