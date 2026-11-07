import path from "node:path";

export function hostingerConfig(
  env: NodeJS.ProcessEnv,
  applicationDialect: string,
): { port: number; frontendDirectory: string } {
  if (applicationDialect !== "mariadb") {
    throw new Error("Hostinger startup blocked: application queries have not been fully ported to MariaDB.");
  }
  if (env.NODE_ENV !== "production") throw new Error("Hostinger requires NODE_ENV=production.");
  if (!env.PORT || !/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535) {
    throw new Error("Hostinger must supply a valid PORT.");
  }
  if (!env.MARIADB_DATABASE_URL) throw new Error("MARIADB_DATABASE_URL is required.");
  let databaseUrl: URL;
  try { databaseUrl = new URL(env.MARIADB_DATABASE_URL); }
  catch { throw new Error("Invalid MariaDB connection configuration."); }
  if (databaseUrl.protocol !== "mysql:" || databaseUrl.pathname.length <= 1) {
    throw new Error("MariaDB requires a mysql:// connection and database name.");
  }
  if (env.DATABASE_URL) {
    throw new Error("Remove the legacy DATABASE_URL from the Hostinger environment.");
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error("Configure a secure SESSION_SECRET of at least 32 characters.");
  }
  if (env.DISABLE_STARTUP_SEEDING !== "true") {
    throw new Error("Hostinger requires explicit schema/seed import; disable startup seeding.");
  }
  if (!env.FRONTEND_DIST_DIR) throw new Error("FRONTEND_DIST_DIR must point to the built public directory.");
  if(!env.APP_STORAGE_DIR||!path.isAbsolute(env.APP_STORAGE_DIR))throw new Error("APP_STORAGE_DIR must be an absolute private directory.");
  let publicUrl:URL;
  try{publicUrl=new URL(env.PUBLIC_SITE_URL??"");}catch{throw new Error("PUBLIC_SITE_URL is required.");}
  if(publicUrl.protocol!=="https:"||publicUrl.username||publicUrl.password||publicUrl.pathname!=="/"||publicUrl.search||publicUrl.hash)
    throw new Error("PUBLIC_SITE_URL must be an HTTPS origin.");
  return { port: Number(env.PORT), frontendDirectory: path.resolve(env.FRONTEND_DIST_DIR) };
}
