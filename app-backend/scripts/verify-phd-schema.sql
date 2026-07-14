\echo '=== Schemas ==='
SELECT nspname AS schema_name
FROM pg_namespace
ORDER BY nspname;

\echo '=== Tables in phd ==='
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'phd' AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo '=== Enums in phd ==='
SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumlabel AS enum_value, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'phd'
ORDER BY t.typname, e.enumsortorder;

\echo '=== Columns and types (phd) ==='
SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_schema, c.udt_name, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'phd'
ORDER BY c.table_name, c.ordinal_position;

\echo '=== Primary keys (phd) ==='
SELECT tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'phd'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name, kcu.ordinal_position;

\echo '=== Foreign keys and ON DELETE actions (phd) ==='
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
 AND tc.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
 AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.table_schema = 'phd'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

\echo '=== Unique constraints (phd) ==='
SELECT tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'phd'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

\echo '=== Indexes (phd, implicit and explicit) ==='
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef,
  CASE
    WHEN indexdef LIKE '% PRIMARY KEY %' THEN 'PRIMARY KEY'
    WHEN indexdef LIKE '% UNIQUE INDEX %' THEN 'UNIQUE'
    ELSE 'EXPLICIT'
  END AS index_kind
FROM pg_indexes
WHERE schemaname = 'phd'
ORDER BY tablename, indexname;

\echo '=== Relationships map (phd foreign keys) ==='
SELECT
  con.conname AS fk_name,
  src_ns.nspname || '.' || src.relname AS source_table,
  src_att.attname AS source_column,
  tgt_ns.nspname || '.' || tgt.relname AS target_table,
  tgt_att.attname AS target_column,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS src_cols(attnum, ord) ON true
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS tgt_cols(attnum, ord) ON tgt_cols.ord = src_cols.ord
JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = src_cols.attnum
JOIN pg_attribute tgt_att ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = tgt_cols.attnum
WHERE con.contype = 'f'
  AND src_ns.nspname = 'phd'
ORDER BY source_table, fk_name, src_cols.ord;

\echo '=== Unexpected legacy objects in test DB ==='
SELECT 'public.tag_value' AS object_name, EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'tag_value' AND c.relkind = 'r'
) AS exists
UNION ALL
SELECT 'public.tag_etl_state', EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'tag_etl_state' AND c.relkind = 'r'
)
UNION ALL
SELECT 'public.etl_scheduler_state', EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'etl_scheduler_state' AND c.relkind = 'r'
)
UNION ALL
SELECT 'public.tag_value_* partitions', EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname ~ '^tag_value_.*$' AND c.relkind = 'r'
)
UNION ALL
SELECT 'etl functions/triggers', EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname IN ('fn_create_tag_etl_state', 'fn_check_tag_value_column')
     OR EXISTS (
       SELECT 1 FROM pg_trigger t WHERE t.tgname IN ('trg_tag_etl_state_on_insert', 'trg_check_tag_value_column')
     )
);
