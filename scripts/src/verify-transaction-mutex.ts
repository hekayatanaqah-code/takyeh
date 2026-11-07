import assert from "node:assert/strict";
import { db, pool } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";

// Does not create fixtures or change business data. Verifies the provisioned
// development row-lock protocol through the CURRENT application's own driver.
let release!: () => void;
let acquired!: () => void;
const hold = new Promise<void>(resolve => { release = resolve; });
const entered = new Promise<void>(resolve => { acquired = resolve; });
let secondEntered = false;
const first = db.transaction(async tx => {
  await lockResource(tx, "verification", "shared-resource");
  acquired();
  await hold;
});
try {
  await Promise.race([entered, first]);
  const second = db.transaction(async tx => {
    await lockResource(tx, "verification", "shared-resource");
    secondEntered = true;
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(secondEntered, false);
  release();
  await Promise.all([first, second]);
  assert.equal(secondEntered, true);
  await assert.rejects(db.transaction(async tx => {
    await lockResource(tx, "verification", "rollback-resource");
    throw new Error("intentional-verification-rollback");
  }), /intentional-verification-rollback/);
  await db.transaction(tx => lockResource(tx, "verification", "rollback-resource"));
  console.log("Current driver: transaction locks serialize writers and release after commit/rollback. No business data changed.");
} finally {
  release();
  await first;
  await pool.end();
}
