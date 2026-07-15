-- Hub Integrator v0.4.0 schema verification (phd-only)
-- This script is pure SQL and must fail fast if any required invariant is missing.

DO $$
DECLARE
  extra_tables text[];
BEGIN
  SELECT array_agg(t.table_name ORDER BY t.table_name)
  INTO extra_tables
  FROM information_schema.tables t
  WHERE t.table_schema = 'phd'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT IN (
      'system_entity',
      'subsystem',
      'system_subsystem',
      'tag',
      'system_group',
      'system_group_member'
    );

  IF extra_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected tables in phd schema: %', extra_tables;
  END IF;

  IF (
    SELECT count(*)
    FROM information_schema.tables t
    WHERE t.table_schema = 'phd'
      AND t.table_type = 'BASE TABLE'
      AND t.table_name IN (
        'system_entity',
        'subsystem',
        'system_subsystem',
        'tag',
        'system_group',
        'system_group_member'
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'phd schema must contain exactly the 6 business tables';
  END IF;
END $$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'phd'
      AND t.typtype = 'e'
      AND t.typname IN (
        'system_type',
        'tag_measurement_type',
        'tag_role',
        'tag_qualifier',
        'phd_data_type'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'phd schema must contain exactly 5 enums';
  END IF;
END $$;

-- Primary keys expected in the six business tables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('system_entity'),
        ('subsystem'),
        ('system_subsystem'),
        ('tag'),
        ('system_group'),
        ('system_group_member')
    ) AS required(table_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'phd'
        AND tc.table_name = required.table_name
        AND tc.constraint_type = 'PRIMARY KEY'
    )
  ) THEN
    RAISE EXCEPTION 'Missing PRIMARY KEY in one or more phd business tables';
  END IF;
END $$;

-- FK and ON DELETE behavior
DO $$
BEGIN
  -- system_subsystem.system_id -> system_entity.id ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    WHERE con.contype = 'f'
      AND src_ns.nspname = 'phd'
      AND src.relname = 'system_subsystem'
      AND tgt_ns.nspname = 'phd'
      AND tgt.relname = 'system_entity'
      AND con.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Missing CASCADE FK system_subsystem -> system_entity';
  END IF;

  -- system_subsystem.subsystem_id -> subsystem.id ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    WHERE con.contype = 'f'
      AND src_ns.nspname = 'phd'
      AND src.relname = 'system_subsystem'
      AND tgt_ns.nspname = 'phd'
      AND tgt.relname = 'subsystem'
      AND con.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Missing CASCADE FK system_subsystem -> subsystem';
  END IF;

  -- tag.system_subsystem_id -> system_subsystem.id ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    WHERE con.contype = 'f'
      AND src_ns.nspname = 'phd'
      AND src.relname = 'tag'
      AND tgt_ns.nspname = 'phd'
      AND tgt.relname = 'system_subsystem'
      AND con.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Missing CASCADE FK tag -> system_subsystem';
  END IF;

  -- system_group_member.system_group_id -> system_group.id ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    WHERE con.contype = 'f'
      AND src_ns.nspname = 'phd'
      AND src.relname = 'system_group_member'
      AND tgt_ns.nspname = 'phd'
      AND tgt.relname = 'system_group'
      AND con.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Missing CASCADE FK system_group_member -> system_group';
  END IF;

  -- system_group_member.system_id -> system_entity.id ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
    WHERE con.contype = 'f'
      AND src_ns.nspname = 'phd'
      AND src.relname = 'system_group_member'
      AND tgt_ns.nspname = 'phd'
      AND tgt.relname = 'system_entity'
      AND con.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Missing CASCADE FK system_group_member -> system_entity';
  END IF;
END $$;

-- Unique and index invariants
DO $$
BEGIN
  IF to_regclass('phd.uq_phd_system_entity_name') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_entity_name';
  END IF;

  IF to_regclass('phd.uq_phd_system_entity_code') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_entity_code';
  END IF;

  IF to_regclass('phd.uq_phd_subsystem_name') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_subsystem_name';
  END IF;

  IF to_regclass('phd.uq_phd_subsystem_code') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_subsystem_code';
  END IF;

  IF to_regclass('phd.uq_phd_subsystem_nomenclature') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_subsystem_nomenclature';
  END IF;

  IF to_regclass('phd.uq_phd_system_subsystem_pair') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_subsystem_pair';
  END IF;

  IF to_regclass('phd.idx_phd_system_subsystem_subsystem_id') IS NULL THEN
    RAISE EXCEPTION 'Missing index idx_phd_system_subsystem_subsystem_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = k.attnum
    WHERE ns.nspname = 'phd'
      AND tbl.relname = 'system_subsystem'
      AND i.indnatts = 1
      AND a.attname = 'system_id'
      AND i.indisprimary = false
  ) THEN
    RAISE EXCEPTION 'Unexpected standalone index on phd.system_subsystem(system_id)';
  END IF;

  IF to_regclass('phd.uq_phd_tag_tagname') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_tag_tagname';
  END IF;

  IF to_regclass('phd.idx_phd_tag_syssub_measurement_role_qualifier') IS NULL THEN
    RAISE EXCEPTION 'Missing index idx_phd_tag_syssub_measurement_role_qualifier';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'phd'
      AND tc.table_name = 'tag'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'phd_tag_no'
  ) THEN
    RAISE EXCEPTION 'phd.tag.phd_tag_no must not be unique';
  END IF;

  IF to_regclass('phd.uq_phd_system_group_name') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_group_name';
  END IF;

  IF to_regclass('phd.uq_phd_system_group_member_pair') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_group_member_pair';
  END IF;

  IF to_regclass('phd.uq_phd_system_group_member_display_order') IS NULL THEN
    RAISE EXCEPTION 'Missing unique index uq_phd_system_group_member_display_order';
  END IF;

  IF to_regclass('phd.idx_phd_system_group_member_system_id') IS NULL THEN
    RAISE EXCEPTION 'Missing index idx_phd_system_group_member_system_id';
  END IF;
END $$;

-- public schema business tables must be absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname IN (
        'system_entity',
        'sub_system',
        'system_sub_system',
        'subsystem',
        'system_subsystem',
        'tag',
        'tag_value',
        'tag_etl_state',
        'etl_scheduler_state',
        'tag_value_default',
        'system_group',
        'system_group_member'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy business tables found in public schema';
  END IF;
END $$;

-- Legacy ETL/runtime objects must be absent globally
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'S')
      AND (
        c.relname = 'tag_value_default'
        OR c.relname = 'tag_value'
        OR c.relname = 'tag_etl_state'
        OR c.relname = 'etl_scheduler_state'
        OR c.relname ~ '^tag_value_[0-9]{4}_[0-9]{2}$'
        OR c.relname ~ '^tag_value_.*_seq$'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy ETL tables/sequences/partitions still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.proname IN ('fn_create_tag_etl_state', 'fn_check_tag_value_column')
  ) THEN
    RAISE EXCEPTION 'Legacy ETL functions still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgname IN ('trg_tag_etl_state_on_insert', 'trg_check_tag_value_column')
  ) THEN
    RAISE EXCEPTION 'Legacy ETL triggers still exist';
  END IF;
END $$;

-- Summary output
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'phd'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT t.typname AS enum_name, e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'phd'
ORDER BY t.typname, e.enumsortorder;
