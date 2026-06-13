import { execSync } from "node:child_process";

// Prepare an isolated test database for the e2e run: apply migrations and seed
// the demo data. Kept separate from the dev database so e2e bookings/cancels
// never touch real demo state.

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://v4kozachok@localhost:5432/deskbench_test?schema=public";

const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };

console.log(`e2e: preparing test database`);
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
console.log(`e2e: test database ready`);
