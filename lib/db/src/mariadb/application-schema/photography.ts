// Generated native application contracts. No PostgreSQL constructors.

import { sql } from "drizzle-orm";

import { createInsertSchema } from "drizzle-zod";

export type PhotographyAvailability = { weekday: number; start: string; end: string }[];

import { photographyReceiptUploadsTable } from "./tables/photography_receipt_uploads";
export { photographyReceiptUploadsTable };

export type ReceiptCleanupEntry = { uploadId: string; paths: string[]; reason: string; candidate: boolean };

import { photographyReceiptCleanupRunsTable } from "./tables/photography_receipt_cleanup_runs";
export { photographyReceiptCleanupRunsTable };

import { photographyReceiptsTable } from "./tables/photography_receipts";
export { photographyReceiptsTable };

import { photographyContractsTable } from "./tables/photography_contracts";
export { photographyContractsTable };

import { photographersTable } from "./tables/photographers";
export { photographersTable };

import { photographyTransfersTable } from "./tables/photography_transfers";
export { photographyTransfersTable };

import { photographyPackagesTable } from "./tables/photography_packages";
export { photographyPackagesTable };

import { photographerSessionsTable } from "./tables/photographer_sessions";
export { photographerSessionsTable };

import { photographyBookingsTable } from "./tables/photography_bookings";
export { photographyBookingsTable };

import { photographyDeliveriesTable } from "./tables/photography_deliveries";
export { photographyDeliveriesTable };

export const insertPhotographerSchema = createInsertSchema(photographersTable);

import { photographyReviewsTable } from "./tables/photography_reviews";
export { photographyReviewsTable };

import { photographyCancellationsTable } from "./tables/photography_cancellations";
export { photographyCancellationsTable };

import { photographyAlertsTable } from "./tables/photography_alerts";
export { photographyAlertsTable };

import { photographyRefundsTable } from "./tables/photography_refunds";
export { photographyRefundsTable };

import { ownerWalletEntriesTable } from "./tables/owner_wallet_entries";
export { ownerWalletEntriesTable };

export const insertPhotographyPackageSchema = createInsertSchema(photographyPackagesTable);

export type Photographer = typeof photographersTable.$inferSelect;

export type PhotographyBooking = typeof photographyBookingsTable.$inferSelect;
