import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { before, after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool, ownerStaffTable, ownerExpensesTable, salaryLogsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { paySalaryWithExpense } from "../lib/salary-expenses";

const ownerId = `salary-expense-test-${randomUUID()}`;
interface PaidResponse {
  salaryLog: { id: number; expenseId: number; paidAt: string };
  expense: { id: number; category: string; amount: string; submissionId: number | null; notes: string; dateStr: string };
}
let sessionId: string, staffId: number, server: Server, baseUrl: string;
before(async () => {
  sessionId = await createSession({
    user: { id: ownerId, email: null, firstName: "Synthetic", lastName: "Payroll Owner", profileImageUrl: null },
    access_token: "integration-test",
  });
  const [staff] = await db.insert(ownerStaffTable).values({
    ownerId, name: "موظف اختبار الرواتب", baseSalary: "2000.25", phoneNum: "0500000000",
  }).returning();
  staffId = staff.id;
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await db.delete(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  await db.delete(ownerExpensesTable).where(eq(ownerExpensesTable.ownerId, ownerId));
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
});

async function pay(month: string, extra: Record<string, unknown> = {}) {
  return fetch(`${baseUrl}/api/owner/salary-logs/pay`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify({ staffId, month, bonus: 100.50, deduction: 50.25, notes: "صرف تجريبي", ...extra }),
  });
}
async function expenses() {
  return db.select().from(ownerExpensesTable).where(eq(ownerExpensesTable.ownerId, ownerId));
}

test("confirmed salary creates a linked salaries expense with employee, net amount and actual Saudi payment date", async () => {
  const response = await pay("2026-01");
  assert.equal(response.status, 200);
  const result = await response.json() as PaidResponse;
  assert.equal(result.salaryLog.expenseId, result.expense.id);
  assert.equal(result.expense.category, "salaries");
  assert.equal(result.expense.amount, "2050.50");
  assert.equal(result.expense.submissionId, null);
  assert.match(result.expense.notes, /راتب الموظف - موظف اختبار الرواتب/);
  assert.match(result.expense.notes, /2026-01/);
  const expectedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(result.salaryLog.paidAt));
  assert.equal(result.expense.dateStr, expectedDate);
  const list = await fetch(`${baseUrl}/api/owner/expenses?month=${expectedDate.slice(0, 7)}`, {
    headers: { authorization: `Bearer ${sessionId}` },
  });
  assert.equal(list.status, 200);
  assert.ok((await list.json() as Array<{ id: number }>).some(row => row.id === result.expense.id));
});

test("reconfirming an already-paid month cannot insert an expense or overwrite paid terms", async () => {
  const count = (await expenses()).length;
  assert.equal((await pay("2026-01", { bonus: 900 })).status, 409);
  assert.equal((await expenses()).length, count);
  const [log] = await db.select().from(salaryLogsTable).where(and(
    eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, "2026-01"),
  ));
  assert.equal(log.bonus, "100.50");
});

test("simultaneous confirmations create exactly one salary log and exactly one expense", async () => {
  const count = (await expenses()).length;
  const responses = await Promise.all([pay("2026-02"), pay("2026-02")]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await expenses()).length, count + 1);
  const rows = await db.select().from(salaryLogsTable).where(and(
    eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, "2026-02"),
  ));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].expenseId);
});

test("paying a draft reuses its log and creates the expense only at confirmation", async () => {
  const [draft] = await db.insert(salaryLogsTable).values({ ownerId, staffId, month: "2026-03" }).returning();
  const count = (await expenses()).length;
  const response = await pay("2026-03");
  assert.equal(response.status, 200);
  const result = await response.json() as PaidResponse;
  assert.equal(result.salaryLog.id, draft.id);
  assert.equal(result.salaryLog.expenseId, result.expense.id);
  assert.equal((await expenses()).length, count + 1);
});

test("invalid month and nonpositive net salary do not create either record", async () => {
  const count = (await expenses()).length;
  assert.equal((await pay("2026-13")).status, 400);
  assert.equal((await pay("2026-04", { deduction: 99999 })).status, 400);
  assert.equal((await expenses()).length, count);
  const rows = await db.select().from(salaryLogsTable).where(and(
    eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, "2026-04"),
  ));
  assert.equal(rows.length, 0);
});

test("another owner cannot trigger payroll expenses for this employee", async () => {
  const result = await paySalaryWithExpense(`${ownerId}-other`, { staffId, month: "2026-05", bonus: 0, deduction: 0 });
  assert.equal(result.kind, "not-found");
});

test("failure after expense insertion rolls back the expense and salary confirmation together", async t => {
  const count = (await expenses()).length;
  const transaction = db.transaction.bind(db);
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  t.mock.method(db, "transaction", ((work: (tx: Tx) => Promise<unknown>) => transaction(tx => work(new Proxy(tx, {
    get(target, key, receiver) {
      if (key === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        if (table === salaryLogsTable) throw new Error("synthetic payroll write failure");
        return target.insert(table);
      };
      return Reflect.get(target, key, receiver);
    },
  })))) as typeof db.transaction);
  try {
    await assert.rejects(paySalaryWithExpense(ownerId, { staffId, month: "2026-06", bonus: 0, deduction: 0 }), /synthetic payroll write failure/);
  } finally {
    t.mock.restoreAll();
  }
  assert.equal((await expenses()).length, count);
  const rows = await db.select().from(salaryLogsTable).where(and(
    eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, "2026-06"),
  ));
  assert.equal(rows.length, 0);
});
