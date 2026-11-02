import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  db, pool, photographyReceiptUploadsTable as uploads, photographyReceiptCleanupRunsTable as runs,
  photographyReceiptsTable as receipts, photographyTransfersTable as transfers, photographersTable,
  photographyBookingsTable, photographyPackagesTable,
  adminStaffTable, adminSessionsTable, photographerSessionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requestPhotographyReceipt, completePhotographyReceipt, receiptStorage } from "./photography-receipts";
import { previewPhotographyReceiptCleanup, approvePhotographyReceiptCleanup, executePhotographyReceiptCleanup } from "./photography-receipt-cleanup";
import { attachablePhotographyReceipt } from "./photography-receipt-lock";
import storageRouter from "../routes/storage";
import { photographyFinancialPublic } from "../routes/photography-financial";

const actor = `receipt-fixture:${randomUUID()}`;
const fixtureIds: string[] = [], runIds: string[] = [], receiptIds: number[] = [];
const files = new Map<string, string>();
const original = {
  sign: receiptStorage.getObjectEntityUploadURL, save: receiptStorage.uploadBuffer,
  file: receiptStorage.getObjectEntityFile, acl: receiptStorage.trySetObjectEntityAclPolicy,
};
const originalSecret = process.env.SESSION_SECRET;
let directory: string, photographerId: number, packageId: number;
let server: Server, base: string, adminStaffId: number;
const photographerToken = randomBytes(32).toString("hex"), adminSid = randomUUID();
async function put(path: string, bytes: Buffer = Buffer.from("%PDF-1.4\nfixture\n%%EOF")) {
  if (!path.includes("photography-receipts/")) throw new Error("fixture_scope");
  const local = join(directory, randomUUID());
  files.set(path, local); await writeFile(local, bytes);
}
async function remove(path: string) {
  const local = files.get(path);
  assert.ok(local, `Refuse to delete anything outside fixture allowlist: ${path}`);
  await rm(local, { force: true });
}
async function oldUpload(state = "requested", ready = false) {
  const id = randomUUID(); fixtureIds.push(id);
  const sourcePath = `/objects/photography-receipts/source/${id}`;
  const preparedPath = `/objects/photography-receipts/prepared/${id}`;
  await put(sourcePath); await put(preparedPath);
  let receiptId: number | undefined;
  if (ready) {
    const [receipt] = await db.insert(receipts).values({
      sourcePath, objectPath: preparedPath, uploadedBy: actor, name: "fixture.pdf", contentType: "application/pdf", size: 22,
    }).returning();
    receiptIds.push(receipt.id); receiptId = receipt.id;
  }
  const [upload] = await db.insert(uploads).values({
    id, sourcePath, preparedPath, uploadedBy: actor, state, receiptId,
    createdAt: new Date(Date.now() - 10 * 86400000), expiresAt: new Date(Date.now() - 9 * 86400000),
  }).returning();
  return upload;
}
async function fixturePreview() {
  const run = await previewPhotographyReceiptCleanup(7);
  runIds.push(run.id);
  // Reports are real, but approved test runs may ONLY contain fixture objects.
  // The strict local adapter is a second independent guard against cloud deletion.
  const report = run.report.filter(entry => fixtureIds.includes(entry.uploadId));
  await db.update(runs).set({ report }).where(eq(runs.id, run.id));
  return { ...run, report };
}
async function approve(id: string) { await approvePhotographyReceiptCleanup(id, 7, "temporary-fixture-only"); }
async function attach(receiptId: number, beforeCommit?: () => Promise<void>) {
  return db.transaction(async tx => {
    if (!await attachablePhotographyReceipt(tx, receiptId, actor)) throw new Error("not_attachable");
    const [row] = await tx.insert(transfers).values({
      photographerId, receiptId, amountHalalas: 100, reference: `receipt-fixture:${randomUUID()}`,
      transferredAt: new Date(), recordedBy: actor,
    }).returning();
    await beforeCommit?.();
    return row;
  });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "photography-receipts-"));
  process.env.SESSION_SECRET = randomUUID(); // Generated test-only signing key.
  receiptStorage.getObjectEntityUploadURL = async entityPath => {
    const path = `/objects/${entityPath}`;
    assert.ok((await db.select().from(uploads).where(eq(uploads.sourcePath, path))).length, "track before signing");
    return path; // Never contact App Storage.
  };
  receiptStorage.getObjectEntityFile = (async (path: string) => {
    const local = files.get(path); assert.ok(local, "fixture-only file reads");
    return { createReadStream: () => createReadStream(local), delete: () => { throw new Error("no eager deletion"); } };
  }) as unknown as typeof receiptStorage.getObjectEntityFile;
  receiptStorage.uploadBuffer = async (buffer, _type, _ext, entityPath) => {
    const path = `/objects/${entityPath}`; await put(path, buffer); return `/api/storage${path}`;
  };
  receiptStorage.trySetObjectEntityAclPolicy = async path => path;
  const [person] = await db.insert(photographersTable).values({ name: "مصور اختبار إيصالات مؤقت", whatsapp: actor }).returning();
  photographerId = person.id;
  const [pkg] = await db.insert(photographyPackagesTable).values({
    name: "اختبار إيصالات مؤقت", priceHalalas: 100, platformPercent: "0", active: false,
  }).returning();
  packageId = pkg.id;
  const [staff] = await db.insert(adminStaffTable).values({
    name: "اختبار وصول إيصالات مؤقت", username: actor, passwordHash: "test-only-no-login",
    isSuperAdmin: true, isActive: true,
  }).returning();
  adminStaffId = staff.id;
  await db.insert(adminSessionsTable).values({ sid: adminSid, adminStaffId, expire: new Date(Date.now() + 3600000) });
  await db.insert(photographerSessionsTable).values({
    hash: createHash("sha256").update(photographerToken).digest("hex"),
    photographerId, expiresAt: new Date(Date.now() + 3600000),
  });
  const app = express();
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: `unrelated:${actor}` } as Express.User;
    next();
  });
  app.use("/api", storageRouter);
  app.use("/api/photography", photographyFinancialPublic);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  Object.assign(receiptStorage, {
    getObjectEntityUploadURL: original.sign, uploadBuffer: original.save,
    getObjectEntityFile: original.file, trySetObjectEntityAclPolicy: original.acl,
  });
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  await db.delete(transfers).where(eq(transfers.recordedBy, actor));
  if (adminStaffId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminStaffId, adminStaffId));
    await db.delete(adminStaffTable).where(eq(adminStaffTable.id, adminStaffId));
  }
  if (photographerId) await db.delete(photographerSessionsTable).where(eq(photographerSessionsTable.photographerId, photographerId));
  await db.delete(photographyBookingsTable).where(eq(photographyBookingsTable.ownerId, actor));
  await db.delete(receipts).where(eq(receipts.uploadedBy, actor));
  await db.delete(uploads).where(eq(uploads.uploadedBy, actor));
  if (runIds.length) await db.delete(runs).where(inArray(runs.id, runIds));
  if (photographerId) await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  if (packageId) await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  if (directory) await rm(directory, { recursive: true, force: true });
  await pool.end();
});

