/**
 * Seed the Morton Industries demo dataset into whatever DATABASE_URL points at.
 *
 *   npm run seed:demo
 *
 * Creates the demo users (cfo@, coo@, admin@demo.jeldi.app), the demo ERP connection, KPI
 * configurations, chart preferences, then runs a real sync so kpi_data and erp_snapshots are
 * populated. Safe to re-run. Forces DEMO_MODE=true for the duration of the script.
 */
process.env.DEMO_MODE = "true";

import { enforceEnvironmentValidation } from "../server/env-validation";
import { initializeAllDemoData, DEMO_USERS } from "../server/services/demo-data";
import { syncAll } from "../server/services/syncService";

async function main() {
  enforceEnvironmentValidation();
  await initializeAllDemoData();
  const results = await syncAll();
  for (const r of results) {
    console.log(`${r.ok ? "synced" : "FAILED"} ${r.erpSystem} for user ${r.userId}: ${r.message}`, r.counts ?? "");
  }
  console.log("\nDemo accounts:");
  for (const u of DEMO_USERS) console.log(`  ${u.email}  (${u.role})`);
  console.log(process.env.DEMO_USER_PASSWORD
    ? "Password: value of DEMO_USER_PASSWORD"
    : "Password: random for this run; set DEMO_USER_PASSWORD before seeding to make it known, or use the View Demo button (demo-login).");
  process.exit(results.some(r => !r.ok) ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
