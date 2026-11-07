import { insertRecords, updateRecords, writeRecords } from "@workspace/db/mutations";
import { Router, Request, Response, NextFunction } from "express";
import { lockResource } from "@workspace/db/transaction-lock";
import { normalizeCityName } from "../lib/city-name";
import { providerCoversCity, shuffledInventory } from "../lib/provider-city-filter";
import { isArabicServiceCategoryName } from "../lib/service-category-names";
import { CreateServiceCityRequestBody } from "@workspace/api-zod";
import { CityRequestError, createCityRequest } from "../lib/service-city-requests";
import { includeOwnerActivityKind } from "../lib/owner-activity-registration";
import { db } from "@workspace/db";
import {
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
  serviceBlockedDatesTable,
  serviceSeasonsTable,
  globalSeasonsTable,
  serviceAppointmentsTable,
  serviceInsurancesTable,
  serviceReviewInvitationsTable,
  serviceReviewsTable,
  ownerCustomersTable,
  serviceCategoriesTable,
  serviceRegionsCatalogTable,
  serviceCitiesCatalogTable,
  citiesCatalogTable,
  ownerAccountLinksTable,
  ownerSubscriptionsTable,
  quickSalesTable,
} from "@workspace/db/schema";
import { eq, and, ne, desc, isNull, gte, sql, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { initialAppointmentInsurance, serviceAppointmentInsuranceAmount } from "../lib/service-appointment-insurance";
import { CreateServiceSeasonBody, UpdateServiceSeasonBody, RecordServiceAppointmentPaymentBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";
import providerCatalogRouter, { getPublicCatalog } from "./provider-catalog";
import { normalizeCustomerPhone } from "../lib/customerPhone";
import { ensureOwnerProfile } from "../lib/ownerProfile";
import { activeOwnersWithFreeAccess, isSubscriptionActive, ownerPlanAccess, preferredOwnerSubscription } from "../lib/subscription-access";

const router = Router();
router.use("/my/approved", providerCatalogRouter);
const ALL_KINGDOM_COVERAGE = "جميع مناطق المملكة";

async function activeInventoryOwnerIds(ownerIds: Array<string | null | undefined>) {
  const owners = [...new Set(ownerIds.filter((id): id is string => !!id))];
  if (owners.length === 0) return new Set<string>();
  const applicationIds = owners
    .map((id) => /^owner_(\d+)$/.exec(id)?.[1])
    .filter((id): id is string => !!id)
    .map(Number);
  const userIds = owners.filter((id) => !/^owner_\d+$/.test(id));
  const linkConditions = [];
  if (userIds.length > 0) linkConditions.push(inArray(ownerAccountLinksTable.userId, userIds));
  if (applicationIds.length > 0) linkConditions.push(inArray(ownerAccountLinksTable.ownerApplicationId, applicationIds));
  const links = linkConditions.length > 0
    ? await db.select({
        userId: ownerAccountLinksTable.userId,
        applicationId: ownerAccountLinksTable.ownerApplicationId,
      }).from(ownerAccountLinksTable).where(or(...linkConditions))
    : [];
  const keysByOwner = new Map(owners.map((ownerId) => [ownerId, new Set([ownerId])]));
  for (const link of links) {
    const legacyId = `owner_${link.applicationId}`;
    keysByOwner.get(link.userId)?.add(legacyId);
    keysByOwner.get(legacyId)?.add(link.userId);
  }
  const subscriptionKeys = [...new Set([...keysByOwner.values()].flatMap((keys) => [...keys]))];
  const subscriptions = await db.select({
    ownerId: ownerSubscriptionsTable.ownerId,
    status: ownerSubscriptionsTable.status,
    expiresAt: ownerSubscriptionsTable.expiresAt,
    paymentStatus: ownerSubscriptionsTable.paymentStatus,
  }).from(ownerSubscriptionsTable).where(inArray(ownerSubscriptionsTable.ownerId, subscriptionKeys));
  const activeFreeAccess = await activeOwnersWithFreeAccess(keysByOwner);
  return new Set(owners.filter((ownerId) =>
    activeFreeAccess.has(ownerId) ||
    isSubscriptionActive(preferredOwnerSubscription(
      subscriptions.filter((subscription) => keysByOwner.get(ownerId)?.has(subscription.ownerId)),
    ) ?? { status: "expired", expiresAt: null }),
  ));
}

const canonicalGregorianDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, "التاريخ غير صالح");
const insuranceAmountInput = z.union([z.string(), z.number()])
  .transform((value) => String(value))
  .optional()
  .nullable();

function normalizeInsuranceConfig(
  requiresInsurance: boolean,
  insuranceAmount: string | null | undefined,
) {
  if (!requiresInsurance) {
    return { requiresInsurance: false, insuranceAmount: null };
  }
  const normalizedAmount = insuranceAmount?.trim() ?? "";
  const amount = Number(normalizedAmount);
  if (!normalizedAmount || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return { requiresInsurance: true, insuranceAmount: amount.toFixed(2) };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  return next();
}

/* Public service contract view — customers can open the shared contract link. */
router.get("/service-contract/:appointmentId", async (req, res) => {
  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: "معرّف العقد غير صالح" });
  }
  const [row] = await db
    .select({
      id: serviceAppointmentsTable.id,
      clientName: serviceAppointmentsTable.clientName,
      clientPhone: serviceAppointmentsTable.clientPhone,
      serviceAddress: serviceAppointmentsTable.serviceAddress,
      serviceDeliveryMethod: serviceAppointmentsTable.serviceDeliveryMethod,
      notes: serviceAppointmentsTable.notes,
      dateStr: serviceAppointmentsTable.dateStr,
      duration: serviceAppointmentsTable.duration,
      durationUnit: serviceAppointmentsTable.durationUnit,
      amount: serviceAppointmentsTable.amount,
      status: serviceAppointmentsTable.status,
      cancelledAt: serviceAppointmentsTable.cancelledAt,
      contractSigned: serviceAppointmentsTable.contractSigned,
      contractSignatureDataUrl: serviceAppointmentsTable.contractSignatureDataUrl,
      contractSignedAt: serviceAppointmentsTable.contractSignedAt,
      businessName: serviceProvidersTable.businessName,
      city: serviceProvidersTable.city,
      whatsappNumber: serviceProvidersTable.whatsappNumber,
      logoUrl: serviceProvidersTable.logoUrl,
      contractText: serviceProvidersTable.contractText,
      includeElectronicSignature: serviceProvidersTable.includeElectronicSignature,
      requiresContract: serviceProvidersTable.requiresContract,
    })
    .from(serviceAppointmentsTable)
    .innerJoin(serviceProvidersTable, eq(serviceProvidersTable.id, serviceAppointmentsTable.providerId))
    .where(eq(serviceAppointmentsTable.id, appointmentId))
    .limit(1);
  if (!row || !row.requiresContract) return res.status(404).json({ error: "العقد غير موجود" });
  return res.json(row);
});

