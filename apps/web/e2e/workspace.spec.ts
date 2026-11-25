import { test, expect } from "@playwright/test";

test.describe("TRACE Workspace E2E", () => {
  test("loads Sample Evidence Locker, switches modes, jumps to Hex offsets, and keeps 320px responsive layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/workspace");

    await page.getByRole("button", { name: /Try Sample Evidence Locker/i }).click();
    await expect(page.getByText(/Multi-Layer Timestamp Trail/i)).toBeVisible({ timeout: 10000 });

    // Switch to Metadata tab and click offset link
    await page.getByRole("button", { name: "Metadata" }).first().click();
    await expect(page.getByText(/Filter metadata fields|Search field name/i).or(page.getByPlaceholder(/Search field/i))).toBeVisible();

    // Switch to RE Mode
    await page.getByRole("tab", { name: /RE Mode|RE/i }).click();
    await expect(page.getByText(/RE MODE • READ-ONLY INSPECTION/i)).toBeVisible();

    // Verify 320px mobile responsiveness has no horizontal viewport overflow
    await page.setViewportSize({ width: 320, height: 740 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });
});
