import { db } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { sql } from "drizzle-orm";

type OwnerIdentity = {
  userId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type OwnerProfileHints = {
  fullName?: string | null;
  businessName?: string | null;
  phone?: string | null;
  businessType?: "chalet" | "service" | "both";
};

export async function ensureOwnerProfile(
  identity: OwnerIdentity,
  hints: OwnerProfileHints = {},
): Promise<string | null> {
  const linkedResult = await db.execute(sql`
    SELECT oa.email
    FROM owner_account_links link
    JOIN owner_applications oa ON oa.id = link.owner_application_id
    WHERE link.user_id = ${identity.userId}
    LIMIT 1
  `);
  const linkedEmail = ((linkedResult as any).rows as Array<{ email: string }>)[0]?.email;
  if (linkedEmail) return linkedEmail;

  let email = identity.email?.trim().toLowerCase() || null;

  if (!email) {
    const userResult = await db.execute(
      sql`SELECT email FROM users WHERE id = ${identity.userId} LIMIT 1`
    );
    email = ((userResult as any).rows as Array<{ email: string | null }>)[0]?.email?.trim().toLowerCase() || null;
  }
  if (!email) return null;

  const sourceResult = await db.execute(sql`
    SELECT
      (SELECT business_name FROM service_provider_submissions
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS submission_business_name,
      (SELECT whatsapp_number FROM service_provider_submissions
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS submission_phone,
      (SELECT business_name FROM service_providers
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS provider_business_name,
      (SELECT whatsapp_number FROM service_providers
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS provider_phone,
      (SELECT name_ar FROM chalet_submissions
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS chalet_name,
      (SELECT whatsapp_number FROM chalet_submissions
       WHERE owner_id = ${identity.userId} ORDER BY created_at DESC LIMIT 1) AS chalet_phone,
      EXISTS(SELECT 1 FROM service_provider_submissions WHERE owner_id = ${identity.userId})
        OR EXISTS(SELECT 1 FROM service_providers WHERE owner_id = ${identity.userId}) AS has_service,
      EXISTS(SELECT 1 FROM chalet_submissions WHERE owner_id = ${identity.userId}) AS has_chalet
  `);
  const source = ((sourceResult as any).rows as Array<Record<string, any>>)[0] ?? {};

  const sessionName = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
  const businessName =
    hints.businessName?.trim()
    || source.submission_business_name
    || source.provider_business_name
    || source.chalet_name
    || hints.fullName?.trim()
    || sessionName
    || email.split("@")[0];
  const fullName = hints.fullName?.trim() || sessionName || businessName;
  const phone =
    hints.phone?.trim()
    || source.submission_phone
    || source.provider_phone
    || source.chalet_phone
    || "";
  const hasService = hints.businessType === "service" || hints.businessType === "both" || Boolean(source.has_service);
  const hasChalet = hints.businessType === "chalet" || hints.businessType === "both" || Boolean(source.has_chalet);
  const hasProfileHints = Boolean(hints.businessName || hints.fullName || hints.phone || hints.businessType);

  const existingResult = await db.execute(
    sql`SELECT id FROM owner_applications WHERE LOWER(email) = LOWER(${email}) ORDER BY id LIMIT 1`
  );
  const existingApplicationId = ((existingResult as any).rows as Array<{ id: number }>)[0]?.id;
  if (!existingApplicationId && !hasService && !hasChalet && !hasProfileHints) return null;

  const businessType = hasService && hasChalet ? "both" : hasService ? "service" : "chalet";

  return db.transaction(async (tx) => {
    await lockResource(tx, "identity", email.toLowerCase());

    const concurrentLinkResult = await tx.execute(sql`
      SELECT oa.email
      FROM owner_account_links link
      JOIN owner_applications oa ON oa.id = link.owner_application_id
      WHERE link.user_id = ${identity.userId}
      LIMIT 1
    `);
    const concurrentLinkedEmail = ((concurrentLinkResult as any).rows as Array<{ email: string }>)[0]?.email;
    if (concurrentLinkedEmail) return concurrentLinkedEmail;

    const applicationResult = await tx.execute(
      sql`SELECT id FROM owner_applications WHERE LOWER(email) = LOWER(${email}) ORDER BY id LIMIT 1`
    );
    let applicationId = ((applicationResult as any).rows as Array<{ id: number }>)[0]?.id;

    if (!applicationId) {
      const createdResult = await tx.execute(sql`
        INSERT INTO owner_applications
          (full_name, business_name, business_type, phone, email, password_hash, status, email_verified)
        VALUES
          (${fullName}, ${businessName}, ${businessType}, ${phone}, ${email}, '', 'approved', true)
        RETURNING id
      `);
      applicationId = ((createdResult as any).rows as Array<{ id: number }>)[0]?.id;
    }
    if (!applicationId) return null;

    await tx.execute(sql`
      INSERT INTO owner_account_links (user_id, owner_application_id)
      VALUES (${identity.userId}, ${applicationId})
      ON CONFLICT DO NOTHING
    `);

    const finalMappingResult = await tx.execute(sql`
      SELECT oa.email
      FROM owner_account_links link
      JOIN owner_applications oa ON oa.id = link.owner_application_id
      WHERE link.user_id = ${identity.userId}
        AND link.owner_application_id = ${applicationId}
      LIMIT 1
    `);
    return ((finalMappingResult as any).rows as Array<{ email: string }>)[0]?.email ?? null;
  });
}