router.post("/service-contract/:appointmentId/sign", async (req, res) => {
  const appointmentId = Number(req.params.appointmentId);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: "معرّف العقد غير صالح" });
  }
  const signatureDataUrl = typeof req.body?.signatureDataUrl === "string" ? req.body.signatureDataUrl : "";
  if (!signatureDataUrl.startsWith("data:image/png;base64,") || signatureDataUrl.length > 2_000_000) {
    return res.status(400).json({ error: "بيانات التوقيع غير صالحة" });
  }
  const [contract] = await db
    .select({
      id: serviceAppointmentsTable.id,
      status: serviceAppointmentsTable.status,
      cancelledAt: serviceAppointmentsTable.cancelledAt,
      contractSigned: serviceAppointmentsTable.contractSigned,
      requiresContract: serviceProvidersTable.requiresContract,
      includeElectronicSignature: serviceProvidersTable.includeElectronicSignature,
    })
    .from(serviceAppointmentsTable)
    .innerJoin(serviceProvidersTable, eq(serviceProvidersTable.id, serviceAppointmentsTable.providerId))
    .where(eq(serviceAppointmentsTable.id, appointmentId))
    .limit(1);
  if (!contract || !contract.requiresContract) return res.status(404).json({ error: "العقد غير موجود" });
  if (!contract.includeElectronicSignature) return res.status(409).json({ error: "التوقيع الإلكتروني غير مفعّل لهذا العقد" });
  if (contract.status === "cancelled" || contract.cancelledAt) return res.status(410).json({ error: "لا يمكن توقيع عقد حجز ملغى" });
  if (contract.contractSigned) return res.status(409).json({ error: "تم توقيع هذا العقد مسبقاً" });

  const [updated] = await updateRecords(db, serviceAppointmentsTable, {
      contractSigned: true,
      contractSignatureDataUrl: signatureDataUrl,
      contractSignedAt: new Date(),
    }, eq(serviceAppointmentsTable.id, appointmentId), {
      contractSigned: serviceAppointmentsTable.contractSigned,
      contractSignatureDataUrl: serviceAppointmentsTable.contractSignatureDataUrl,
      contractSignedAt: serviceAppointmentsTable.contractSignedAt,
    });
  return res.json(updated);
});

/* ── Public: list approved providers ─────────────── */
router.get("/:providerId/catalog", async (req, res) => {
  const id = Number(req.params.providerId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return res.status(400).json({ error: "معرّف الخدمة غير صالح" });
  const [provider] = await db.select({ id: serviceProvidersTable.id, ownerId: serviceProvidersTable.ownerId })
    .from(serviceProvidersTable).where(and(eq(serviceProvidersTable.id, id), eq(serviceProvidersTable.isActive, true))).limit(1);
  if (!provider || !provider.ownerId || !(await activeInventoryOwnerIds([provider.ownerId])).has(provider.ownerId)) {
    return res.status(404).json({ error: "الخدمة غير متاحة" });
  }
  return res.json(await getPublicCatalog(id));
});
router.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : undefined;
  const conditions: any[] = [eq(serviceProvidersTable.isActive, true)];
  if (category && category !== "all") {
    conditions.push(eq(serviceProvidersTable.category, category));
  }
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(and(...conditions));
  const matching = rows.filter(row => providerCoversCity(row, city, ALL_KINGDOM_COVERAGE));
  const activeOwners = await activeInventoryOwnerIds(matching.map((row) => row.ownerId));
  return res.json(shuffledInventory(matching.filter((row) => row.ownerId && activeOwners.has(row.ownerId))));
});

/* Active catalog entries remain selectable even before their first provider. */
router.get("/search-options", async (_req, res) => {
  const providers = await db
    .select({
      ownerId: serviceProvidersTable.ownerId,
      category: serviceProvidersTable.category,
      city: serviceProvidersTable.city,
      coverageTags: serviceProvidersTable.coverageTags,
    })
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.isActive, true));
  const activeOwners = await activeInventoryOwnerIds(providers.map((provider) => provider.ownerId));
  const activeProviders = providers.filter((provider) => provider.ownerId && activeOwners.has(provider.ownerId));

  const categories = await db
      .select({
        id: serviceCategoriesTable.id,
        key: serviceCategoriesTable.key,
        labelAr: serviceCategoriesTable.labelAr,
        emoji: serviceCategoriesTable.emoji,
      })
      .from(serviceCategoriesTable)
      .where(eq(serviceCategoriesTable.isActive, true))
      .orderBy(serviceCategoriesTable.sortOrder, serviceCategoriesTable.id);

  const catalogCities = await db
    .select({
      id: serviceCitiesCatalogTable.id, name: serviceCitiesCatalogTable.name,
      isActive: serviceCitiesCatalogTable.isActive, regionActive: serviceRegionsCatalogTable.isActive,
    })
    .from(serviceCitiesCatalogTable)
    .innerJoin(serviceRegionsCatalogTable, eq(serviceCitiesCatalogTable.regionId, serviceRegionsCatalogTable.id))
    .orderBy(serviceCitiesCatalogTable.name);
  const knownCities = new Set(catalogCities.map(city => normalizeCityName(city.name)));
  const cities = catalogCities.filter(city => city.isActive && city.regionActive)
    .map(({ id, name }) => ({ id, name }));
  // Keep old provider coverage searchable, but never reintroduce disabled catalog entries.
  const legacyNames = [...new Set(activeProviders.flatMap(provider => [provider.city, ...(provider.coverageTags ?? [])])
    .map(city => city?.trim()).filter((city): city is string => !!city && city !== ALL_KINGDOM_COVERAGE))]
    .filter(city => !knownCities.has(normalizeCityName(city)));
  cities.push(...legacyNames.map((name, index) => ({ id: -(index + 1), name })));

  return res.json({ categories, cities });
});

// Static catalog route must precede /:id.
router.get("/global-seasons", requireAuth, async (_req: any, res) => {
  const rows = await db.select({
    id: globalSeasonsTable.id,
    nameAr: globalSeasonsTable.nameAr,
    startDate: globalSeasonsTable.startDate,
    endDate: globalSeasonsTable.endDate,
  }).from(globalSeasonsTable).where(eq(globalSeasonsTable.isActive, true))
    .orderBy(globalSeasonsTable.startDate, globalSeasonsTable.id);
  return res.json(rows);
});

/* ── Public: single provider ──────────────────────── */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id));

  if (!provider || !provider.ownerId || !(await activeInventoryOwnerIds([provider.ownerId])).has(provider.ownerId)) {
    return res.status(404).json({ error: "مزود الخدمة غير موجود" });
  }
  return res.json(provider);
});

