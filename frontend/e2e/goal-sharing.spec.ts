import { test, expect } from "@playwright/test";

test.describe("Savings Goal Sharing - Issue #582", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "test@example.com",
        }),
      });
    });

    // Mock shared goal endpoint
    await page.route("**/api/goals/*/share", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            shareId: "share-abc123",
            shareUrl: "https://localhost:3000/share/abc123",
            createdAt: new Date().toISOString(),
          }),
        });
      }
    });

    // Mock public goal view (no auth required)
    await page.route("**/api/goals/share/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          goalName: "Emergency Fund",
          targetAmount: 5000,
          currentAmount: 3500,
          progressPercent: 70,
          viewCount: 42,
        }),
      });
    });
  });

  test("should generate shareable link for goal", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/1");
    await page.waitForLoadState("networkidle");

    // Click share button
    const shareButton = page.getByRole("button", { name: /share/i }).first();
    await shareButton.click();

    // Verify shareable link is generated
    const shareUrl = page.locator("input[readonly]").first();
    await expect(shareUrl).toBeVisible();
    const urlValue = await shareUrl.inputValue();
    expect(urlValue).toContain("share/");
  });

  test("should display goal progress on public view without auth", async ({
    page,
  }) => {
    // Access shared goal directly without authentication
    await page.goto("/share/abc123");
    await page.waitForLoadState("networkidle");

    // Verify progress is visible
    const goalName = page.getByText("Emergency Fund");
    const progressPercent = page.getByText(/70%/);

    await expect(goalName).toBeVisible();
    await expect(progressPercent).toBeVisible();
  });

  test("should hide sensitive information on public view", async ({ page }) => {
    await page.goto("/share/abc123");
    await page.waitForLoadState("networkidle");

    // Verify sensitive info is hidden
    const accountDetails = page.locator('[data-testid="account-details"]');
    const bankInfo = page.locator('[data-testid="bank-info"]');

    await expect(accountDetails).not.toBeVisible();
    await expect(bankInfo).not.toBeVisible();
  });

  test("should display view count on shared goal", async ({ page }) => {
    await page.goto("/share/abc123");
    await page.waitForLoadState("networkidle");

    // Verify view count is displayed
    const viewCount = page.getByText(/views: 42/i);
    await expect(viewCount).toBeVisible();
  });
});
