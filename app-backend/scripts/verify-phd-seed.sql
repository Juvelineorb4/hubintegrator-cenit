\echo '=== systems and subsystems ==='
SELECT id, name, code, type
FROM phd.system_entity
ORDER BY code;

SELECT id, name, code, nomenclature
FROM phd.subsystem
ORDER BY code;

\echo '=== system_subsystem ordered by display_order ==='
SELECT
  se.code AS system_code,
  ss.code AS subsystem_code,
  rel.display_order
FROM phd.system_subsystem rel
JOIN phd.system_entity se ON se.id = rel.system_id
JOIN phd.subsystem ss ON ss.id = rel.subsystem_id
ORDER BY se.code, rel.display_order;

\echo '=== tags and category parts ==='
SELECT
  t.tagname,
  t.measurement_type,
  t.role,
  t.qualifier,
  t.phd_tag_no,
  se.code AS system_code,
  ss.code AS subsystem_code
FROM phd.tag t
JOIN phd.system_subsystem rel ON rel.id = t.system_subsystem_id
JOIN phd.system_entity se ON se.id = rel.system_id
JOIN phd.subsystem ss ON ss.id = rel.subsystem_id
ORDER BY t.tagname;

\echo '=== group members ordered by display_order ==='
SELECT
  g.name AS group_name,
  m.display_order,
  se.code AS system_code,
  se.name AS system_name
FROM phd.system_group_member m
JOIN phd.system_group g ON g.id = m.system_group_id
JOIN phd.system_entity se ON se.id = m.system_id
ORDER BY g.name, m.display_order;

\echo '=== counts by table ==='
SELECT 'phd.system_entity' AS table_name, COUNT(*)::int AS row_count FROM phd.system_entity
UNION ALL
SELECT 'phd.subsystem', COUNT(*)::int FROM phd.subsystem
UNION ALL
SELECT 'phd.system_subsystem', COUNT(*)::int FROM phd.system_subsystem
UNION ALL
SELECT 'phd.tag', COUNT(*)::int FROM phd.tag
UNION ALL
SELECT 'phd.system_group', COUNT(*)::int FROM phd.system_group
UNION ALL
SELECT 'phd.system_group_member', COUNT(*)::int FROM phd.system_group_member
ORDER BY table_name;

\echo '=== duplicate checks for UNIQUE keys ==='
SELECT 'system_entity.name' AS key_name, name AS key_value, COUNT(*)::int AS duplicates
FROM phd.system_entity
GROUP BY name
HAVING COUNT(*) > 1
UNION ALL
SELECT 'system_entity.code', code, COUNT(*)::int
FROM phd.system_entity
GROUP BY code
HAVING COUNT(*) > 1
UNION ALL
SELECT 'subsystem.name', name, COUNT(*)::int
FROM phd.subsystem
GROUP BY name
HAVING COUNT(*) > 1
UNION ALL
SELECT 'subsystem.code', code, COUNT(*)::int
FROM phd.subsystem
GROUP BY code
HAVING COUNT(*) > 1
UNION ALL
SELECT 'subsystem.nomenclature', nomenclature, COUNT(*)::int
FROM phd.subsystem
GROUP BY nomenclature
HAVING COUNT(*) > 1
UNION ALL
SELECT 'tag.tagname', tagname, COUNT(*)::int
FROM phd.tag
GROUP BY tagname
HAVING COUNT(*) > 1
UNION ALL
SELECT 'system_subsystem(system_id,subsystem_id)', (system_id::text || '|' || subsystem_id::text), COUNT(*)::int
FROM phd.system_subsystem
GROUP BY system_id, subsystem_id
HAVING COUNT(*) > 1
UNION ALL
SELECT 'system_group_member(system_group_id,system_id)', (system_group_id::text || '|' || system_id::text), COUNT(*)::int
FROM phd.system_group_member
GROUP BY system_group_id, system_id
HAVING COUNT(*) > 1
UNION ALL
SELECT 'system_group_member(system_group_id,display_order)', (system_group_id::text || '|' || display_order::text), COUNT(*)::int
FROM phd.system_group_member
GROUP BY system_group_id, display_order
HAVING COUNT(*) > 1;

\echo '=== orphan tag detection ==='
SELECT t.id, t.tagname
FROM phd.tag t
LEFT JOIN phd.system_subsystem rel ON rel.id = t.system_subsystem_id
WHERE rel.id IS NULL;

\echo '=== orphan system_group_member detection ==='
SELECT m.id, m.system_group_id, m.system_id
FROM phd.system_group_member m
LEFT JOIN phd.system_group g ON g.id = m.system_group_id
LEFT JOIN phd.system_entity se ON se.id = m.system_id
WHERE g.id IS NULL OR se.id IS NULL;