/* ── Owner: submit new provider application ────────── */
router.post("/submit", requireAuth, async (req: any, res) => {
  // Storage paths are relative (/api/storage/...), not full URLs,
  // so we validate them as non-empty strings — not with .url()
  const schema = z.object({
    businessName: z.string().min(2, "اسم النشاط يجب أن يكون حرفين على الأقل"),
    category: z.string().min(1, "يرجى اختيار فئة الخدمة"),
    serviceRegionId: z.number().int().positive(),
    serviceCityId: z.number().int().positive(),
    city: z.string().min(1, "يرجى اختيار المدينة"),
    descriptionAr: z.string().optional(),
    whatsappNumber: z.string().min(9, "رقم الواتساب يجب أن يكون 9 أرقام على الأقل"),
    instagramAccount: z.string().trim().max(200, "حساب إنستقرام طويل جداً").nullable().optional(),
    logoUrl: z.string().min(1).optional().or(z.literal("")),
    galleryPhotos: z
      .array(z.string().min(1))
      .min(3, "يجب رفع 3 صور على الأقل للمعرض"),
    videoUrl: z.string().min(1).optional().or(z.literal("")),
    yearsOfExperience: z.number().int().min(0).optional(),
    pricingUnit: z.enum(["per_day", "per_hour", "per_request"], {
      errorMap: () => ({ message: "يرجى اختيار وحدة التسعير" }),
    }),
    dailyCapacity: z.number().int().min(1, "يجب أن يكون العدد حجزاً واحداً على الأقل"),
    requiresInsurance: z.boolean().default(false),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).min(1, "يرجى إضافة نطاق الخدمة").default([]),
    customFeatureTags: z.array(z.string()).default([]),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = (msgs as string[])[0] ?? "خطأ في البيانات";
    }
    return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors });
  }

  const data = parsed.data;
  if (!isArabicServiceCategoryName(data.category)) {
    const [category] = await db.select({ id: serviceCategoriesTable.id }).from(serviceCategoriesTable)
      .where(eq(serviceCategoriesTable.key, data.category)).limit(1);
    if (!category) return res.status(422).json({
      error: "اختر فئة من القائمة أو اكتب اسمها بالعربية",
      fieldErrors: { category: "اختر فئة من القائمة أو اكتب اسمها بالعربية" },
    });
  }
  const access = await ownerPlanAccess(req.user.id);
  if (!access.canSubmitActivities) {
    return res.status(403).json({ error: "انتهى اشتراكك. جدّده لإضافة خدمة جديدة.", upgradeRequired: true });
  }
  if (access.serviceCount >= access.serviceLimit) {
    return res.status(403).json({ error: "وصلت إلى الحد الأقصى للخدمات في باقتك. جدّد اشتراكك أو اختر باقة أعلى.", upgradeRequired: true });
  }
  const [activeServiceCity] = await db
    .select({ id: serviceCitiesCatalogTable.id, name: serviceCitiesCatalogTable.name })
    .from(serviceCitiesCatalogTable)
    .innerJoin(serviceRegionsCatalogTable, eq(serviceCitiesCatalogTable.regionId, serviceRegionsCatalogTable.id))
    .where(and(
      eq(serviceCitiesCatalogTable.id, data.serviceCityId),
      eq(serviceCitiesCatalogTable.regionId, data.serviceRegionId),
      eq(serviceCitiesCatalogTable.isActive, true),
      eq(serviceRegionsCatalogTable.isActive, true),
    ));
  if (!activeServiceCity || activeServiceCity.name !== data.city) {
    return res.status(422).json({
      error: "المنطقة أو المدينة غير مفعلة",
      fieldErrors: { city: "يرجى اختيار مدينة مفعلة من القائمة" },
    });
  }
  const insuranceConfig = normalizeInsuranceConfig(data.requiresInsurance, data.insuranceAmount);
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: "قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر" },
    });
  }

  /* ── Unique business name per city check ──────────────────── */
  const [dupProvider] = await db
    .select({ id: serviceProviderSubmissionsTable.id })
    .from(serviceProviderSubmissionsTable)
    .where(
      and(
        sql`lower(${serviceProviderSubmissionsTable.businessName}) = lower(${data.businessName})`,
        sql`lower(${serviceProviderSubmissionsTable.city}) = lower(${data.city})`,
        ne(serviceProviderSubmissionsTable.status, "rejected"),
      )
    )
    .limit(1);
  if (dupProvider) {
    return res.status(409).json({
      error: "عذراً، هذا الاسم مستخدم مسبقاً في هذه المدينة. يرجى اختيار اسم مختلف",
    });
  }

  // Clean up empty strings from optional URL fields
  const values = {
    ownerId: req.user.id,
    businessName: data.businessName,
    category: data.category,
    serviceRegionId: data.serviceRegionId,
    serviceCityId: data.serviceCityId,
    city: data.city,
    descriptionAr: data.descriptionAr ?? null,
    whatsappNumber: data.whatsappNumber,
    instagramAccount: data.instagramAccount || null,
    logoUrl: data.logoUrl || null,
    galleryPhotos: data.galleryPhotos,
    videoUrl: data.videoUrl || null,
    yearsOfExperience: data.yearsOfExperience ?? null,
    pricingUnit: data.pricingUnit,
    dailyCapacity: data.dailyCapacity,
    ...insuranceConfig,
    coverageTags: data.coverageTags,
    customFeatureTags: data.customFeatureTags,
  };

  if (!/^owner_\d+$/.test(req.user.id)) {
    await ensureOwnerProfile(
      {
        userId: req.user.id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
      },
      {
        businessName: data.businessName,
        phone: data.whatsappNumber,
        businessType: "service",
      },
    );
  }

  const [row] = await db.transaction(async (tx) => {
    await lockResource(tx, 731206, access.subscription.ownerId);
    const currentAccess = await ownerPlanAccess(req.user.id);
    if (!currentAccess.canSubmitActivities ||
        currentAccess.serviceCount >= currentAccess.serviceLimit) return [null];
    await includeOwnerActivityKind(tx, req.user!.id, "service");
    return insertRecords(tx, serviceProviderSubmissionsTable, values);
  });
  if (!row) {
    return res.status(403).json({ error: "تعذر إضافة الخدمة ضمن السعة الحالية. راجع حدود الباقة وحالة الاشتراك.", upgradeRequired: true });
  }

  return res.status(201).json(row);
});

