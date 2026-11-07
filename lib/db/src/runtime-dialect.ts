/**
 * Capability of the CURRENT application entry point, not a configuration flag.
 * Change only when src/index.ts and ALL its query consumers use the native
 * MariaDB runtime. An environment variable must never bypass this declaration.
 */
export const applicationDatabaseDialect: string = "postgresql";
