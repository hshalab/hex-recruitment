import { defineConfig, devices } from '@playwright/test'

/**
 * Standalone Playwright config for rendering branded email previews.
 * Separate from playwright.config.ts so it does NOT spin up the Next dev
 * server — these specs render email HTML offline via page.setContent().
 */
export default defineConfig({
  testDir: './e2e-emails',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
