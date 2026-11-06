import type { PoolClient } from "pg";
import type { Catalog, Column, Constraint, Index } from "./schema-converter";

export async function readCatalog(client: PoolClient): Promise<Catalog> {
  const columns = await client.query<Column>(`
    SELECT c.table_name,c.column_name,c.data_type,c.udt_name,c.is_nullable,
      c.column_default,c.character_maximum_length,c.numeric_precision,c.numeric_scale,
      (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
       FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=c.udt_name) AS enum_values
    FROM information_schema.columns c JOIN information_schema.tables t
      ON c.table_schema=t.table_schema AND c.table_name=t.table_name
    WHERE c.table_schema='public' AND t.table_type='BASE TABLE'
    ORDER BY c.table_name,c.ordinal_position`);
  const constraints = await client.query<Constraint>(`
    SELECT t.relname AS table_name,c.conname AS constraint_name,c.contype AS kind,
      pg_get_constraintdef(c.oid) AS definition,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,pos)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.pos) AS columns,
      ft.relname AS foreign_table,
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,pos)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.pos) AS foreign_columns,
      c.confdeltype AS delete_action,c.confupdtype AS update_action
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class ft ON ft.oid=c.confrelid
    WHERE n.nspname='public' AND c.contype IN ('p','u','c','f') ORDER BY t.relname,c.conname`);
  const indexes = await client.query<Index>(`
    SELECT t.relname AS table_name,i.relname AS index_name,am.amname AS method,
      ix.indisunique AS is_unique,ix.indisprimary AS is_primary,
      pg_get_expr(ix.indpred,ix.indrelid) AS predicate,
      ARRAY(SELECT pg_get_indexdef(ix.indexrelid,k,true) ||
        CASE WHEN (ix.indoption[k-1] & 1) = 1 THEN ' DESC' ELSE '' END
        FROM generate_series(1,ix.indnkeyatts) AS k) AS expressions
    FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid
      JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_am am ON am.oid=i.relam
    WHERE n.nspname='public' ORDER BY t.relname,i.relname`);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}
