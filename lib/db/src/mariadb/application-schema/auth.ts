// Generated native application contracts. No PostgreSQL constructors.

import { sql } from "drizzle-orm";

import { sessionsTable } from "./tables/sessions";
export { sessionsTable };

import { usersTable } from "./tables/users";
export { usersTable };

export type UpsertUser = typeof usersTable.$inferInsert;

export type User = typeof usersTable.$inferSelect;
