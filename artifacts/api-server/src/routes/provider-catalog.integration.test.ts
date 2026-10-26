import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, ownerSubscriptionsTable, serviceProvidersTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { currentCatalogDay } from "../lib/provider-catalog";

const ownerId = `catalog-test-${randomUUID()}`;
const providerIds: number[] = [];
let sessionId: string;
let base: string;
let server: Server;
const item = { name: "خدمة تجريبية", kind: "service", description: "وصف", price: 200, pricingUnit: "per_day", isActive: true };
const day = currentCatalogDay();
const offer = { name: "عرض تجريبي", itemId: null as number | null, discountType: "percentage", value: 20, startDate: day, endDate: day, isActive: true };

async function request(path: string, method = "GET", body?: object, auth = true) {
  const response = await fetch(`${base}/api/providers${path}`, {
    method, headers: { ...(auth ? { authorization: `Bearer ${sessionId}` } : {}), "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = response.status === 204 ? null : await response.json() as any;
  return { status: response.status, json };
}
const path = (index = 0) => `/my/approved/${providerIds[index]}`;

before(async () => {
  sessionId = await createSession({ user: { id: ownerId, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test" });
  for (const owner of [ownerId, ownerId, `foreign-${ownerId}`]) {
    const [provider] = await db.insert(serviceProvidersTable).values({
      ownerId: owner, businessName: `catalog ${randomUUID()}`, category: "test", city: "الرس", whatsappNumber: "0500000000",
    }).returning();
    providerIds.push(provider.id);
  }
  await db.insert(ownerSubscriptionsTable).values({ ownerId, status: "active", expiresAt: new Date(Date.now() + 86400000) });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (providerIds.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

it("protects authentication and isolates catalogs across providers, even for one owner", async () => {
  assert.equal((await request(`${path()}/catalog`, "GET", undefined, false)).status, 401);
  assert.equal((await request(`${path(2)}/catalog`)).status, 404);
  const created = await request(`${path()}/catalog`, "POST", item);
  assert.equal(created.status, 201);
  assert.equal(created.json.price, 200);
  assert.equal((await request(`${path(1)}/catalog`)).json.length, 0);
  assert.equal((await request(`${path(1)}/catalog/${created.json.id}`, "PATCH", item)).status, 404);
  assert.equal((await request(`${path(1)}/catalog/${created.json.id}`, "DELETE")).status, 404);
  assert.equal((await request(`${path(1)}/offers`, "POST", { ...offer, itemId: created.json.id })).status, 404);
  const edited = await request(`${path()}/catalog/${created.json.id}`, "PATCH", { ...item, name: "خدمة معدّلة", price: 250 });
  assert.equal(edited.json.name, "خدمة معدّلة");
  assert.equal((await request(`${path()}/catalog`)).json[0].price, 250);
  assert.equal((await request(`${path()}/catalog/${created.json.id}`, "DELETE")).status, 204);
});

it("rejects invalid product prices, names and invalid offer dates/percentages", async () => {
  for (const change of [{ price: 0 }, { price: -3 }, { price: 0.001 }, { name: " " }, { pricingUnit: "invalid" }]) {
    assert.equal((await request(`${path()}/catalog`, "POST", { ...item, ...change })).status, 400);
  }
  for (const change of [{ value: 101 }, { value: 0 }, { startDate: "2026-02-30" }, { startDate: "2030-01-02", endDate: "2030-01-01" }]) {
    assert.equal((await request(`${path()}/offers`, "POST", { ...offer, ...change })).status, 400);
  }
});

it("persists independent item media, preserves omitted fields and clears explicit removals", async () => {
  const thumbnailUrl = `/api/storage/objects/uploads/${randomUUID()}.webp`;
  const galleryPhotos = Array.from({ length: 3 }, () => `/api/storage/objects/uploads/${randomUUID()}.webp`);
  const created = await request(`${path()}/catalog`, "POST", { ...item, thumbnailUrl, galleryPhotos });
  assert.equal(created.status, 201);
  const itemPath = `${path()}/catalog/${created.json.id}`;
  assert.equal(created.json.thumbnailUrl, thumbnailUrl);
  assert.deepEqual(created.json.galleryPhotos, galleryPhotos);
  const list = await request(`${path()}/catalog`);
  assert.equal(list.json.find((row: any) => row.id === created.json.id).thumbnailUrl, thumbnailUrl);
  const published = await request(`/${providerIds[0]}/catalog`, "GET", undefined, false);
  assert.deepEqual(published.json.find((row: any) => row.id === created.json.id).galleryPhotos, galleryPhotos);
  const other = await request(`${path(1)}/catalog`, "POST", { ...item, name: "عنصر مستقل" });
  assert.equal(other.json.thumbnailUrl, null);
  assert.deepEqual(other.json.galleryPhotos, []);
  assert.equal((await request(`${path(1)}/catalog/${created.json.id}`, "PATCH", { ...item, thumbnailUrl: null, galleryPhotos: [] })).status, 404);
  const edited = await request(itemPath, "PATCH", { ...item, name: "عنصر مصور معدّل" });
  assert.equal(edited.json.thumbnailUrl, thumbnailUrl);
  assert.deepEqual(edited.json.galleryPhotos, galleryPhotos);
  assert.equal((await request(itemPath, "PATCH", { ...item, isActive: false })).status, 200);
  assert.equal((await request(`/${providerIds[0]}/catalog`, "GET", undefined, false)).json.some((row: any) => row.id === created.json.id), false);
  const cleared = await request(itemPath, "PATCH", { ...item, thumbnailUrl: null, galleryPhotos: [] });
  assert.equal(cleared.json.thumbnailUrl, null);
  assert.deepEqual(cleared.json.galleryPhotos, []);
  await request(itemPath, "DELETE");
  await request(`${path(1)}/catalog/${other.json.id}`, "DELETE");
});

it("rejects oversized galleries, duplicates and untrusted or non-image media URLs", async () => {
  const image = `/api/storage/objects/uploads/${randomUUID()}.webp`;
  const invalid = [
    { galleryPhotos: Array.from({ length: 4 }, () => `/api/storage/objects/uploads/${randomUUID()}.webp`) },
    { galleryPhotos: [image, image] },
    { galleryPhotos: ["https://untrusted.example/image.jpg"] },
    { thumbnailUrl: "javascript:alert(1)" },
    { thumbnailUrl: "/api/storage/objects/uploads/../secret.png" },
    { thumbnailUrl: "/api/storage/objects/uploads/video.mp4" },
    { thumbnailUrl: "" },
  ];
  for (const change of invalid) {
    assert.equal((await request(`${path()}/catalog`, "POST", { ...item, ...change })).status, 400);
  }
});

it("guards catalog uploads before reading files and rejects missing or invalid image contents", async () => {
  const uploadPath = `${path()}/catalog-media`;
  assert.equal((await request(uploadPath, "POST", undefined, false)).status, 401);
  assert.equal((await request(`${path(2)}/catalog-media`, "POST")).status, 404);
  assert.equal((await request(uploadPath, "POST")).status, 400);
  for (const file of [
    new Blob(["not an image"], { type: "text/plain" }),
    new Blob(["not an image"], { type: "image/png" }),
    new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/png" }),
  ]) {
    const form = new FormData();
    form.append("file", file, "fixture.png");
    const response = await fetch(`${base}/api/providers${uploadPath}`, {
      method: "POST", headers: { authorization: `Bearer ${sessionId}` }, body: form,
    });
    assert.equal(response.status, file.size > 2 * 1024 * 1024 ? 413 : 400);
  }
});

it("publishes only active catalog items with one best offer and retains scope when editing/removing", async () => {
  const product = (await request(`${path()}/catalog`, "POST", item)).json;
  const hidden = (await request(`${path()}/catalog`, "POST", { ...item, name: "عنصر متوقف", isActive: false })).json;
  const general = (await request(`${path()}/offers`, "POST", offer)).json;
  const targeted = (await request(`${path()}/offers`, "POST", { ...offer, itemId: product.id, discountType: "fixed", value: 60 })).json;
  assert.equal((await request(`${path(1)}/offers/${targeted.id}`, "PATCH", offer)).status, 404);
  assert.equal((await request(`${path(1)}/offers/${targeted.id}`, "DELETE")).status, 404);
  let publicResponse = await request(`/${providerIds[0]}/catalog`, "GET", undefined, false);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.json.length, 1);
  assert.equal(publicResponse.json[0].id, product.id);
  assert.equal(publicResponse.json[0].price, 200);
  assert.equal(publicResponse.json[0].finalPrice, 140); // Not stacked with the 20% offer.
  assert.equal((await request(`${path()}/offers/${targeted.id}`, "PATCH", { ...offer, itemId: product.id, discountType: "fixed", value: 60, isActive: false })).status, 200);
  publicResponse = await request(`/${providerIds[0]}/catalog`, "GET", undefined, false);
  assert.equal(publicResponse.json[0].finalPrice, 160);
  assert.equal((await request(`${path()}/offers/${general.id}`, "PATCH", { ...offer, startDate: "2099-01-01", endDate: "2099-01-02" })).status, 200);
  assert.equal((await request(`/${providerIds[0]}/catalog`, "GET", undefined, false)).json[0].finalPrice, 200);
  assert.equal((await request(`${path()}/catalog/${hidden.id}`, "PATCH", { ...item, isActive: true })).status, 200);
  assert.equal((await request(`/${providerIds[0]}/catalog`, "GET", undefined, false)).json.length, 2);
  assert.equal((await request(`${path()}/catalog/${product.id}`, "DELETE")).status, 204);
  assert.equal((await request(`${path()}/offers`)).json.find((v: any) => v.id === targeted.id).isActive, false);
  assert.equal((await request(`${path()}/offers/${targeted.id}`, "PATCH", { ...offer, itemId: product.id })).status, 404);
  assert.equal((await request(`${path()}/offers/${targeted.id}`, "DELETE")).status, 204);
  assert.equal((await request(`${path()}/catalog/${hidden.id}`, "DELETE")).status, 204);
  assert.equal((await request(`/${providerIds[0]}/catalog`, "GET", undefined, false)).json.length, 0);
});
