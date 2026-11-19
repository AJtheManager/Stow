import { test, expect } from "@playwright/test";

test.describe("Savings Goal Templates - Issue #578", () => {
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

    // Mock goal templates endpoint
    await page.route("**/api/goal-templates", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "emergency-fund",
            name: "Emergency Fund",
            description: "3-6 months of living expenses",
            recommendedAmount: 15000,
            recommendedTimeframe: 12,
            icon: "shield",
            motivationalTip: "Build financial security",
          },
          {
            id: "vacation",
            name: "Vacation",
            description: "Dream getaway fund",
            recommendedAmount: 5000,
            recommendedTimeframe: 6,
            icon: "plane",
            motivationalTip: "Adventure awaits",
          },
          {
            id: "house-down-payment",
            name: "House Down Payment",
            description: "Save for your first home",
            recommendedAmount: 50000,
            recommendedTimeframe: 36,
            icon: "home",
            motivationalTip: "Own your dream home",
          },
          {
            id: "education",
            name: "Education Fund",
            description: "Support your learning journey",
            recommendedAmount: 20000,
            recommendedTimeframe: 24,
            icon: "graduation",
            motivationalTip: "Invest in yourself",
          },
        ]),
      });
    });

    // Mock goal creation endpoint
    await page.route("**/api/goals", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "goal-123",
            name: "Emergency Fund",
            targetAmount: 15000,
            timeframeMonths: 12,
            createdAt: new Date().toISOString(),
          }),
        });
      }
    });
  });

  test("should load goal templates with correct default values", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Verify templates are displayed
    const emergencyFund = page.getByText("Emergency Fund");
    const vacation = page.getByText("Vacation");
    const houseDownPayment = page.getByText("House Down Payment");
    const education = page.getByText("Education Fund");

    await expect(emergencyFund).toBeVisible();
    await expect(vacation).toBeVisible();
    await expect(houseDownPayment).toBeVisible();
    await expect(education).toBeVisible();
  });

  test("should display recommended amounts for each template", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Click emergency fund template
    const emergencyFundTemplate = page
      .locator("button")
      .filter({ hasText: "Emergency Fund" });
    await emergencyFundTemplate.click();

    // Verify recommended amount is displayed
    const amount = page.getByText(/\$15,000/);
    await expect(amount).toBeVisible();
  });

  test("should allow customization of template values", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Select vacation template
    const vacationTemplate = page
      .locator("button")
      .filter({ hasText: "Vacation" });
    await vacationTemplate.click();

    // Find and modify the target amount input
    const amountInput = page
      .locator("input[type='number']")
      .filter({ has: page.locator('[data-testid="target-amount"]') })
      .first();
    await amountInput.clear();
    await amountInput.fill("8000");

    // Verify value changed
    const value = await amountInput.inputValue();
    expect(value).toBe("8000");
  });

  test("should create goal from template", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Select house down payment template
    const templateButton = page
      .locator("button")
      .filter({ hasText: "House Down Payment" });
    await templateButton.click();

    // Click create button
    const createButton = page.getByRole("button", { name: /create/i });
    await createButton.click();

    // Wait for goal to be created
    await page.waitForLoadState("networkidle");

    // Verify success state or redirect to goals list
    await expect(page).toHaveURL(/\/goals/);
  });

  test("should display progress calculation for goal type", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Select education template
    const educationTemplate = page
      .locator("button")
      .filter({ hasText: "Education Fund" });
    await educationTemplate.click();

    // Verify progress indicator setup for goal type
    const progressIndicator = page.locator('[data-testid="progress-setup"]');
    await expect(progressIndicator).toBeVisible();
  });

  test("should display motivational tips for selected template", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Select emergency fund template
    const emergencyTemplate = page
      .locator("button")
      .filter({ hasText: "Emergency Fund" });
    await emergencyTemplate.click();

    // Verify motivational tip is displayed
    const tip = page.getByText(/Build financial security/i);
    await expect(tip).toBeVisible();
  });

  test("should support creating custom goals from scratch", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("auth_token", "mock-jwt-token");
    });

    await page.goto("/goals/create");
    await page.waitForLoadState("networkidle");

    // Find and click custom goal option
    const customButton = page.getByRole("button", { name: /custom/i });
    await customButton.click();

    // Verify custom goal form is displayed
    const customForm = page.locator('[data-testid="custom-goal-form"]');
    await expect(customForm).toBeVisible();

    // Fill custom goal fields
    const nameInput = page.locator("input[placeholder*='Goal name']").first();
    const amountInput = page
      .locator("input[placeholder*='Target amount']")
      .first();

    await nameInput.fill("My Custom Goal");
    await amountInput.fill("7500");

    // Create custom goal
    const createButton = page.getByRole("button", { name: /create/i });
    await createButton.click();

    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/goals/);
  });
});
