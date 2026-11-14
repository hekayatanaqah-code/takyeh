import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { deleteOwnerPermanently, OwnerDeletionError } from "./delete-owner";

const fixtures: number[] = [];
const marker = `owner-delete-test-${randomUUID()}`;
async function fixture(label: string) {
  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO owner_applications(full_name, business_name, phone, business_type, email_verified, password_hash)
    VALUES (${`${marker}-${label}`}, ${marker}, '0500000000', 'both', true, '!disabled-fixture') RETURNING id`);
  const id = result.rows[0].id;
  fixtures.push(id);
  const owner = `owner_${id}`;
  const alias = `${marker}-${label}`;
  await db.execute(sql`INSERT INTO owner_account_links(user_id, owner_application_id) VALUES(${alias},${id})`);
  const submission = await db.execute<{ id: number }>(sql`
    INSERT INTO chalet_submissions(name_ar,whatsapp_number,location,owner_id,description_ar,price_per_night)
    VALUES (${marker},'0500000000','test',${owner},'test',100) RETURNING id`);
  const chalet = await db.execute<{ id: number }>(sql`
    INSERT INTO chalets(name_ar,description_ar,location,price_per_night,whatsapp_number,submission_id)
    VALUES (${marker},'test','test',100,'0500000000',${submission.rows[0].id}) RETURNING id`);
  const service = await db.execute<{ id: number }>(sql`
    INSERT INTO service_provider_submissions(business_name,category,city,whatsapp_number,owner_id)
    VALUES (${marker},'test','test','0500000000',${alias}) RETURNING id`);
  const provider = await db.execute<{ id: number }>(sql`
    INSERT INTO service_providers(business_name,category,city,whatsapp_number,submission_id)
    VALUES (${marker},'test','test','0500000000',${service.rows[0].id}) RETURNING id`);
  await db.execute(sql`INSERT INTO quick_sales(owner_id,provider_id,provider_name,date_str,items,total,payment_method,idempotency_key,request_hash)
    VALUES (${alias},${provider.rows[0].id},${marker},'2026-11-14','[]',100,'cash',${randomUUID()},'fixture')`);
  await db.execute(sql`INSERT INTO owner_expenses(owner_id,date_str,category,amount)
    VALUES (${owner},'2026-11-14','test',15)`);
  return { id, owner, alias, submission: submission.rows[0].id, chalet: chalet.rows[0].id, service: service.rows[0].id, provider: provider.rows[0].id };
}
after(async () => {
  try {
    for (const id of fixtures) {
      try { await deleteOwnerPermanently(`owner_${id}`); }
      catch (e) { if (!(e instanceof OwnerDeletionError && e.status === 404)) throw e; }
    }
  } finally { await pool.end(); }
});

it("rolls back every child deletion if the final account deletion fails", async () => {
  const target = await fixture("rollback");
  const transaction = db.transaction;
  const dialect = new PgDialect();
  (db as any).transaction = (callback: any, ...options: any[]) => transaction.call(db, async (tx: any) => {
    const wrapped = new Proxy(tx, {
      get(value, key) {
        if (key === "execute") return (statement: any) => {
          if (/^DELETE FROM owner_applications/.test(dialect.sqlToQuery(statement).sql.trim())) throw new Error("fixture failure before account deletion");
          return value.execute(statement);
        };
        const field = value[key];
        return typeof field === "function" ? field.bind(value) : field;
      },
    });
    return callback(wrapped);
  }, ...options);
  try { await assert.rejects(deleteOwnerPermanently(target.owner), /fixture failure/); }
  finally { (db as any).transaction = transaction; }
  const account = await db.execute(sql`SELECT 1 FROM owner_applications WHERE id=${target.id}`);
  const property = await db.execute(sql`SELECT 1 FROM chalets WHERE id=${target.chalet}`);
  const sale = await db.execute(sql`SELECT 1 FROM quick_sales WHERE provider_id=${target.provider}`);
  assert.equal(account.rows.length, 1);
  assert.equal(property.rows.length, 1);
  assert.equal(sale.rows.length, 1);
});

it("deletes alias-owned activity and null-owner public mirrors without touching a second owner", async () => {
  const target = await fixture("target");
  const control = await fixture("control");
  assert.equal((await deleteOwnerPermanently(target.alias)).permanentlyDeleted, true);
  for (const [table, id] of [
    ["owner_applications", target.id], ["chalet_submissions", target.submission],
    ["chalets", target.chalet], ["service_provider_submissions", target.service], ["service_providers", target.provider],
  ] as const) {
    const result = await db.execute(sql`SELECT 1 FROM ${sql.raw(table)} WHERE id=${id}`);
    assert.equal(result.rows.length, 0, `${table} removed`);
  }
  const sales = await db.execute(sql`SELECT 1 FROM quick_sales WHERE provider_id=${target.provider}`);
  const link = await db.execute(sql`SELECT 1 FROM owner_account_links WHERE owner_application_id=${target.id}`);
  const expenses = await db.execute(sql`SELECT 1 FROM owner_expenses WHERE owner_id=${target.owner}`);
  assert.equal(sales.rows.length + link.rows.length + expenses.rows.length, 0);
  assert.equal((await db.execute(sql`SELECT 1 FROM owner_applications WHERE id=${control.id}`)).rows.length, 1);
  assert.equal((await db.execute(sql`SELECT 1 FROM quick_sales WHERE provider_id=${control.provider}`)).rows.length, 1);
  await assert.rejects(deleteOwnerPermanently(target.owner), (error: any) => error.status === 404);
});

it("also removes orphan activities left behind by the old registration-only deletion", async () => {
  const target = await fixture("orphan");
  await db.execute(sql`DELETE FROM owner_applications WHERE id=${target.id}`);
  await deleteOwnerPermanently(target.owner);
  assert.equal((await db.execute(sql`SELECT 1 FROM chalets WHERE id=${target.chalet}`)).rows.length, 0);
  assert.equal((await db.execute(sql`SELECT 1 FROM service_providers WHERE id=${target.provider}`)).rows.length, 0);
});