test("registration precedes signing; completion is serialized, idempotent and does not delete source; bad files stay tracked", async () => {
  const request = await requestPhotographyReceipt(actor, { name: "proof.pdf", size: 22, contentType: "application/pdf" });
  const id = request.objectPath.split("/").at(-1)!; fixtureIds.push(id);
  await put(request.objectPath);
  const [a, b] = await Promise.all([
    completePhotographyReceipt(actor, request), completePhotographyReceipt(actor, request),
  ]);
  receiptIds.push(a.receiptId);
  assert.equal(a.receiptId, b.receiptId);
  assert.ok(await readFile(files.get(request.objectPath)!));
  const bad = await requestPhotographyReceipt(actor, { name: "bad.png", size: 9, contentType: "image/png" });
  fixtureIds.push(bad.objectPath.split("/").at(-1)!);
  await put(bad.objectPath, Buffer.from("not an image"));
  await assert.rejects(completePhotographyReceipt(actor, bad), /receipt_format/);
  const [row] = await db.select().from(uploads).where(eq(uploads.sourcePath, bad.objectPath));
  assert.equal(row.state, "invalid");
});

test("dry run and retention approval are mandatory; only invalid, expired and old unlinked fixture paths are deleted", async () => {
  const expired = await oldUpload(), invalid = await oldUpload("invalid"), unlinked = await oldUpload("ready", true);
  const recent = await oldUpload();
  await db.update(uploads).set({ createdAt: new Date() }).where(eq(uploads.id, recent.id));
  const active = await oldUpload();
  await db.update(uploads).set({ expiresAt: new Date(Date.now() + 3600000) }).where(eq(uploads.id, active.id));
  const run = await fixturePreview();
  assert.equal(run.report.find(e => e.uploadId === invalid.id)?.reason, "invalid");
  assert.equal(run.report.find(e => e.uploadId === unlinked.id)?.reason, "unlinked_receipt");
  await assert.rejects(executePhotographyReceiptCleanup(run.id, remove), /cleanup_not_approved/);
  await assert.rejects(approvePhotographyReceiptCleanup(run.id, 8, actor), /cleanup_report_mismatch/);
  await assert.rejects(approvePhotographyReceiptCleanup(run.id, 7, ""), /cleanup_approver_required/);
  for (const u of [expired, invalid, unlinked]) assert.ok(await readFile(files.get(u.sourcePath)!));
  await approve(run.id);
  const result = await executePhotographyReceiptCleanup(run.id, remove);
  for (const u of [expired, invalid, unlinked]) {
    await assert.rejects(readFile(files.get(u.sourcePath)!));
    assert.ok(result.events.some(e => e.uploadId === u.id && e.result === "deleted"));
  }
  assert.ok(await readFile(files.get(recent.sourcePath)!)); assert.ok(await readFile(files.get(active.sourcePath)!));
  await assert.rejects(attach(unlinked.receiptId!), /not_attachable/);
});

