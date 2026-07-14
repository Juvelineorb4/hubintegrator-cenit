import assert from "node:assert/strict";
import express from "express";

import { and, eq, inArray, sql } from "drizzle-orm";
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

type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

type GroupMember = {
  id: string;
  systemGroupId: string;
  systemId: string;
  systemName: string;
  systemCode: string;
  systemType: "OIL_PIPELINE" | "PRODUCT_PIPELINE" | null;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

const BASE_URL = "http://127.0.0.1";

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function requestJson<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown
): Promise<{ status: number; json: ApiResponse<T> | null; raw: string }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const json = raw ? (JSON.parse(raw) as ApiResponse<T>) : null;
  return { status: response.status, json, raw };
}

function assertSuccess<T>(
  result: { status: number; json: ApiResponse<T> | null },
  expectedStatus: number
): ApiSuccess<T> {
  assert.equal(result.status, expectedStatus);
  assert.ok(result.json);
  assert.equal(result.json.success, true);
  return result.json as ApiSuccess<T>;
}

function assertFailure<T>(
  result: { status: number; json: ApiResponse<T> | null },
  expectedStatus: number,
  expectedMessage?: string
): ApiFailure {
  assert.equal(result.status, expectedStatus);
  assert.ok(result.json);
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
    throw new Error("Failed to bind phase3b test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const [systemA, systemB, systemC, systemD] = await db
      .insert(phdSystemEntity)
      .values([
        {
          name: makeCode("P3B_System_A"),
          code: makeCode("P3B_SYS_A"),
          type: "OIL_PIPELINE",
        },
        {
          name: makeCode("P3B_System_B"),
          code: makeCode("P3B_SYS_B"),
          type: "PRODUCT_PIPELINE",
        },
        {
          name: makeCode("P3B_System_C"),
          code: makeCode("P3B_SYS_C"),
          type: "OIL_PIPELINE",
        },
        {
          name: makeCode("P3B_System_D"),
          code: makeCode("P3B_SYS_D"),
          type: "PRODUCT_PIPELINE",
        },
      ])
      .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code, name: phdSystemEntity.name });

    const [groupA, groupB, groupEmpty, groupDeleteTwice, groupOther] = await db
      .insert(phdSystemGroup)
      .values([
        {
          name: makeCode("P3B_Group_A"),
          description: "phase3b primary group",
          displayOrder: 10,
        },
        {
          name: makeCode("P3B_Group_B"),
          description: "phase3b secondary group",
          displayOrder: 11,
        },
        {
          name: makeCode("P3B_Group_Empty"),
          description: "phase3b empty group",
          displayOrder: 12,
        },
        {
          name: makeCode("P3B_Group_Delete_Twice"),
          description: "phase3b delete twice group",
          displayOrder: 13,
        },
        {
          name: makeCode("P3B_Group_Other"),
          description: "phase3b other group",
          displayOrder: 14,
        },
      ])
      .returning({ id: phdSystemGroup.id, name: phdSystemGroup.name, description: phdSystemGroup.description });

    const [memberA1, memberA2, memberB1, memberOther] = await db
      .insert(phdSystemGroupMember)
      .values([
        { systemGroupId: groupA.id, systemId: systemA.id, displayOrder: 1 },
        { systemGroupId: groupA.id, systemId: systemB.id, displayOrder: 2 },
        { systemGroupId: groupB.id, systemId: systemC.id, displayOrder: 1 },
        { systemGroupId: groupOther.id, systemId: systemD.id, displayOrder: 1 },
      ])
      .returning({
        id: phdSystemGroupMember.id,
        systemGroupId: phdSystemGroupMember.systemGroupId,
        systemId: phdSystemGroupMember.systemId,
      });

    const statusEvidence: Record<string, number> = {};

    const patchGroupName = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {
      name: `${groupA.name}_RENAMED`,
    });
    statusEvidence.patchGroupName = patchGroupName.status;
    const patchGroupNameBody = assertSuccess(patchGroupName, 200);
    assert.equal(patchGroupNameBody.data.name, `${groupA.name}_RENAMED`);
    assert.equal(patchGroupNameBody.data.memberCount, 2);

    const patchGroupDescriptionOnly = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {
      description: "phase3b description-only update",
    });
    statusEvidence.patchGroupDescriptionOnly = patchGroupDescriptionOnly.status;
    const patchGroupDescriptionBody = assertSuccess(patchGroupDescriptionOnly, 200);
    assert.equal(patchGroupDescriptionBody.data.description, "phase3b description-only update");
    assert.equal(patchGroupDescriptionBody.data.name, `${groupA.name}_RENAMED`);

    const patchGroupDisplayOrder = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {
      displayOrder: 20,
    });
    statusEvidence.patchGroupDisplayOrder = patchGroupDisplayOrder.status;
    const patchGroupDisplayOrderBody = assertSuccess(patchGroupDisplayOrder, 200);
    assert.equal(patchGroupDisplayOrderBody.data.displayOrder, 20);
    assert.equal(patchGroupDisplayOrderBody.data.description, "phase3b description-only update");

    const patchGroupMissing = await requestJson<GroupSummary>(
      "PATCH",
      `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000301`,
      { name: "none" }
    );
    statusEvidence.patchGroupMissing = patchGroupMissing.status;
    assertFailure(patchGroupMissing, 404, "System group not found");

    const patchGroupDuplicateName = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {
      name: groupB.name,
    });
    statusEvidence.patchGroupDuplicateName = patchGroupDuplicateName.status;
    assertFailure(patchGroupDuplicateName, 409, "System group name already exists");

    const patchGroupInvalidDisplayOrder = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {
      displayOrder: 0,
    });
    statusEvidence.patchGroupInvalidDisplayOrder = patchGroupInvalidDisplayOrder.status;
    assertFailure(patchGroupInvalidDisplayOrder, 400, "Invalid system group payload");

    const patchGroupEmptyPayload = await requestJson<GroupSummary>("PATCH", `${baseUrl}/system-groups/${groupA.id}`, {});
    statusEvidence.patchGroupEmptyPayload = patchGroupEmptyPayload.status;
    assertFailure(patchGroupEmptyPayload, 400, "Invalid system group payload");

    const patchMemberDisplayOrder = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { displayOrder: 5 }
    );
    statusEvidence.patchMemberDisplayOrder = patchMemberDisplayOrder.status;
    const patchMemberDisplayOrderBody = assertSuccess(patchMemberDisplayOrder, 200);
    assert.equal(patchMemberDisplayOrderBody.data.displayOrder, 5);
    assert.equal(patchMemberDisplayOrderBody.data.systemId, systemA.id);

    const patchMemberSystemId = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { systemId: systemD.id }
    );
    statusEvidence.patchMemberSystemId = patchMemberSystemId.status;
    const patchMemberSystemIdBody = assertSuccess(patchMemberSystemId, 200);
    assert.equal(patchMemberSystemIdBody.data.systemId, systemD.id);
    assert.equal(patchMemberSystemIdBody.data.displayOrder, 5);

    const patchMemberSameSystemDifferentGroup = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { systemId: systemC.id }
    );
    statusEvidence.patchMemberSameSystemDifferentGroup = patchMemberSameSystemDifferentGroup.status;
    assertSuccess(patchMemberSameSystemDifferentGroup, 200);

    const patchMemberGroupMissing = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000401/members/${memberA1.id}`,
      { displayOrder: 6 }
    );
    statusEvidence.patchMemberGroupMissing = patchMemberGroupMissing.status;
    assertFailure(patchMemberGroupMissing, 404, "System group not found");

    const patchMemberMissing = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/00000000-0000-0000-0000-000000000402`,
      { displayOrder: 6 }
    );
    statusEvidence.patchMemberMissing = patchMemberMissing.status;
    assertFailure(patchMemberMissing, 404, "System group member not found");

    const patchMemberOtherGroup = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberOther.id}`,
      { displayOrder: 2 }
    );
    statusEvidence.patchMemberOtherGroup = patchMemberOtherGroup.status;
    assertFailure(patchMemberOtherGroup, 404, "System group member not found");

    const patchMemberSystemMissing = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { systemId: "00000000-0000-0000-0000-000000000403" }
    );
    statusEvidence.patchMemberSystemMissing = patchMemberSystemMissing.status;
    assertFailure(patchMemberSystemMissing, 404, "System not found");

    const patchMemberDuplicateSystem = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { systemId: systemB.id }
    );
    statusEvidence.patchMemberDuplicateSystem = patchMemberDuplicateSystem.status;
    assertFailure(patchMemberDuplicateSystem, 409, "System already exists in this group");

    const patchMemberDuplicateOrder = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      { displayOrder: 2 }
    );
    statusEvidence.patchMemberDuplicateOrder = patchMemberDuplicateOrder.status;
    assertFailure(patchMemberDuplicateOrder, 409, "Display order already exists in this group");

    const patchMemberEmptyPayload = await requestJson<GroupMember>(
      "PATCH",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`,
      {}
    );
    statusEvidence.patchMemberEmptyPayload = patchMemberEmptyPayload.status;
    assertFailure(patchMemberEmptyPayload, 400, "Invalid system group member payload");

    const memberCountGroupABeforeDeleteMember = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemGroupId, groupA.id));

    const deleteMember = await requestJson<never>(
      "DELETE",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`
    );
    statusEvidence.deleteMember = deleteMember.status;
    assert.equal(deleteMember.status, 204);
    assert.equal(deleteMember.raw, "");

    const memberCountGroupAAfterDeleteMember = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemGroupId, groupA.id));
    assert.equal(
      Number(memberCountGroupABeforeDeleteMember[0].c) - Number(memberCountGroupAAfterDeleteMember[0].c),
      1,
      "Only one member must be removed"
    );

    const deleteMemberRepeat = await requestJson<never>(
      "DELETE",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberA1.id}`
    );
    statusEvidence.deleteMemberRepeat = deleteMemberRepeat.status;
    assertFailure(deleteMemberRepeat, 404, "System group member not found");

    const deleteMemberGroupMissing = await requestJson<never>(
      "DELETE",
      `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000501/members/${memberA2.id}`
    );
    statusEvidence.deleteMemberGroupMissing = deleteMemberGroupMissing.status;
    assertFailure(deleteMemberGroupMissing, 404, "System group not found");

    const deleteMemberMissing = await requestJson<never>(
      "DELETE",
      `${baseUrl}/system-groups/${groupA.id}/members/00000000-0000-0000-0000-000000000502`
    );
    statusEvidence.deleteMemberMissing = deleteMemberMissing.status;
    assertFailure(deleteMemberMissing, 404, "System group member not found");

    const deleteMemberOtherGroup = await requestJson<never>(
      "DELETE",
      `${baseUrl}/system-groups/${groupA.id}/members/${memberOther.id}`
    );
    statusEvidence.deleteMemberOtherGroup = deleteMemberOtherGroup.status;
    assertFailure(deleteMemberOtherGroup, 404, "System group member not found");

    const systemStillExists = await db
      .select({ id: phdSystemEntity.id })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, systemC.id));
    assert.equal(systemStillExists.length, 1, "DELETE member must not delete system entity");

    const otherMembersRemain = await db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.id, memberA2.id));
    assert.equal(otherMembersRemain.length, 1, "DELETE member must not remove other group members");

    const groupAWithMembersBeforeDelete = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemGroupId, groupA.id));

    const deleteGroupWithMembers = await requestJson<never>("DELETE", `${baseUrl}/system-groups/${groupA.id}`);
    statusEvidence.deleteGroupWithMembers = deleteGroupWithMembers.status;
    assertFailure(deleteGroupWithMembers, 409, "System group has members");

    const groupAWithMembersAfterDeleteAttempt = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.systemGroupId, groupA.id));
    assert.equal(
      Number(groupAWithMembersBeforeDelete[0].c),
      Number(groupAWithMembersAfterDeleteAttempt[0].c),
      "DELETE group must not trigger unauthorized member cascade"
    );

    const deleteGroupWithoutMembers = await requestJson<never>("DELETE", `${baseUrl}/system-groups/${groupEmpty.id}`);
    statusEvidence.deleteGroupWithoutMembers = deleteGroupWithoutMembers.status;
    assert.equal(deleteGroupWithoutMembers.status, 204);
    assert.equal(deleteGroupWithoutMembers.raw, "");

    const deleteGroupWithoutMembersRepeat = await requestJson<never>("DELETE", `${baseUrl}/system-groups/${groupEmpty.id}`);
    statusEvidence.deleteGroupWithoutMembersRepeat = deleteGroupWithoutMembersRepeat.status;
    assertFailure(deleteGroupWithoutMembersRepeat, 404, "System group not found");

    const deleteGroupMissing = await requestJson<never>("DELETE", `${baseUrl}/system-groups/00000000-0000-0000-0000-000000000601`);
    statusEvidence.deleteGroupMissing = deleteGroupMissing.status;
    assertFailure(deleteGroupMissing, 404, "System group not found");

    const deleteGroupTwiceFirst = await requestJson<never>("DELETE", `${baseUrl}/system-groups/${groupDeleteTwice.id}`);
    statusEvidence.deleteGroupTwiceFirst = deleteGroupTwiceFirst.status;
    assert.equal(deleteGroupTwiceFirst.status, 204);

    const deleteGroupTwiceSecond = await requestJson<never>("DELETE", `${baseUrl}/system-groups/${groupDeleteTwice.id}`);
    statusEvidence.deleteGroupTwiceSecond = deleteGroupTwiceSecond.status;
    assertFailure(deleteGroupTwiceSecond, 404, "System group not found");

    const orphanMembers = await db.execute(sql`
      SELECT COUNT(*)::int AS orphan_count
      FROM phd.system_group_member m
      LEFT JOIN phd.system_group g ON g.id = m.system_group_id
      LEFT JOIN phd.system_entity s ON s.id = m.system_id
      WHERE g.id IS NULL OR s.id IS NULL
    `);
    assert.equal(Number((orphanMembers.rows[0] as { orphan_count: number }).orphan_count), 0);

    const systemsAfterDeletes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdSystemEntity)
      .where(inArray(phdSystemEntity.id, [systemA.id, systemB.id, systemC.id, systemD.id]));
    assert.equal(Number(systemsAfterDeletes[0].c), 4, "No system_entity rows must be deleted in phase3b operations");

    const publicTables = await pool.query(`
      SELECT
        to_regclass('public.system_group') AS public_system_group_table,
        to_regclass('public.system_group_member') AS public_system_group_member_table
    `);

    const publicRow = publicTables.rows[0] as {
      public_system_group_table: string | null;
      public_system_group_member_table: string | null;
    };

    if (publicRow.public_system_group_table) {
      const publicGroupWrites = await pool.query(
        "SELECT COUNT(*)::int AS c FROM public.system_group WHERE id = ANY($1)",
        [[groupA.id, groupB.id, groupEmpty.id, groupDeleteTwice.id, groupOther.id]]
      );
      assert.equal(Number(publicGroupWrites.rows[0].c), 0);
    }

    if (publicRow.public_system_group_member_table) {
      const publicMemberWrites = await pool.query(
        "SELECT COUNT(*)::int AS c FROM public.system_group_member WHERE system_group_id = ANY($1)",
        [[groupA.id, groupB.id, groupOther.id]]
      );
      assert.equal(Number(publicMemberWrites.rows[0].c), 0);
    }

    const phdEvidence = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_group WHERE id IN (${groupA.id}, ${groupB.id}, ${groupOther.id})) AS remaining_groups,
        (SELECT COUNT(*)::int FROM phd.system_group_member WHERE system_group_id = ${groupA.id}) AS group_a_members,
        (SELECT COUNT(*)::int FROM phd.system_group_member WHERE system_group_id = ${groupB.id}) AS group_b_members,
        (SELECT COUNT(*)::int FROM phd.system_group_member WHERE system_group_id = ${groupOther.id}) AS group_other_members
    `);

    const phdEvidenceRow = phdEvidence.rows[0] as {
      remaining_groups: number;
      group_a_members: number;
      group_b_members: number;
      group_other_members: number;
    };

    assert.equal(Number(phdEvidenceRow.remaining_groups), 3);
    assert.equal(Number(phdEvidenceRow.group_a_members), 1);
    assert.equal(Number(phdEvidenceRow.group_b_members), 1);
    assert.equal(Number(phdEvidenceRow.group_other_members), 1);

    console.log("phase3b-http-statuses", JSON.stringify(statusEvidence));
    console.log(
      "phase3b-evidence",
      JSON.stringify({
        db: dbName,
        remainingGroups: Number(phdEvidenceRow.remaining_groups),
        groupAMembers: Number(phdEvidenceRow.group_a_members),
        groupBMembers: Number(phdEvidenceRow.group_b_members),
        groupOtherMembers: Number(phdEvidenceRow.group_other_members),
        orphanMembers: Number((orphanMembers.rows[0] as { orphan_count: number }).orphan_count),
        systemsStillPresent: Number(systemsAfterDeletes[0].c),
        publicSystemGroupTable: publicRow.public_system_group_table,
        publicSystemGroupMemberTable: publicRow.public_system_group_member_table,
      })
    );

    console.log("phase3b-system-group-update-delete.integration: OK");
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
  console.error("phase3b-system-group-update-delete.integration: FAILED", error);
  process.exit(1);
});
