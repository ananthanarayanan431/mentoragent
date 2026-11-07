import { defineConfig, devices } from '@playwright/test'

/**
 * Runs against the Docker stack (`make -C infra stack-up`, web on :8080) with the
 * mentors loaded (`mentor-agent load-mentors`). Nothing here sends a chat message,
 * so no model is called and no credits are spent.
 *
 * Locally it drives the installed Chrome; CI installs Playwright's Chromium.
 */
export default defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // WebGL without a GPU (CI runners, headless): SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /phone\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
    {
      name: 'phone',
      testMatch: /phone\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
})