test("saved transfers survive cancelled/refunded bookings and references added after preview win against cleanup", async () => {
  const archived = await oldUpload("ready", true), late = await oldUpload("ready", true);
  await attach(archived.receiptId!);
  await db.insert(photographyBookingsTable).values({
    ownerId: actor, photographerId, packageId, propertyId: 1, propertyName: "اختبار مؤقت",
    ownerPhone: "0500000000", photographerPhone: "0500000000",
    photographerName: "اختبار", packageName: "اختبار", startAt: new Date(), endAt: new Date(Date.now() + 3600000),
    expiresAt: new Date(), status: "cancelled", financialStatus: "refunded", priceHalalas: 100,
    refundedHalalas: 100, commissionHalalas: 0, photographerEarningsHalalas: 100,
  });
  const run = await fixturePreview();
  assert.equal(run.report.find(e => e.uploadId === archived.id)?.reason, "saved_transfer");
  assert.equal(run.report.find(e => e.uploadId === late.id)?.candidate, true);
  await approve(run.id);
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const attachment = attach(late.receiptId!, async () => { entered(); await resume; });
  await paused;
  const cleanup = executePhotographyReceiptCleanup(run.id, remove);
  release(); await attachment;
  const result = await cleanup;
  assert.ok(result.events.some(e => e.uploadId === late.id && e.result === "skipped:saved_transfer"));
  for (const u of [archived, late]) {
    assert.ok(await readFile(files.get(u.preparedPath)!)); assert.ok(await readFile(files.get(u.sourcePath)!));
  }
});

test("cleanup intent blocks attachment while physical deletion is paused; partial failures retry safely", async () => {
  const upload = await oldUpload("ready", true);
  const run = await fixturePreview(); await approve(run.id);
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const execution = executePhotographyReceiptCleanup(run.id, async path => {
    if (path === upload.sourcePath) { entered(); await resume; }
    if (path === upload.preparedPath) throw new Error("simulated temporary outage");
    await remove(path);
  });
  await paused;
  await assert.rejects(attach(upload.receiptId!), /not_attachable/);
  release(); await execution;
  const [pending] = await db.select().from(uploads).where(eq(uploads.id, upload.id));
  assert.equal(pending.state, "deleting"); assert.equal(pending.error, "delete_failed");
  await executePhotographyReceiptCleanup(run.id, remove);
  const [deleted] = await db.select().from(uploads).where(eq(uploads.id, upload.id));
  assert.equal(deleted.state, "deleted");
});

test("legacy receipts remain attachable and registered out-of-scope paths fail closed", async () => {
  const [legacy] = await db.insert(receipts).values({
    objectPath: `/objects/uploads/${randomUUID()}.pdf`, uploadedBy: actor,
    name: "legacy.pdf", contentType: "application/pdf", size: 20,
  }).returning();
  receiptIds.push(legacy.id); await attach(legacy.id);
  const malformed = await oldUpload();
  await db.update(uploads).set({ preparedPath: legacy.objectPath }).where(eq(uploads.id, malformed.id));
  const outside = await oldUpload();
  await db.update(uploads).set({ preparedPath: `/objects/uploads/${randomUUID()}` }).where(eq(uploads.id, outside.id));
  const run = await fixturePreview();
  assert.equal(run.report.some(e => e.paths.includes(legacy.objectPath) && e.candidate), false);
  assert.equal(run.report.find(e => e.uploadId === outside.id)?.reason, "outside_scope");
  await approve(run.id); await executePhotographyReceiptCleanup(run.id, remove);
  assert.ok(await readFile(files.get(malformed.sourcePath)!));
});

test("generic storage denies source and prepared receipts; dedicated admin and photographer preview/download survive cleanup", async () => {
  const saved = await oldUpload("ready", true); await attach(saved.receiptId!);
  const run = await fixturePreview(); await approve(run.id);
  await executePhotographyReceiptCleanup(run.id, remove);
  for (const path of [saved.sourcePath, saved.preparedPath]) {
    for (const encoded of [false, true]) {
      const object = path.replace(/^\/objects\//, "");
      const response = await fetch(`${base}/api/storage/objects/${encoded ? encodeURIComponent(object) : object}`);
      assert.equal(response.status, 403, "unrelated authenticated user cannot use generic serving");
    }
  }
  const route = `${base}/api/photography/receipts/${saved.receiptId}`;
  assert.equal((await fetch(route)).status, 403, "dedicated route rejects unrelated authenticated user");
  for (const cookie of [`admin_staff_sid=${adminSid}`, `photographer_session=${photographerToken}`]) {
    for (const download of [false, true]) {
      const response = await fetch(`${route}${download ? "?download=1" : ""}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.match(response.headers.get("content-disposition")!, download ? /^attachment/ : /^inline/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(files.get(saved.preparedPath)!));
    }
  }
});
