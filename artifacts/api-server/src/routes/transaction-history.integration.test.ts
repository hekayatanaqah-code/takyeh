import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { pool } from "@workspace/db";
import { createSession, deleteSession } from "../lib/auth";
import app from "../app";

const prefix = `qa-ledger-${randomBytes(5).toString("hex")}`;
const external = `${prefix}-account`;
let owner = 0, ownerId = "", sid = "", origin = "", server: Server;
const providers: number[] = [], bookings: number[] = [];
async function query(text: string, args: unknown[] = []) { return (await pool.query(text, args)).rows; }
async function get(params = "") {
  const response = await fetch(`${origin}/api/owner/transaction-history${params}`, { headers: { Cookie: `sid=${sid}` } });
  return { status: response.status, rows: await response.json() as any };
}
function transactionHistoryTotals(rows: any[]) {
  const valid = rows.filter(row => row.status !== "cancelled");
  const sum = (type: string) => valid.filter(row => row.type === type).reduce((total, row) => total + Math.round(row.amount * 100), 0);
  const income = sum("income"), expenses = sum("expense") + sum("withdrawal"), refunds = sum("refund");
  return { income: income / 100, expenses: expenses / 100, refunds: refunds / 100,
    receivables: valid.filter(row => row.type === "income").reduce((total, row) => total + Math.round((row.remainingBalance ?? 0) * 100), 0) / 100,
    net: (income - expenses - refunds) / 100 };
}
before(async () => {
  owner = (await query(`INSERT INTO owner_applications(full_name,business_name,business_type,phone,email,password_hash,status)
    VALUES($1,$1,'chalet',$2,$3,'fixture-no-login','approved') RETURNING id`,
    [prefix, `05${Date.now().toString().slice(-8)}`, `${prefix}@example.invalid`]))[0].id;
  ownerId = `owner_${owner}`;
  await query("INSERT INTO owner_account_links(user_id,owner_application_id) VALUES($1,$2)", [external, owner]);
  sid = await createSession({ user: { id: external, email: `${prefix}@example.invalid`, firstName: prefix,
    lastName: null, profileImageUrl: null }, ownerApplicationId: owner, access_token: "owner_password_auth" });
  for (let i = 0; i < 2; i++) providers.push((await query(`INSERT INTO service_providers(owner_id,business_name,category,city,whatsapp_number)
    VALUES($1,$2,'cakes','اختبار','0500000000') RETURNING id`, [ownerId, `${prefix}-${i}`]))[0].id);
  for (const cancelled of [false, true]) bookings.push((await query(`INSERT INTO owner_bookings
    (owner_id,client_name,booking_date,total_price,deposit_paid,balance_collected,cancelled_at,cancel_refund_amount,insurance_fee,insurance_received)
    VALUES($1,$2,'2026-11-01',1000,$3,$6,$4,$5,500,true) RETURNING id`,
    [ownerId, prefix, cancelled ? 100 : 200, cancelled ? new Date() : null, cancelled ? 20 : 0, !cancelled]))[0].id);
  await query(`INSERT INTO booking_payments(owner_id,booking_id,amount,payment_date,method)
    VALUES($1,$2,150,'2026-11-01','cash')`, [ownerId, bookings[0]]);
  await query(`INSERT INTO owner_refunds(owner_id,booking_id,amount) VALUES($1,$2,10)`, [ownerId, bookings[0]]);
  for (const [index, deposit] of [150, 200].entries()) await query(`INSERT INTO service_appointments
    (provider_id,owner_id,client_name,date_str,amount,deposit,insurance_amount)
    VALUES($1,$2,$3,'2026-11-01',$4,$5,900)`, [providers[index], ownerId, prefix, index ? 200 : 300, deposit]);
  for (const [i, sale] of [{ amount: 125.75, method: "bank", status: "completed" }, { amount: 25.25, method: "cash", status: "completed" },
    { amount: 50, method: "bank", status: "cancelled" }].entries()) await query(`INSERT INTO quick_sales
      (owner_id,provider_id,provider_name,client_name,client_phone,date_str,items,total,payment_method,status,idempotency_key,request_hash)
      VALUES($1,$2,$3,$3,'0500000000','2026-11-01','[]'::jsonb,$4,$5,$6,$7,'fixture')`,
      [ownerId, providers[0], prefix, sale.amount, sale.method, sale.status, `${prefix}-${i}`]);
  for (const [category, amount, provider] of [["other", 30, providers[0]], ["salaries", 40, null], ["other", 10, null]]) {
    await query(`INSERT INTO owner_expenses(owner_id,category,amount,date_str,provider_id)
      VALUES($1,$2,$3,'2026-11-01',$4)`, [ownerId, category, amount, provider]);
  }
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (sid) await deleteSession(sid);
  if (ownerId) {
    for (const table of ["owner_refunds", "booking_payments", "quick_sales", "service_appointments", "owner_expenses", "owner_bookings"]) {
      await query(`DELETE FROM ${table} WHERE owner_id=$1`, [ownerId]);
    }
    await query("DELETE FROM service_providers WHERE owner_id=$1", [ownerId]);
    await query("DELETE FROM owner_account_links WHERE owner_application_id=$1", [owner]);
    await query("DELETE FROM owner_subscriptions WHERE owner_id=$1", [ownerId]);
    await query("DELETE FROM owner_applications WHERE id=$1 AND full_name=$2", [owner, prefix]);
  }
  await pool.end();
});
test("consolidated ledger discovers linked identities and all revenue sources once without insurance or cancelled sales", async () => {
  const result = await get();
  assert.equal(result.status, 200);
  assert.deepEqual(transactionHistoryTotals(result.rows), { income: 951, expenses: 80, refunds: 30, receivables: 800, net: 841 });
  assert.equal(result.rows.find((row: any) => row.id === `b-${bookings[0]}`).remainingBalance, 650);
  assert.equal(new Set(result.rows.map((row: any) => row.id)).size, result.rows.length);
  assert.ok(result.rows.some((row: any) => row.source === "service_booking"));
  assert.equal(result.rows.filter((row: any) => row.source === "quick_sale").length, 3);
});
test("service selection scopes every movement and cards, with shared salaries but no property or other-provider income", async () => {
  const result = await get(`?providerId=${providers[0]}`);
  assert.equal(result.status, 200);
  assert.deepEqual(transactionHistoryTotals(result.rows), { income: 301, expenses: 70, refunds: 0, receivables: 150, net: 231 });
  assert.equal(result.rows.some((row: any) => /^b-|^p-/.test(row.id)), false);
  assert.equal((await get("?providerId=2147483647")).status, 404);
  assert.equal((await get("?providerId=bad")).status, 400);
  assert.equal((await get(`?providerId=${providers[0]}&submissionId=1`)).status, 400);
  const property = await get("?submissionId=2147483647");
  assert.equal(property.rows.some((row: any) => row.source === "service_booking" || row.source === "quick_sale"), false);
});
test("legacy recorded revenue without deposit or contract fields remains visible", async () => {
  const booking = (await query(`INSERT INTO owner_bookings(owner_id,client_name,booking_date,revenue_amount)
    VALUES($1,$2,'2026-11-01',75.25) RETURNING id`, [ownerId, prefix]))[0];
  const result = await get();
  assert.equal(result.rows.find((row: any) => row.id === `b-${booking.id}`).amount, 75.25);
});
