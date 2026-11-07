import { insertRecords, updateRecords, writeRecords } from "@workspace/db/mutations";
import { Router } from "express";
import { lockResource } from "@workspace/db/transaction-lock";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, ownerCustomersTable, providerCatalogItemsTable, quickSalesSettingsTable, quickSalesTable, serviceProvidersTable } from "@workspace/db";
import { CancelQuickSaleBody, CancelQuickSaleParams, CreateQuickSaleResponse, ListQuickSalesQueryParams, ListQuickSalesResponse, UpdateQuickSalesSettingsBody } from "@workspace/api-zod";
import { quickSaleInput, quickSaleTotalCents } from "../lib/quick-sales";
import { ownerPlanAccess } from "../lib/subscription-access";

// Mounted inside the owner router AFTER its authenticated owner-session resolver.
const router = Router();
function saleJson(row: typeof quickSalesTable.$inferSelect) {
  return CreateQuickSaleResponse.parse({
    ...row, total: Number(row.total),
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  });
}
router.get("/quick-sales/settings", async (req, res): Promise<void> => {
  const [row] = await db.select().from(quickSalesSettingsTable).where(eq(quickSalesSettingsTable.ownerId, req.user!.id));
  res.json({ enabled: row?.enabled ?? false });
});
router.patch("/quick-sales/settings", async (req, res): Promise<void> => {
  const body = UpdateQuickSalesSettingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "اختر حالة تفعيل صحيحة" }); return; }
  const ownerId = req.user!.id;
  await db.transaction(async tx => {
    await lockResource(tx, "long-identity", `quick-sales:${ownerId}`);
    await writeRecords(tx, quickSalesSettingsTable, { ownerId, enabled: body.data.enabled }, { conflict: { action: "update", ...{ target: quickSalesSettingsTable.ownerId, set: { enabled: body.data.enabled } } } });
  });
  res.json(body.data);
});
router.get("/quick-sales", async (req, res): Promise<void> => {
  const params = ListQuickSalesQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: "معرّف النشاط غير صالح" }); return; }
  const ownerId = req.user!.id;
  if (params.data.providerId) {
    const [provider] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
      .where(and(eq(serviceProvidersTable.id, params.data.providerId), eq(serviceProvidersTable.ownerId, ownerId)));
    if (!provider) { res.status(404).json({ error: "النشاط غير موجود" }); return; }
  }
  const rows = await db.select().from(quickSalesTable).where(and(
    eq(quickSalesTable.ownerId, ownerId),
    params.data.providerId ? eq(quickSalesTable.providerId, params.data.providerId) : undefined,
  )).orderBy(desc(quickSalesTable.dateStr), desc(quickSalesTable.id));
  res.json(ListQuickSalesResponse.parse(rows.map(saleJson)));
});
router.post("/quick-sales", async (req, res): Promise<void> => {
  const body = quickSaleInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "تحقق من التاريخ والمنتجات والكميات والأسعار وطريقة التحصيل" }); return; }
  const ownerId = req.user!.id;
  const access = await ownerPlanAccess(ownerId);
  if (!access.active) { res.status(403).json({ error: "الحساب للقراءة فقط؛ يلزم اشتراك نشط لتسجيل المبيعات" }); return; }
  const input = body.data;
  // Anonymous retries created before phone linking used a payload without clientPhone.
  const { clientPhone: _phone, ...legacyInput } = input;
  const hash = createHash("sha256").update(JSON.stringify(input.clientPhone ? input : legacyInput)).digest("hex");
  const result = await db.transaction(async tx => {
    // Serializes disable/create and retries for the SAME owner, not the marketplace.
    await lockResource(tx, "long-identity", `quick-sales:${ownerId}`);
    const [existing] = await tx.select().from(quickSalesTable).where(and(
      eq(quickSalesTable.ownerId, ownerId), eq(quickSalesTable.idempotencyKey, input.idempotencyKey),
    ));
    if (existing) return existing.requestHash === hash ? { row: existing } : { error: "تعذّر إعادة استخدام معرّف العملية لبيانات مختلفة", status: 409 };
    const [settings] = await tx.select().from(quickSalesSettingsTable).where(eq(quickSalesSettingsTable.ownerId, ownerId));
    if (!settings?.enabled) return { error: "فعّل المبيعات المفردة من إعدادات الحساب أولاً", status: 403 };
    const [provider] = await tx.select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
      .from(serviceProvidersTable).where(and(eq(serviceProvidersTable.id, input.providerId), eq(serviceProvidersTable.ownerId, ownerId)));
    if (!provider) return { error: "النشاط غير موجود", status: 404 };
    const ids = [...new Set(input.items.flatMap(item => item.catalogItemId ? [item.catalogItemId] : []))];
    const catalog = ids.length ? await tx.select().from(providerCatalogItemsTable).where(and(
      inArray(providerCatalogItemsTable.id, ids), eq(providerCatalogItemsTable.providerId, provider.id),
      eq(providerCatalogItemsTable.isActive, true), isNull(providerCatalogItemsTable.deletedAt),
    )) : [];
    if (catalog.length !== ids.length) return { error: "أحد المنتجات غير متاح أو لا ينتمي لهذا النشاط", status: 404 };
    const items = input.items.map(item => ({
      ...item, name: item.catalogItemId ? catalog.find(product => product.id === item.catalogItemId)!.name : item.name.trim(),
    }));
    let clientName = input.clientName;
    if (input.clientPhone) {
      // Same unique owner/normalized-phone key as bookings; no name-only matching.
      await lockResource(tx, "long-identity", `customer:${ownerId}:${input.clientPhone}`);
      const [customer] = await tx.select().from(ownerCustomersTable).where(and(
        eq(ownerCustomersTable.ownerId, ownerId), eq(ownerCustomersTable.phoneNormalized, input.clientPhone),
      ));
      clientName = customer?.name || clientName;
      if (!clientName) return { error: "اكتب اسم العميل الجديد", status: 400 };
      const [savedCustomer] = await insertRecords(tx, ownerCustomersTable, {
        ownerId, phoneNormalized: input.clientPhone, phone: input.clientPhone, name: clientName,
      }, { conflict: { action: "update", ...{
        target: [ownerCustomersTable.ownerId, ownerCustomersTable.phoneNormalized],
        set: { phone: input.clientPhone, updatedAt: new Date() },
      } } });
      clientName = savedCustomer.name;
    }
    const [row] = await insertRecords(tx, quickSalesTable, {
      ownerId, providerId: provider.id, providerName: provider.businessName, dateStr: input.dateStr,
      clientName, clientPhone: input.clientPhone, items, total: (quickSaleTotalCents(items) / 100).toFixed(2),
      paymentMethod: input.paymentMethod, notes: input.notes, idempotencyKey: input.idempotencyKey, requestHash: hash,
    });
    return { row };
  });
  if (result.error) { res.status(result.status!).json({ error: result.error }); return; }
  res.status(201).json(saleJson(result.row!));
});
router.post("/quick-sales/:saleId/cancel", async (req, res): Promise<void> => {
  const params = CancelQuickSaleParams.safeParse(req.params);
  const body = CancelQuickSaleBody.safeParse(req.body);
  if (!params.success || !body.success || body.data.reason.trim().length < 3) {
    res.status(400).json({ error: "معرّف العملية وسبب الإلغاء مطلوبان" }); return;
  }
  const ownerId = req.user!.id;
  const access = await ownerPlanAccess(ownerId);
  if (!access.active) { res.status(403).json({ error: "الحساب للقراءة فقط" }); return; }
  const [row] = await updateRecords(db, quickSalesTable, {
    status: "cancelled", cancellationReason: body.data.reason.trim(), cancelledAt: new Date(),
  }, and(eq(quickSalesTable.id, params.data.saleId), eq(quickSalesTable.ownerId, ownerId), eq(quickSalesTable.status, "completed")));
  if (!row) {
    const [existing] = await db.select({ id: quickSalesTable.id }).from(quickSalesTable)
      .where(and(eq(quickSalesTable.id, params.data.saleId), eq(quickSalesTable.ownerId, ownerId)));
    res.status(existing ? 409 : 404).json({ error: existing ? "العملية ملغاة مسبقًا" : "العملية غير موجودة" }); return;
  }
  res.json(saleJson(row));
});
export default router;