/* ── Owner: my submissions ─────────────────────────── */
router.get("/my/submissions", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(and(
      eq(serviceProviderSubmissionsTable.ownerId, req.user.id),
      ne(serviceProviderSubmissionsTable.status, "approved"),
    ))
    .orderBy(serviceProviderSubmissionsTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Owner: one pending submission ─────────────────── */
router.get("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [submission] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);

  if (!submission || submission.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  return res.json(submission);
});

/* ── Owner: update own pending submission ──────────── */
router.patch("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [submission] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);

  if (!submission || submission.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  if (submission.status === "approved") {
    return res.status(400).json({ error: "لا يمكن تعديل طلب معتمد من هنا" });
  }

  const schema = z.object({
    businessName: z.string().min(2, "اسم النشاط يجب أن يكون حرفين على الأقل").optional(),
    category: z.string().min(1, "يرجى اختيار فئة الخدمة").optional(),
    serviceRegionId: z.number().int().positive().optional(),
    serviceCityId: z.number().int().positive().optional(),
    city: z.string().min(1, "يرجى اختيار المدينة").optional(),
    descriptionAr: z.string().optional().nullable(),
    whatsappNumber: z.string().min(9, "رقم الواتساب يجب أن يكون 9 أرقام على الأقل").optional(),
    instagramAccount: z.string().trim().max(200, "حساب إنستقرام طويل جداً").transform(value => value || null).nullable().optional(),
    logoUrl: z.string().optional().nullable(),
    galleryPhotos: z.array(z.string().min(1)).min(3, "يجب رفع 3 صور على الأقل").optional(),
    videoUrl: z.string().optional().nullable(),
    yearsOfExperience: z.number().int().min(0).optional().nullable(),
    pricingUnit: z.enum(["per_day", "per_hour", "per_request"]).optional(),
    dailyCapacity: z.number().int().min(1).optional(),
    requiresInsurance: z.boolean().optional(),
    requiresContract: z.boolean().optional(),
    contractText: z.string().optional().nullable(),
    includeElectronicSignature: z.boolean().optional(),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).min(1, "يرجى إضافة نطاق الخدمة").optional(),
    customFeatureTags: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "بيانات غير صحيحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  if (parsed.data.category && !isArabicServiceCategoryName(parsed.data.category)) {
    const [category] = await db.select({ id: serviceCategoriesTable.id }).from(serviceCategoriesTable)
      .where(eq(serviceCategoriesTable.key, parsed.data.category)).limit(1);
    if (!category) return res.status(422).json({
      error: "اختر فئة من القائمة أو اكتب اسمها بالعربية",
      fieldErrors: { category: "اختر فئة من القائمة أو اكتب اسمها بالعربية" },
    });
  }
  const nextRegionId = parsed.data.serviceRegionId ?? submission.serviceRegionId;
  const nextCityId = parsed.data.serviceCityId ?? submission.serviceCityId;
  const nextCityName = parsed.data.city ?? submission.city;
  if (nextRegionId != null || nextCityId != null) {
    if (nextRegionId == null || nextCityId == null) {
      return res.status(422).json({ error: "يجب اختيار المنطقة والمدينة معاً" });
    }
    const [activeServiceCity] = await db
      .select({ name: serviceCitiesCatalogTable.name })
      .from(serviceCitiesCatalogTable)
      .innerJoin(serviceRegionsCatalogTable, eq(serviceCitiesCatalogTable.regionId, serviceRegionsCatalogTable.id))
      .where(and(
        eq(serviceCitiesCatalogTable.id, nextCityId),
        eq(serviceCitiesCatalogTable.regionId, nextRegionId),
        eq(serviceCitiesCatalogTable.isActive, true),
        eq(serviceRegionsCatalogTable.isActive, true),
      ));
    if (!activeServiceCity || activeServiceCity.name !== nextCityName) {
      return res.status(422).json({ error: "يرجى اختيار منطقة ومدينة مفعلتين" });
    }
  }
  const insuranceConfig = normalizeInsuranceConfig(
    parsed.data.requiresInsurance ?? submission.requiresInsurance,
    parsed.data.insuranceAmount === undefined ? submission.insuranceAmount : parsed.data.insuranceAmount,
  );
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: ["قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر"] },
    });
  }

  const [updated] = await updateRecords(db, serviceProviderSubmissionsTable, {
      ...parsed.data,
      ...insuranceConfig,
      status: "pending",
      adminNote: null,
    }, eq(serviceProviderSubmissionsTable.id, id));

  return res.json(updated);
});

/* ── Owner: delete own pending submission ─────────── */
router.delete("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [sub] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);
  if (!sub || sub.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  if (sub.status === "approved") {
    return res.status(400).json({ error: "لا يمكن حذف طلب معتمد. تواصل مع الدعم." });
  }
  await db.delete(serviceProviderSubmissionsTable).where(eq(serviceProviderSubmissionsTable.id, id));
  return res.json({ ok: true });
});

/* ── Owner: my approved provider listings ─────────── */
router.get("/my/approved", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.ownerId, req.user.id))
    .orderBy(serviceProvidersTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Owner: toggle active for approved provider ───── */
router.patch("/my/approved/:id/toggle", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id))
    .limit(1);
  if (!provider || provider.ownerId !== req.user.id) {
    return res.status(404).json({ error: "المزود غير موجود" });
  }
  const [updated] = await updateRecords(db, serviceProvidersTable, { isActive: !provider.isActive }, eq(serviceProvidersTable.id, id));
  return res.json({ isActive: updated.isActive });
});

/* ── Owner: delete approved provider (with upcoming appointments check) ── */
router.delete("/my/approved/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, id)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const [saleHistory] = await db.select({ id: quickSalesTable.id }).from(quickSalesTable).where(eq(quickSalesTable.providerId, id)).limit(1);
  if (saleHistory) return res.status(409).json({ error: "لا يمكن حذف نشاط له سجل مبيعات مفردة؛ يمكنك إيقاف النشاط مع الاحتفاظ بالسجل المالي" });

  // Check for upcoming appointments (future date, not cancelled)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db
    .select({ id: serviceAppointmentsTable.id })
    .from(serviceAppointmentsTable)
    .where(and(
      eq(serviceAppointmentsTable.providerId, id),
      isNull(serviceAppointmentsTable.cancelledAt),
      gte(serviceAppointmentsTable.dateStr, today),
    ))
    .limit(1);

  if (upcoming.length > 0) {
    return res.status(409).json({ error: "لا يمكن الحذف لوجود حجوزات مستقبلية", hasUpcomingBookings: true });
  }

  // Delete the service provider (cascade handles appointments, seasons, insurances, etc.)
  await db.delete(serviceProvidersTable).where(eq(serviceProvidersTable.id, id));
  return res.json({ ok: true });
});

