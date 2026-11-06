import type { PoolConnection } from "mysql2/promise";

/** Fixture writes stay inside a rollback-only local test transaction. */
export async function verifyConstraints(connection: PoolConnection): Promise<void> {
  const expectError = async (statement: string, params: Array<string | number | boolean | null>, expected: number) => {
    try {
      await connection.execute(statement, params);
    } catch (error) {
      if (typeof error === "object" && error !== null && "errno" in error && error.errno === expected) return;
      throw new Error("A constraint test failed with an unexpected error.");
    }
    throw new Error("A database constraint was not enforced.");
  };
  await connection.beginTransaction();
  try {
    await expectError(
      "INSERT INTO owner_wallet_entries (owner_id,source_key,kind,amount_halalas,description) VALUES (?,?,?,?,?)",
      ["migration-test-only", "migration-zero-wallet-test", "test", 0, "اختبار قيد"], 4025,
    );
    await expectError(
      "INSERT INTO admin_sessions (sid,admin_staff_id,expire) VALUES (?,?,?)",
      ["migration-test-orphan-session", 2147483647, "2030-01-01 00:00:00"], 1452,
    );
    await expectError(
      "INSERT INTO chalets (name_ar,description_ar,location,price_per_night,whatsapp_number,amenities) VALUES (?,?,?,?,?,?)",
      ["اختبار فقط", "اختبار فقط", "اختبار", "100.00", "0500000000", "{}"], 4025,
    );
    for (const [key, kind] of [
      ["migration-test-link-1", "link"],
      ["migration-test-link-2", "link"],
      ["migration-test-photography-1", "photography"],
    ]) {
      await connection.execute(
        "INSERT INTO owner_services (`key`,title,kind) VALUES (?,?,?)", [key, "اختبار فقط", kind],
      );
    }
    await expectError(
      "INSERT INTO owner_services (`key`,title,kind) VALUES (?,?,?)",
      ["migration-test-photography-2", "اختبار فقط", "photography"], 1062,
    );
  } finally {
    await connection.rollback();
  }
}
