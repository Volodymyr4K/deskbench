import { defineConfig, devices } from "@playwright/test";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://v4kozachok@localhost:5432/deskbench_test?schema=public";
const PORT = process.env.E2E_PORT ?? "3300";
const BASE_URL = `http://localhost:${PORT}`;

// e2e runs against an isolated test DB (prepared by `tsx e2e/setup-db.ts`, run
// via the `e2e` npm script) on its own port. Workers = 1 because the tests
// mutate shared booking state.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, PORT },
  },
});