/* ── Public: request new city from admin ──────────── */
router.post("/city-request", requireAuth, async (req: any, res) => {
  const parsed = CreateServiceCityRequestBody.safeParse({
    ...req.body, city: typeof req.body.city === "string" ? req.body.city.trim() : "",
  });
  if (!parsed.success) return res.status(400).json({ error: "اسم المدينة مطلوب ويجب أن يكون بين حرفين و١٠٠ حرف" });
  try {
    const name = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.nameAr || "مقدم خدمة";
    return res.status(201).json(await createCityRequest(parsed.data, req.user.id, name));
  } catch (error) {
    if (error instanceof CityRequestError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});

/* ── Owner: update approved provider details ────────── */
router.patch("/my/approved/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, id)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    businessName: z.string().min(2).optional(),
    descriptionAr: z.string().optional().nullable(),
    whatsappNumber: z.string().min(9).optional(),
    instagramAccount: z.string().trim().max(200, "حساب إنستقرام طويل جداً").transform(value => value || null).nullable().optional(),
    city: z.string().min(1).optional(),
    logoUrl: z.string().optional().nullable(),
    galleryPhotos: z.array(z.string()).optional(),
    videoUrl: z.string().optional().nullable(),
    yearsOfExperience: z.number().int().min(0).optional().nullable(),
    requiresInsurance: z.boolean().optional(),
    requiresContract: z.boolean().optional(),
    contractText: z.string().optional().nullable(),
    includeElectronicSignature: z.boolean().optional(),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).optional(),
    customFeatureTags: z.array(z.string()).optional(),
    photoCaptions: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });
  const insuranceConfig = normalizeInsuranceConfig(
    parsed.data.requiresInsurance ?? provider.requiresInsurance,
    parsed.data.insuranceAmount === undefined ? provider.insuranceAmount : parsed.data.insuranceAmount,
  );
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: ["قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر"] },
    });
  }

  const [updated] = await updateRecords(db, serviceProvidersTable, {
    ...parsed.data,
    ...insuranceConfig,
  }, eq(serviceProvidersTable.id, id));
  return res.json(updated);
});

/* ── Owner: provider-scoped review management ────────── */
router.post("/my/approved/:id/reviews/:reviewId/report", requireAuth, async (req, res) => {
  const providerId = Number(req.params.id);
  const reviewId = Number(req.params.reviewId);
  if (!Number.isSafeInteger(providerId) || !Number.isSafeInteger(reviewId)) return res.status(400).json({ error: "معرّف غير صحيح" });
  const parsed = z.object({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "اكتب سبب الاعتراض (حتى ٥٠٠ حرف)" });
  const [provider] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user!.id))).limit(1);
  if (!provider) return res.status(404).json({ error: "الخدمة غير موجودة" });
  const [updated] = await updateRecords(db, serviceReviewsTable, { reportedBy: req.user!.id, reportedAt: new Date(), reportReason: parsed.data.reason }, and(eq(serviceReviewsTable.id, reviewId), eq(serviceReviewsTable.providerId, providerId), sql`${serviceReviewsTable.reportedAt} IS NULL`), { id: serviceReviewsTable.id });
  if (!updated) return res.status(409).json({ error: "التقييم غير موجود أو لديه اعتراض قيد المراجعة" });
  return res.json({ ok: true });
});

router.get("/my/approved/:id/reviews", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select({ id: serviceProvidersTable.id })
    .from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id)))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const rows = await db.select().from(serviceReviewsTable)
    .where(eq(serviceReviewsTable.providerId, providerId))
    .orderBy(desc(serviceReviewsTable.createdAt));
  return res.json(rows);
});

router.post("/my/approved/:id/review-invite", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id)))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const parsed = z.object({ guestName: z.string().trim().max(255).optional().nullable() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });
  const token = randomBytes(5).toString("hex");
  const [invitation] = await insertRecords(db, serviceReviewInvitationsTable, {
    token,
    providerId,
    guestName: parsed.data.guestName || null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return res.status(201).json({ token: invitation.token, providerName: provider.businessName });
});

router.post("/my/approved/:id/reviews/:reviewId/reply", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const reviewId = Number(req.params.reviewId);
  const parsed = z.object({ reply: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "الرد غير صحيح" });
  const [provider] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id))).limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const [updated] = await updateRecords(db, serviceReviewsTable, { ownerReply: parsed.data.reply, ownerReplyAt: new Date() }, and(eq(serviceReviewsTable.id, reviewId), eq(serviceReviewsTable.providerId, providerId)));
  if (!updated) return res.status(404).json({ error: "التقييم غير موجود" });
  return res.json(updated);
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — BLOCKED DATES
   ════════════════════════════════════════════════════════ */

/* GET /my/approved/:id/blocked-dates */
router.get("/my/approved/:id/blocked-dates", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const rows = await db.select().from(serviceBlockedDatesTable)
    .where(and(eq(serviceBlockedDatesTable.providerId, providerId), eq(serviceBlockedDatesTable.ownerId, req.user.id)))
    .orderBy(desc(serviceBlockedDatesTable.dateStr));
  return res.json(rows);
});

/* POST /my/approved/:id/blocked-dates */
router.post("/my/approved/:id/blocked-dates", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({ dateStr: z.string().min(1), reason: z.string().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "تاريخ غير صحيح" });

  const result = await db.transaction(async (tx) => {
    await lockResource(tx, providerId, parsed.data.dateStr);

    const [activeAppointment] = await tx.select({ id: serviceAppointmentsTable.id })
      .from(serviceAppointmentsTable)
      .where(and(
        eq(serviceAppointmentsTable.providerId, providerId),
        eq(serviceAppointmentsTable.ownerId, req.user.id),
        eq(serviceAppointmentsTable.dateStr, parsed.data.dateStr),
        ne(serviceAppointmentsTable.status, "cancelled"),
      ))
      .limit(1);
    if (activeAppointment) return { activeAppointment: true as const };

    const [existing] = await tx.select().from(serviceBlockedDatesTable)
      .where(and(
        eq(serviceBlockedDatesTable.providerId, providerId),
        eq(serviceBlockedDatesTable.dateStr, parsed.data.dateStr),
      ))
      .limit(1);
    if (existing) return { activeAppointment: false as const, created: false as const, row: existing };

    const [row] = await insertRecords(tx, serviceBlockedDatesTable, {
      providerId,
      ownerId: req.user.id,
      dateStr: parsed.data.dateStr,
      reason: parsed.data.reason ?? null,
    });
    return { activeAppointment: false as const, created: true as const, row };
  });

  if (result.activeAppointment) {
    res.status(409).json({
      error: "لا يمكن إغلاق يوم يحتوي على حجوزات نشطة",
      code: "ACTIVE_APPOINTMENTS_ON_DATE",
    });
    return;
  }
  return res.status(result.created ? 201 : 200).json(result.row);
});

