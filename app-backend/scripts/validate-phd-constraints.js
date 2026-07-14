const { Client } = require('pg');

async function runExpectedFailure(client, label, queryText, params) {
    await client.query('BEGIN');
    try {
        await client.query(queryText, params);
        await client.query('ROLLBACK');
        console.log(`${label}: UNEXPECTED_SUCCESS`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.log(`${label}: EXPECTED_FAILURE code=${error.code}`);
    }
}

async function runExpectedSuccess(client, label, queryText, params) {
    await client.query('BEGIN');
    try {
        await client.query(queryText, params);
        await client.query('ROLLBACK');
        console.log(`${label}: EXPECTED_SUCCESS`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.log(`${label}: UNEXPECTED_FAILURE code=${error.code}`);
        throw error;
    }
}

(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is required');
    }

    const client = new Client({ connectionString });
    await client.connect();

    const system = await client.query("SELECT id, code FROM phd.system_entity WHERE code = '11' LIMIT 1");
    const subsystem = await client.query("SELECT id, code FROM phd.subsystem WHERE code = 'AYA' LIMIT 1");
    const rel = await client.query(
        `SELECT id, system_id, subsystem_id FROM phd.system_subsystem
     WHERE system_id = $1 AND subsystem_id = $2 LIMIT 1`,
        [system.rows[0].id, subsystem.rows[0].id]
    );
    const group = await client.query("SELECT id FROM phd.system_group WHERE name = 'Oleoductos principales' LIMIT 1");

    await runExpectedFailure(
        client,
        'duplicate system_entity.name',
        `INSERT INTO phd.system_entity (name, code, description, distance, type)
     VALUES ($1, $2, 'dup test', 1, 'OIL_PIPELINE')`,
        ['Pozos - Galan L.14', '11-DUP-NAME']
    );

    await runExpectedFailure(
        client,
        'duplicate system_entity.code',
        `INSERT INTO phd.system_entity (name, code, description, distance, type)
     VALUES ($1, $2, 'dup test', 1, 'OIL_PIPELINE')`,
        ['System code dup test', '11']
    );

    await runExpectedFailure(
        client,
        'duplicate subsystem.name',
        `INSERT INTO phd.subsystem (name, code, nomenclature, description, latitude, longitude)
     VALUES ($1, $2, $3, 'dup test', 0, 0)`,
        ['Ayacucho', 'AYA-DUP-NAME', 'AYA-DUP-NAME']
    );

    await runExpectedFailure(
        client,
        'duplicate subsystem.code',
        `INSERT INTO phd.subsystem (name, code, nomenclature, description, latitude, longitude)
     VALUES ($1, $2, $3, 'dup test', 0, 0)`,
        ['Subsystem code dup test', 'AYA', 'AYA-DUP-CODE']
    );

    await runExpectedFailure(
        client,
        'duplicate subsystem.nomenclature',
        `INSERT INTO phd.subsystem (name, code, nomenclature, description, latitude, longitude)
     VALUES ($1, $2, $3, 'dup test', 0, 0)`,
        ['Subsystem nomenclature dup test', 'AYA-DUP-NOM', 'AYA']
    );

    await runExpectedFailure(
        client,
        'duplicate tag.tagname',
        `INSERT INTO phd.tag (
      tagname, description, measurement_type, role, qualifier, phd_tag_no,
      phd_unit, phd_data_type, phd_asset_name, phd_description, system_subsystem_id
    ) VALUES (
      $1, 'dup test', 'FLOW', 'IN', 'NORMAL', 'X-DUP',
      'BPH', 'FLOAT', 'asset', 'desc', $2
    )`,
        ['AYA_FI_1001', rel.rows[0].id]
    );

    await runExpectedSuccess(
        client,
        'duplicate phd_tag_no allowed',
        `INSERT INTO phd.tag (
      tagname, description, measurement_type, role, qualifier, phd_tag_no,
      phd_unit, phd_data_type, phd_asset_name, phd_description, system_subsystem_id
    ) VALUES (
      $1, 'dup phd_tag_no allowed', 'FLOW', 'OUT', 'NORMAL', '50001',
      'BPH', 'FLOAT', 'asset', 'desc', $2
    )`,
        ['TMP_DUP_PHD_TAG_NO', rel.rows[0].id]
    );

    await runExpectedFailure(
        client,
        'duplicate system_subsystem relation',
        `INSERT INTO phd.system_subsystem (system_id, subsystem_id, display_order)
     VALUES ($1, $2, 99)`,
        [system.rows[0].id, subsystem.rows[0].id]
    );

    await runExpectedFailure(
        client,
        'duplicate system_group_member pair',
        `INSERT INTO phd.system_group_member (system_group_id, system_id, display_order)
     VALUES ($1, $2, 99)`,
        [group.rows[0].id, system.rows[0].id]
    );

    const groupMemberOrderConflictSystem = await client.query(
        `SELECT id FROM phd.system_entity WHERE code = '22' LIMIT 1`
    );

    await runExpectedFailure(
        client,
        'duplicate system_group_member display_order in group',
        `INSERT INTO phd.system_group_member (system_group_id, system_id, display_order)
     VALUES ($1, $2, 1)`,
        [group.rows[0].id, groupMemberOrderConflictSystem.rows[0].id]
    );

    await client.end();
})().catch((error) => {
    console.error('validate-phd-constraints failed:', error);
    process.exit(1);
});
