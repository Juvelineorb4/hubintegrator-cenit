import assert from "node:assert/strict";
import express from "express";

import { inArray, sql } from "drizzle-orm";
import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import {
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
} from "../core/db/drizzle/schema/phd.schema";

type ApiSuccess<T> = {
  success: true;
  data: T;
  total?: number;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type SystemGroupListItem = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type SystemGroupMemberItem = {
  id: string;
  systemGroupId: string;
  systemId: string;
  systemName: string;
  systemCode: string;
  systemType: "OIL_PIPELINE" | "PRODUCT_PIPELINE" | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

type SystemGroupDetail = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  members: SystemGroupMemberItem[];
  createdAt: string;
  updatedAt: string;
};

const BASE_URL = "http://127.0.0.1";

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function requestJson<T>(
  method: "GET" | "POST",
  url: string,
  body?: unknown
): Promise<{ status: number; json: ApiResponse<T> }> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await response.json()) as ApiResponse<T>;
  return { status: response.status, json };
}

function assertSuccess<T>(
  result: { status: number; json: ApiResponse<T> },
  expectedStatus: number
): ApiSuccess<T> {
  assert.equal(result.status, expectedStatus);
  assert.equal(result.json.success, true);
  return result.json as ApiSuccess<T>;
}

function assertFailure<T>(
  result: { status: number; json: ApiResponse<T> },
  expectedStatus: number,
  expectedMessage?: string
): ApiFailure {
  assert.equal(result.status, expectedStatus);
  assert.equal(result.json.success, false);
  const failure = result.json as ApiFailure;
  if (expectedMessage) {
    assert.equal(failure.message, expectedMessage);
  }
  return failure;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const dbNameQuery = await pool.query("select current_database() as db");
  const dbName = dbNameQuery.rows[0]?.db as string;
  assert.equal(dbName, "industrial_integration_hub_test", "Tests must run against industrial_integration_hub_test");

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind phase3a test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const systemCodeA = makeCode("SYS_G_A");
    const systemCodeB = makeCode("SYS_G_B");
    const systemCodeC = makeCode("SYS_G_C");

    const [systemA, systemB, systemC] = await db
      .insert(phdSystemEntity)
      .values([
        {
          name: makeCode("SystemGroupSystemA"),
          code: systemCodeA,
          type: "OIL_PIPELINE",
          description: "Phase3A fixture system A",
        },
        {
          name: makeCode("SystemGroupSystemB"),
          code: systemCodeB,
          type: "PRODUCT_PIPELINE",
          description: "Phase3A fixture system B",
        },
        {
          name: makeCode("SystemGroupSystemC"),
          code: systemCodeC,
          type: "OIL_PIPELINE",
          description: "Phase3A fixture system C",
        },
      ])
      .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code, name: phdSystemEntity.name });

    const [groupWithMembers, groupWithoutMembers, secondGroupForSameSystem] = await db
      .insert(phdSystemGroup)
      .values([
        {
          name: makeCode("GroupWithMembers"),
          description: "Phase3A group with members",
          displayOrder: 10,
        },
        {
          name: makeCode("GroupWithoutMembers"),
          description: "Phase3A group without members",
          displayOrder: 11,
        },
        {
          name: makeCode("GroupSecondForSameSystem"),
          description: "Phase3A second group",
          displayOrder: 12,
        },
      ])
      .returning({ id: phdSystemGroup.id, name: phdSystemGroup.name });

    await db.insert(phdSystemGroupMember).values([
      {
        systemGroupId: groupWithMembers.id,
        systemId: systemB.id,
        displayOrder: 1,
      },
      {
        systemGroupId: groupWithMembers.id,
        systemId: systemA.id,
        displayOrder: 2,
      },
      {
        systemGroupId: secondGroupForSameSystem.id,
        systemId: systemB.id,
        displayOrder: 1,
      },
    ]);

    const statusEvidence: Record<string, number> = {};

    const getGroups = await requestJson<SystemGroupListItem[]>("GET", `${baseUrl}/system-groups`);
    statusEvidence.getGroups = getGroups.status;
    const getGroupsBody = assertSuccess(getGroups, 200);
    const groups = getGroupsBody.data;
    assert.ok(Array.isArray(groups));

    const relevantGroups = groups.filter((row) =>
      [groupWithMembers.id, groupWithoutMembers.id, secondGroupForSameSystem.id].includes(row.id)
    );
    assert.equal(relevantGroups.length, 3, "All seeded groups must be visible");

    const uniqueIds = new Set(groups.map((row) => row.id));
    assert.equal(uniqueIds.size, groups.length, "GET /system-groups must not return duplicate groups");

    const withMembersFromList = relevantGroups.find((row) => row.id === groupWithMembers.id);
    assert.ok(withMembersFromList, "groupWithMembers missing in list");
    assert.equal(withMembersFromList.memberCount, 2);

    const withoutMembersFromList = relevantGroups.find((row) => row.id === groupWithoutMembers.id);
    assert.ok(withoutMembersFromList, "groupWithoutMembers missing in list");
    assert.equal(withoutMembersFromList.memberCount, 0);

    const getGroupWithMembers = await requestJson<SystemGroupDetail>(
      "GET",
      `${baseUrl}/system-groups/${groupWithMembers.id}`
    );
    statusEvidence.getGroupById = getGroupWithMembers.status;
    const getGroupWithMembersBody = assertSuccess(getGroupWithMembers, 200);
    assert.equal(getGroupWithMembersBody.data.id, groupWithMembers.id);
    assert.equal(getGroupWithMembersBody.data.members.length, 2);

    const getGroupWithoutMembers = await requestJson<SystemGroupDetail>(
      "GET",
      `${baseUrl}/system-groups/${groupWithoutMembers.id}`
    );
    statusEvidence.getGroupWithoutMembers = getGroupWithoutMembers.status;
    const getGroupWithoutMembersBody = assertSuccess(getGroupWithoutMembers, 200);
    assert.equal(getGroupWithoutMembersBody.data.members.length, 0);

    const getMembers = await requestJson<SystemGroupMemberItem[]>(
      "GET",
      `${baseUrl}/system-groups/${groupWithMembers.id}/members`
    );
    statusEvidence.getMembers = getMembers.status;
    const getMembersBody = assertSuccess(getMembers, 200);
    assert.equal(getMembersBody.data.length, 2);

    const memberOrders = getMembersBody.data.map((row) => row.displayOrder);
    assert.deepEqual(memberOrders, [1, 2], "Members must be ordered by displayOrder asc");

    const missingGroup = await requestJson<SystemGroupDetail>(
      "GET",
      `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000999`
    );
    statusEvidence.getGroupMissing = missingGroup.status;
    assertFailure(missingGroup, 404, "System group not found");

    const createGroupPayload = {
      name: makeCode("CreateGroupValid"),
      description: "Created via API phase3a",
      displayOrder: 30,
    };

    const createGroup = await requestJson<{ id: string; name: string; displayOrder: number }>(
      "POST",
      `${baseUrl}/system-groups`,
      createGroupPayload
    );
    statusEvidence.createGroup = createGroup.status;
    const createGroupBody = assertSuccess(createGroup, 201);
    assert.equal(createGroupBody.data.name, createGroupPayload.name);

    const duplicateGroupName = await requestJson<{ id: string }>("POST", `${baseUrl}/system-groups`, {
      name: createGroupPayload.name,
      description: "duplicate name",
      displayOrder: 31,
    });
    statusEvidence.createGroupDuplicateName = duplicateGroupName.status;
    assertFailure(duplicateGroupName, 409, "System group name already exists");

    const invalidDisplayOrderGroup = await requestJson<{ id: string }>("POST", `${baseUrl}/system-groups`, {
      name: makeCode("InvalidDisplayOrder"),
      description: "invalid display order",
      displayOrder: 0,
    });
    statusEvidence.createGroupInvalidOrder = invalidDisplayOrderGroup.status;
    assertFailure(invalidDisplayOrderGroup, 400, "Invalid system group payload");

    const emptyPayloadGroup = await requestJson<{ id: string }>("POST", `${baseUrl}/system-groups`, {});
    statusEvidence.createGroupEmptyPayload = emptyPayloadGroup.status;
    assertFailure(emptyPayloadGroup, 400, "Invalid system group payload");

    const createMember = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/${createGroupBody.data.id}/members`,
      {
        systemId: systemA.id,
        displayOrder: 1,
      }
    );
    statusEvidence.createMember = createMember.status;
    const createMemberBody = assertSuccess(createMember, 201);
    assert.equal(createMemberBody.data.systemId, systemA.id);

    const createMemberGroupMissing = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000123/members`,
      {
        systemId: systemA.id,
        displayOrder: 1,
      }
    );
    statusEvidence.createMemberGroupMissing = createMemberGroupMissing.status;
    assertFailure(createMemberGroupMissing, 404, "System group not found");

    const createMemberSystemMissing = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/${createGroupBody.data.id}/members`,
      {
        systemId: "00000000-0000-0000-0000-000000000124",
        displayOrder: 2,
      }
    );
    statusEvidence.createMemberSystemMissing = createMemberSystemMissing.status;
    assertFailure(createMemberSystemMissing, 404, "System not found");

    const createMemberDuplicateSystem = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/${createGroupBody.data.id}/members`,
      {
        systemId: systemA.id,
        displayOrder: 2,
      }
    );
    statusEvidence.createMemberDuplicateSystem = createMemberDuplicateSystem.status;
    assertFailure(createMemberDuplicateSystem, 409, "System already exists in this group");

    const createMemberDuplicateDisplayOrder = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/${createGroupBody.data.id}/members`,
      {
        systemId: systemC.id,
        displayOrder: 1,
      }
    );
    statusEvidence.createMemberDuplicateOrder = createMemberDuplicateDisplayOrder.status;
    assertFailure(createMemberDuplicateDisplayOrder, 409, "Display order already exists in this group");

    const sameSystemDifferentGroup = await requestJson<SystemGroupMemberItem>(
      "POST",
      `${baseUrl}/system-groups/${groupWithoutMembers.id}/members`,
      {
        systemId: systemA.id,
        displayOrder: 1,
      }
    );
    statusEvidence.createMemberSameSystemDifferentGroup = sameSystemDifferentGroup.status;
    assertSuccess(sameSystemDifferentGroup, 201);

    const listAfterCreates = await requestJson<SystemGroupListItem[]>("GET", `${baseUrl}/system-groups`);
    const listAfterCreatesBody = assertSuccess(listAfterCreates, 200);

    const createdGroupInList = listAfterCreatesBody.data.find((row) => row.id === createGroupBody.data.id);
    assert.ok(createdGroupInList, "Created group not found in list");
    assert.equal(createdGroupInList.memberCount, 1, "memberCount must include created member");

    const sqlCounts = await db.execute(sql`
      SELECT
        g.id,
        COUNT(m.id)::int AS member_count
      FROM phd.system_group g
      LEFT JOIN phd.system_group_member m ON m.system_group_id = g.id
      WHERE g.id IN (${groupWithMembers.id}, ${groupWithoutMembers.id}, ${secondGroupForSameSystem.id}, ${createGroupBody.data.id})
      GROUP BY g.id
    `);

    const countMap = new Map<string, number>();
    for (const row of sqlCounts.rows as Array<{ id: string; member_count: number }>) {
      countMap.set(row.id, Number(row.member_count));
    }

    const idsToValidate = [groupWithMembers.id, groupWithoutMembers.id, secondGroupForSameSystem.id, createGroupBody.data.id];
    for (const groupId of idsToValidate) {
      const apiGroup = listAfterCreatesBody.data.find((row) => row.id === groupId);
      assert.ok(apiGroup, `Group ${groupId} missing from API list`);
      assert.equal(apiGroup.memberCount, countMap.get(groupId) ?? -1, `memberCount mismatch for ${groupId}`);
    }

    const orderCheck = await db.execute(sql`
      SELECT display_order
      FROM phd.system_group_member
      WHERE system_group_id = ${groupWithMembers.id}
      ORDER BY display_order ASC
    `);
    assert.deepEqual(
      (orderCheck.rows as Array<{ display_order: number }>).map((row) => Number(row.display_order)),
      [1, 2],
      "PostgreSQL order by display_order must be ascending"
    );

    const orphanMembers = await db.execute(sql`
      SELECT COUNT(*)::int AS orphan_count
      FROM phd.system_group_member m
      LEFT JOIN phd.system_group g ON g.id = m.system_group_id
      LEFT JOIN phd.system_entity s ON s.id = m.system_id
      WHERE g.id IS NULL OR s.id IS NULL
    `);
    const orphanCount = Number((orphanMembers.rows[0] as { orphan_count: number }).orphan_count);
    assert.equal(orphanCount, 0, "No orphan members allowed");

    const publicCheck = await pool.query(`
      SELECT
        to_regclass('public.system_group') AS public_system_group_table,
        to_regclass('public.system_group_member') AS public_system_group_member_table
    `);

    const publicRow = publicCheck.rows[0] as {
      public_system_group_table: string | null;
      public_system_group_member_table: string | null;
    };

    if (publicRow.public_system_group_table) {
      const check = await pool.query("SELECT COUNT(*)::int AS c FROM public.system_group WHERE name = ANY($1)", [
        [groupWithMembers.name, groupWithoutMembers.name, secondGroupForSameSystem.name, createGroupPayload.name],
      ]);
      assert.equal(Number(check.rows[0].c), 0, "No writes allowed on public.system_group");
    }

    if (publicRow.public_system_group_member_table) {
      const check = await pool.query(
        "SELECT COUNT(*)::int AS c FROM public.system_group_member WHERE system_group_id = ANY($1)",
        [[groupWithMembers.id, groupWithoutMembers.id, secondGroupForSameSystem.id, createGroupBody.data.id]]
      );
      assert.equal(Number(check.rows[0].c), 0, "No writes allowed on public.system_group_member");
    }

    const phdWriteEvidence = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_group WHERE id IN (${groupWithMembers.id}, ${groupWithoutMembers.id}, ${secondGroupForSameSystem.id}, ${createGroupBody.data.id})) AS groups_in_phd,
        (SELECT COUNT(*)::int FROM phd.system_group_member WHERE system_group_id IN (${groupWithMembers.id}, ${groupWithoutMembers.id}, ${secondGroupForSameSystem.id}, ${createGroupBody.data.id})) AS members_in_phd
    `);

    const phdEvidenceRow = phdWriteEvidence.rows[0] as {
      groups_in_phd: number;
      members_in_phd: number;
    };

    assert.equal(Number(phdEvidenceRow.groups_in_phd), 4);
    assert.ok(Number(phdEvidenceRow.members_in_phd) >= 5);

    const apiMemberIds = await db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(inArray(phdSystemGroupMember.systemGroupId, [groupWithMembers.id, groupWithoutMembers.id, secondGroupForSameSystem.id, createGroupBody.data.id]));
    assert.ok(apiMemberIds.length >= 5);

    const duplicatePairCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS duplicates
      FROM (
        SELECT system_group_id, system_id, COUNT(*)
        FROM phd.system_group_member
        WHERE system_group_id IN (${groupWithMembers.id}, ${groupWithoutMembers.id}, ${secondGroupForSameSystem.id}, ${createGroupBody.data.id})
        GROUP BY system_group_id, system_id
        HAVING COUNT(*) > 1
      ) dup
    `);
    assert.equal(Number((duplicatePairCheck.rows[0] as { duplicates: number }).duplicates), 0);

    console.log("phase3a-http-statuses", JSON.stringify(statusEvidence));
    console.log(
      "phase3a-evidence",
      JSON.stringify({
        db: dbName,
        groupsInPhd: Number(phdEvidenceRow.groups_in_phd),
        membersInPhd: Number(phdEvidenceRow.members_in_phd),
        orphanMembers: orphanCount,
        publicSystemGroupTable: publicRow.public_system_group_table,
        publicSystemGroupMemberTable: publicRow.public_system_group_member_table,
      })
    );

    console.log("phase3a-system-group.integration: OK");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

run().catch((error) => {
  console.error("phase3a-system-group.integration: FAILED", error);
  process.exit(1);
});