/* DELETE /my/approved/:id/blocked-dates/:dateId */
router.delete("/my/approved/:id/blocked-dates/:dateId", requireAuth, async (req: any, res) => {
  const dateId = Number(req.params.dateId);
  const [row] = await db.select().from(serviceBlockedDatesTable).where(eq(serviceBlockedDatesTable.id, dateId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "التاريخ غير موجود" });
  await db.delete(serviceBlockedDatesTable).where(eq(serviceBlockedDatesTable.id, dateId));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — SEASONS
   ════════════════════════════════════════════════════════ */

async function serviceSeasonResponse(row: typeof serviceSeasonsTable.$inferSelect) {
  if (!row.globalSeasonId) return row;
  const [definition] = await db.select().from(globalSeasonsTable)
    .where(eq(globalSeasonsTable.id, row.globalSeasonId)).limit(1);
  return definition ? {
    ...row, name: definition.nameAr, startDate: definition.startDate,
    endDate: definition.endDate, isActive: row.isActive && definition.isActive,
  } : row;
}

router.get("/my/approved/:id/seasons", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id))).limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const rows = await db.select({ season: serviceSeasonsTable, definition: globalSeasonsTable })
    .from(serviceSeasonsTable)
    .leftJoin(globalSeasonsTable, eq(serviceSeasonsTable.globalSeasonId, globalSeasonsTable.id))
    .where(and(eq(serviceSeasonsTable.providerId, providerId), eq(serviceSeasonsTable.ownerId, req.user.id)))
    .orderBy(desc(serviceSeasonsTable.createdAt));
  return res.json(rows.map(({ season, definition }) => definition ? {
    ...season, name: definition.nameAr, startDate: definition.startDate,
    endDate: definition.endDate, isActive: season.isActive && definition.isActive,
  } : season));
});

router.post("/my/approved/:id/seasons", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = CreateServiceSeasonBody.extend({
    name: z.string().trim().min(1).optional(),
    startDate: canonicalGregorianDate.optional(),
    endDate: canonicalGregorianDate.optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  let { name, startDate, endDate } = parsed.data;
  if (parsed.data.globalSeasonId) {
    const [definition] = await db.select().from(globalSeasonsTable)
      .where(and(eq(globalSeasonsTable.id, parsed.data.globalSeasonId), eq(globalSeasonsTable.isActive, true))).limit(1);
    if (!definition) return res.status(422).json({ error: "الموسم العام غير متاح" });
    name = definition.nameAr; startDate = definition.startDate; endDate = definition.endDate;
  }
  if (!name || !startDate || !endDate || endDate < startDate) {
    return res.status(422).json({ error: "اسم الموسم والتواريخ مطلوبة، ويجب ألا يسبق تاريخ الانتهاء تاريخ البدء" });
  }
  const [row] = await insertRecords(db, serviceSeasonsTable, {
    providerId, ownerId: req.user.id, ...parsed.data, name, startDate, endDate,
  }, { conflict: { action: "ignore", target: [serviceSeasonsTable.providerId, serviceSeasonsTable.globalSeasonId] } });
  if (!row) return res.status(409).json({ error: "هذا الموسم العام مسجل لهذه الخدمة بالفعل" });
  return res.status(201).json(await serviceSeasonResponse(row));
});

router.patch("/my/approved/:id/seasons/:seasonId", requireAuth, async (req: any, res) => {
  const seasonId = Number(req.params.seasonId);
  const [row] = await db.select().from(serviceSeasonsTable)
    .where(and(eq(serviceSeasonsTable.id, seasonId), eq(serviceSeasonsTable.providerId, Number(req.params.id)))).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الموسم غير موجود" });

  const schema = UpdateServiceSeasonBody.extend({
    name: z.string().trim().min(1).optional(),
    startDate: canonicalGregorianDate.optional(),
    endDate: canonicalGregorianDate.optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  if (row.globalSeasonId && ["name", "startDate", "endDate", "globalSeasonId"].some(key => key in req.body)) {
    return res.status(422).json({ error: "اسم الموسم العام وتواريخه تُدار من إدارة المنصة" });
  }
  if ((parsed.data.endDate ?? row.endDate) < (parsed.data.startDate ?? row.startDate)) {
    return res.status(422).json({ error: "تاريخ الانتهاء يجب ألا يسبق تاريخ البدء" });
  }
  const [updated] = await updateRecords(db, serviceSeasonsTable, parsed.data, eq(serviceSeasonsTable.id, seasonId));
  return res.json(await serviceSeasonResponse(updated));
});

router.delete("/my/approved/:id/seasons/:seasonId", requireAuth, async (req: any, res) => {
  const seasonId = Number(req.params.seasonId);
  const [row] = await db.select().from(serviceSeasonsTable)
    .where(and(eq(serviceSeasonsTable.id, seasonId), eq(serviceSeasonsTable.providerId, Number(req.params.id)))).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الموسم غير موجود" });
  await db.delete(serviceSeasonsTable).where(eq(serviceSeasonsTable.id, seasonId));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — APPOINTMENTS
   ════════════════════════════════════════════════════════ */

router.get("/my/approved/:id/appointments", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const rows = await db.select().from(serviceAppointmentsTable)
    .where(and(eq(serviceAppointmentsTable.providerId, providerId), eq(serviceAppointmentsTable.ownerId, req.user.id)))
    .orderBy(desc(serviceAppointmentsTable.dateStr));
  return res.json(rows);
});

router.post("/my/approved/:id/appointments", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });
  const access = await ownerPlanAccess(req.user.id);
  if (!access.active) {
    return res.status(403).json({ error: "انتهى اشتراكك. جدّده لإضافة مواعيد جديدة.", upgradeRequired: true });
  }

  const schema = z.object({
    clientName: z.string().min(1),
    clientPhone: z.string().trim().min(1, "رقم الجوال مطلوب"),
    serviceAddress: z.string().optional().nullable(),
    serviceDeliveryMethod: z.enum(["delivery_installation", "customer_pickup"]),
    clientIdNumber: z.string().optional().nullable(),
    dateStr: canonicalGregorianDate,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    duration: z.string().optional().nullable(),
    durationUnit: z.enum(["hours", "days"]).optional(),
    status: z.enum(["confirmed", "pending", "cancelled"]).default("confirmed"),
    notes: z.string().trim().min(1, "تفاصيل الخدمة مطلوبة"),
    amount: z.string().optional().nullable(),
    deposit: z.string().optional().nullable(),
    insuranceAmount: serviceAppointmentInsuranceAmount,
    source: z.enum(["platform", "whatsapp", "phone", "walk_in", "external"]).default("external"),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).default("cash"),
    paymentReceiptUrl: z.string().optional().nullable(),
    cashDeposited: z.boolean().optional().default(false),
    contractSigned: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });
  const phoneNormalized = normalizeCustomerPhone(parsed.data.clientPhone);

  const result = await db.transaction(async (tx) => {
    if (parsed.data.status !== "cancelled") {
      // Serialize all capacity-consuming writes for this provider and date.
      await lockResource(tx, providerId, parsed.data.dateStr);
      const [blockedDate] = await tx
        .select({ id: serviceBlockedDatesTable.id })
        .from(serviceBlockedDatesTable)
        .where(and(
          eq(serviceBlockedDatesTable.providerId, providerId),
          eq(serviceBlockedDatesTable.dateStr, parsed.data.dateStr),
        ))
        .limit(1);
      if (blockedDate) return { blocked: true as const };

      const [capacityRow] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(serviceAppointmentsTable)
        .where(and(
          eq(serviceAppointmentsTable.providerId, providerId),
          eq(serviceAppointmentsTable.dateStr, parsed.data.dateStr),
          ne(serviceAppointmentsTable.status, "cancelled"),
        ));
      const dailyCapacity = Math.max(1, provider.dailyCapacity ?? 1);
      if ((capacityRow?.count ?? 0) >= dailyCapacity) return { blocked: false as const, full: true as const, dailyCapacity };
    }

    await writeRecords(tx, ownerCustomersTable, {
      ownerId: req.user.id,
      phoneNormalized,
      phone: phoneNormalized,
      name: parsed.data.clientName.trim(),
      serviceAddress: parsed.data.serviceAddress?.trim() || null,
      serviceDeliveryMethod: parsed.data.serviceDeliveryMethod,
      clientIdNumber: provider.requiresInsurance ? (parsed.data.clientIdNumber?.trim() || null) : null,
    }, { conflict: { action: "update", ...{
      target: [ownerCustomersTable.ownerId, ownerCustomersTable.phoneNormalized],
      set: {
        phone: phoneNormalized,
        name: parsed.data.clientName.trim(),
        serviceAddress: sql`coalesce(nullif(${parsed.data.serviceAddress?.trim() || null}, ''), ${ownerCustomersTable.serviceAddress})`,
        serviceDeliveryMethod: parsed.data.serviceDeliveryMethod,
        clientIdNumber: provider.requiresInsurance
          ? sql`coalesce(nullif(${parsed.data.clientIdNumber?.trim() || null}, ''), ${ownerCustomersTable.clientIdNumber})`
          : sql`${ownerCustomersTable.clientIdNumber}`,
        updatedAt: new Date(),
      },
    } } });

    const [row] = await insertRecords(tx, serviceAppointmentsTable, {
      providerId,
      ownerId: req.user.id,
      ...parsed.data,
      clientPhone: phoneNormalized,
      clientIdNumber: provider.requiresInsurance ? (parsed.data.clientIdNumber || null) : null,
      insuranceAmount: initialAppointmentInsurance(provider, parsed.data.insuranceAmount),
    });
    return { blocked: false as const, full: false as const, row };
  });

  if (result.blocked) {
    return res.status(409).json({
      error: "هذا اليوم مغلق وغير متاح للحجز",
      code: "SERVICE_DATE_BLOCKED",
    });
  }
  if (result.full) {
    return res.status(409).json({
      error: "اكتملت الطاقة الاستيعابية لهذا اليوم",
      code: "DAILY_CAPACITY_REACHED",
      dailyCapacity: result.dailyCapacity,
    });
  }
  const row = result.row;
  return res.status(201).json(row);
});

router.post("/my/approved/:id/appointments/:apptId/payments", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const apptId = Number(req.params.apptId);
  const parsed = RecordServiceAppointmentPaymentBody.safeParse(req.body);
  if (!Number.isSafeInteger(providerId) || !Number.isSafeInteger(apptId) || !parsed.success) {
    return res.status(422).json({ error: "بيانات الدفعة غير صحيحة" });
  }
  // Work in halalas, and serialize competing additions on the actual booking row.
  const halalas = (value: string | number | null) => Math.round(Number(value ?? 0) * 100);
  const added = halalas(parsed.data.amount);
  if (added <= 0) return res.status(422).json({ error: "أدخل مبلغ دفعة أكبر من صفر" });
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(serviceAppointmentsTable)
      .where(and(
        eq(serviceAppointmentsTable.id, apptId),
        eq(serviceAppointmentsTable.providerId, providerId),
        eq(serviceAppointmentsTable.ownerId, req.user.id),
      )).for("update");
    const [provider] = await tx.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
      .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id))).limit(1);
    if (!row || !provider) return { status: 404, error: "الحجز غير موجود" };
    if (row.status === "cancelled") return { status: 409, error: "لا يمكن تسجيل دفعة لحجز ملغي" };
    const paid = halalas(row.deposit);
    const total = halalas(row.amount);
    if (!Number.isSafeInteger(paid) || !Number.isSafeInteger(total) || paid < 0 || total < 0) {
      return { status: 422, error: "راجع مبالغ الحجز قبل تسجيل دفعة" };
    }
    if (paid !== halalas(parsed.data.expectedDeposit)
      || (row.paymentMethod || "cash") !== parsed.data.expectedPaymentMethod
      || !!row.cashDeposited !== parsed.data.expectedCashDeposited) {
      return { status: 409, error: "تغيّرت بيانات الدفع. حدّث الحجز وأعد فتح إضافة الدفعة." };
    }
    if (added > total - paid) return { status: 422, error: "مبلغ الدفعة يتجاوز المتبقي على الحجز" };
    const [updated] = await updateRecords(tx, serviceAppointmentsTable, { deposit: ((paid + added) / 100).toFixed(2) }, eq(serviceAppointmentsTable.id, row.id));
    return { status: 200, updated };
  });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  return res.json(result.updated);
});

router.patch("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id || row.providerId !== providerId) return res.status(404).json({ error: "الحجز غير موجود" });
  const [provider] = await db
    .select({
      requiresInsurance: serviceProvidersTable.requiresInsurance,
      requiresContract: serviceProvidersTable.requiresContract,
      contractText: serviceProvidersTable.contractText,
      includeElectronicSignature: serviceProvidersTable.includeElectronicSignature,
      dailyCapacity: serviceProvidersTable.dailyCapacity,
    })
    .from(serviceProvidersTable)
    .where(and(
      eq(serviceProvidersTable.id, providerId),
      eq(serviceProvidersTable.ownerId, req.user.id),
    ))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    clientName: z.string().min(1).optional(),
    clientPhone: z.string().trim().min(1, "رقم الجوال مطلوب").optional(),
    serviceAddress: z.string().optional().nullable(),
    serviceDeliveryMethod: z.enum(["delivery_installation", "customer_pickup"]).optional(),
    clientIdNumber: z.string().optional().nullable(),
    dateStr: canonicalGregorianDate.optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    duration: z.string().optional().nullable(),
    durationUnit: z.enum(["hours", "days"]).optional(),
    status: z.enum(["confirmed", "pending", "cancelled"]).optional(),
    notes: z.string().trim().min(1, "تفاصيل الخدمة مطلوبة").optional(),
    amount: z.string().optional().nullable(),
    deposit: z.string().optional().nullable(),
    insuranceAmount: serviceAppointmentInsuranceAmount,
    source: z.enum(["platform", "whatsapp", "phone", "walk_in", "external"]).optional(),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).optional(),
    paymentReceiptUrl: z.string().optional().nullable(),
    cashDeposited: z.boolean().optional(),
    contractSigned: z.boolean().optional(),
    cancelReason: z.string().optional().nullable(),
    cancelRefundAmount: z.string().optional().nullable(),
    editReason: z.string().optional().nullable(),
    insuranceStatus: z.enum(["held", "refunded", "deducted"]).optional(),
    insuranceDeductAmount: z.string().optional().nullable(),
    insuranceDeductNote: z.string().optional().nullable(),
    insuranceProofImages: z.array(z.string().regex(
      /^\/api\/storage\/objects\/uploads\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg|gif|avif)$/,
      "مسار صورة التوثيق غير صحيح",
    )).max(10).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const targetDate = parsed.data.dateStr ?? row.dateStr;
  const targetStatus = parsed.data.status ?? row.status;
  const updates: Record<string, any> = { ...parsed.data };
  if (parsed.data.startTime !== undefined && parsed.data.startTime !== row.startTime) {
    updates.previousStartTime = row.startTime;
    updates.lastEditedAt = new Date();
  }
  if (parsed.data.editReason?.trim()) {
    updates.lastEditedAt = new Date();
    updates.previousStartTime = row.startTime;
    const dateChanged = targetDate !== row.dateStr;
    updates.previousDateStr = row.dateStr;
    updates.editedDateStr = targetDate;

    const targetAmount = parsed.data.amount ?? row.amount;
    const amountChanged = Number(targetAmount ?? 0) !== Number(row.amount ?? 0);
    updates.previousAmount = row.amount;

    const targetDuration = parsed.data.duration ?? row.duration;
    const targetDurationUnit = parsed.data.durationUnit ?? row.durationUnit;
    const durationChanged =
      String(targetDuration ?? "") !== String(row.duration ?? "") ||
      targetDurationUnit !== row.durationUnit;
    updates.previousDuration = row.duration;
    updates.previousDurationUnit = row.durationUnit;
  }
  if (!provider.requiresInsurance) updates.clientIdNumber = null;
  if (parsed.data.status === "cancelled" && !row.cancelledAt) {
    updates.cancelledAt = new Date();
  }
  if (parsed.data.status && parsed.data.status !== "cancelled") updates.cancelledAt = null;

  const consumesNewCapacity = targetStatus !== "cancelled" && (targetDate !== row.dateStr || row.status === "cancelled");
  const result = await db.transaction(async (tx) => {
    if (consumesNewCapacity) {
      await lockResource(tx, providerId, targetDate);
      const [blockedDate] = await tx
        .select({ id: serviceBlockedDatesTable.id })
        .from(serviceBlockedDatesTable)
        .where(and(
          eq(serviceBlockedDatesTable.providerId, providerId),
          eq(serviceBlockedDatesTable.dateStr, targetDate),
        ))
        .limit(1);
      if (blockedDate) return { blocked: true as const };

      const [capacityRow] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(serviceAppointmentsTable)
        .where(and(
          eq(serviceAppointmentsTable.providerId, providerId),
          eq(serviceAppointmentsTable.dateStr, targetDate),
          ne(serviceAppointmentsTable.status, "cancelled"),
          ne(serviceAppointmentsTable.id, apptId),
        ));
      const dailyCapacity = Math.max(1, provider.dailyCapacity ?? 1);
      if ((capacityRow?.count ?? 0) >= dailyCapacity) return { blocked: false as const, full: true as const, dailyCapacity };
    }

    const [updated] = await updateRecords(tx, serviceAppointmentsTable, updates, and(
        eq(serviceAppointmentsTable.id, apptId),
        eq(serviceAppointmentsTable.providerId, providerId),
        eq(serviceAppointmentsTable.ownerId, req.user.id),
      ));
    return { blocked: false as const, full: false as const, missingProvider: false as const, updated };
  });

  if ("missingProvider" in result && result.missingProvider) return res.status(404).json({ error: "المزود غير موجود" });
  if ("blocked" in result && result.blocked) {
    return res.status(409).json({
      error: "هذا اليوم مغلق وغير متاح للحجز",
      code: "SERVICE_DATE_BLOCKED",
    });
  }
  if ("full" in result && result.full) {
    return res.status(409).json({
      error: "اكتملت الطاقة الاستيعابية لهذا اليوم",
      code: "DAILY_CAPACITY_REACHED",
      dailyCapacity: result.dailyCapacity,
    });
  }
  const updated = result.updated;
  return res.json(updated);
});

router.delete("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id || row.providerId !== providerId) return res.status(404).json({ error: "الحجز غير موجود" });
  await db.delete(serviceAppointmentsTable).where(and(
    eq(serviceAppointmentsTable.id, apptId),
    eq(serviceAppointmentsTable.providerId, providerId),
    eq(serviceAppointmentsTable.ownerId, req.user.id),
  ));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — INSURANCES (owner-wide)
   ════════════════════════════════════════════════════════ */

router.get("/my/insurances", requireAuth, async (req: any, res) => {
  const rows = await db.select().from(serviceInsurancesTable)
    .where(eq(serviceInsurancesTable.ownerId, req.user.id))
    .orderBy(desc(serviceInsurancesTable.createdAt));
  return res.json(rows);
});

router.post("/my/insurances", requireAuth, async (req: any, res) => {
  const schema = z.object({
    policyName: z.string().min(1),
    insurerName: z.string().optional().nullable(),
    amount: z.string().default("0"),
    renewalDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    providerId: z.number().int().optional().nullable(),
    refundAmount: z.string().optional().nullable(),
    refundNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const [row] = await insertRecords(db, serviceInsurancesTable, {
    ownerId: req.user.id, ...parsed.data,
  });
  return res.status(201).json(row);
});

router.patch("/my/insurances/:insId", requireAuth, async (req: any, res) => {
  const insId = Number(req.params.insId);
  const [row] = await db.select().from(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "السياسة غير موجودة" });

  const schema = z.object({
    policyName: z.string().min(1).optional(),
    insurerName: z.string().optional().nullable(),
    amount: z.string().optional(),
    renewalDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    providerId: z.number().int().optional().nullable(),
    refundAmount: z.string().optional().nullable(),
    refundNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const [updated] = await updateRecords(db, serviceInsurancesTable, parsed.data, eq(serviceInsurancesTable.id, insId));
  return res.json(updated);
});

router.delete("/my/insurances/:insId", requireAuth, async (req: any, res) => {
  const insId = Number(req.params.insId);
  const [row] = await db.select().from(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "السياسة غير موجودة" });
  await db.delete(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId));
  return res.json({ ok: true });
});

export default router;
