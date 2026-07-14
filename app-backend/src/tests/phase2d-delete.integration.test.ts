import assert from "node:assert/strict";
import express from "express";

import { and, eq, sql } from "drizzle-orm";
import { appRouter } from "../app.routes";
import { db, pool } from "../core/db/drizzle/client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemSubsystem,
  phdTag,
} from "../core/db/drizzle/schema/phd.schema";

type ApiFailure = {
  success: false;
  message: string;
};

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

const BASE_URL = "http://127.0.0.1";

function makeCode(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function requestRaw(method: HttpMethod, url: string, body?: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  return { status: response.status, text };
}

function parseFailure(result: { status: number; text: string }, expectedStatus: number, expectedMessage?: string): ApiFailure {
  assert.equal(result.status, expectedStatus);
  const parsed = JSON.parse(result.text) as ApiFailure;
  assert.equal(parsed.success, false);
  if (expectedMessage) {
    assert.equal(parsed.message, expectedMessage);
  }
  return parsed;
}

function assertNoContent(result: { status: number; text: string }) {
  assert.equal(result.status, 204);
  assert.equal(result.text.trim(), "");
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind phase2d test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const [sysNoDeps] = await db
      .insert(phdSystemEntity)
      .values({
        name: `SYS_${makeCode("NO_DEPS")}`,
        code: makeCode("SYS_NO_DEPS"),
        description: "phase2d delete system no deps",
        type: "OIL_PIPELINE",
      })
      .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code });

    const [sysWithRel] = await db
      .insert(phdSystemEntity)
      .values({
        name: `SYS_${makeCode("WITH_REL")}`,
        code: makeCode("SYS_WITH_REL"),
        description: "phase2d delete system with relation",
        type: "PRODUCT_PIPELINE",
      })
      .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code });

    const [sysWithGroup] = await db
      .insert(phdSystemEntity)
      .values({
        name: `SYS_${makeCode("WITH_GROUP")}`,
        code: makeCode("SYS_WITH_GROUP"),
        description: "phase2d delete system with group membership",
        type: "PRODUCT_PIPELINE",
      })
      .returning({ id: phdSystemEntity.id, code: phdSystemEntity.code });

    const [subNoRel] = await db
      .insert(phdSubsystem)
      .values({
        name: `SUB_${makeCode("NO_REL")}`,
        code: makeCode("SUB_NO_REL"),
        nomenclature: makeCode("NOM_NO_REL"),
      })
      .returning({ id: phdSubsystem.id });

    const [subWithRel] = await db
      .insert(phdSubsystem)
      .values({
        name: `SUB_${makeCode("WITH_REL")}`,
        code: makeCode("SUB_WITH_REL"),
        nomenclature: makeCode("NOM_WITH_REL"),
      })
      .returning({ id: phdSubsystem.id, code: phdSubsystem.code });

    const [subOther] = await db
      .insert(phdSubsystem)
      .values({
        name: `SUB_${makeCode("OTHER")}`,
        code: makeCode("SUB_OTHER"),
        nomenclature: makeCode("NOM_OTHER"),
      })
      .returning({ id: phdSubsystem.id });

    const [relWithTags] = await db
      .insert(phdSystemSubsystem)
      .values({
        systemId: sysWithRel.id,
        subsystemId: subWithRel.id,
        displayOrder: 1,
      })
      .returning({ id: phdSystemSubsystem.id });

    const [relNoTags] = await db
      .insert(phdSystemSubsystem)
      .values({
        systemId: sysWithRel.id,
        subsystemId: subOther.id,
        displayOrder: 2,
      })
      .returning({ id: phdSystemSubsystem.id });

    const [group] = await db
      .insert(phdSystemGroup)
      .values({
        name: `GROUP_${makeCode("A")}`,
        description: "phase2d group",
        displayOrder: 1,
      })
      .returning({ id: phdSystemGroup.id });

    const [groupMember] = await db
      .insert(phdSystemGroupMember)
      .values({
        systemGroupId: group.id,
        systemId: sysWithGroup.id,
        displayOrder: 1,
      })
      .returning({ id: phdSystemGroupMember.id });

    const [tagDeleteTarget] = await db
      .insert(phdTag)
      .values({
        tagname: makeCode("TAG_DELETE_TARGET"),
        measurementType: "FLOW",
        role: "IN",
        qualifier: "NORMAL",
        phdTagNo: makeCode("TAGNO_DELETE"),
        phdDataType: "DOUBLE",
        systemSubsystemId: relWithTags.id,
      })
      .returning({ id: phdTag.id, tagname: phdTag.tagname });

    const [tagControl] = await db
      .insert(phdTag)
      .values({
        tagname: makeCode("TAG_CONTROL"),
        measurementType: "FLOW",
        role: "OUT",
        qualifier: "NORMAL",
        phdTagNo: makeCode("TAGNO_CONTROL"),
        phdDataType: "DOUBLE",
        systemSubsystemId: relWithTags.id,
      })
      .returning({ id: phdTag.id, tagname: phdTag.tagname });

    const countTagsBeforeDelete = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdTag)
      .where(eq(phdTag.systemSubsystemId, relWithTags.id));

    const deleteTagOk = await requestRaw("DELETE", `${baseUrl}/tags/${tagDeleteTarget.id}`);
    assertNoContent(deleteTagOk);

    const countTagsAfterDelete = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdTag)
      .where(eq(phdTag.systemSubsystemId, relWithTags.id));

    assert.equal(Number(countTagsBeforeDelete[0]?.c), Number(countTagsAfterDelete[0]?.c) + 1);

    const [stillControlTag] = await db
      .select({ id: phdTag.id })
      .from(phdTag)
      .where(eq(phdTag.id, tagControl.id))
      .limit(1);
    assert.ok(stillControlTag?.id);

    parseFailure(await requestRaw("DELETE", `${baseUrl}/tags/${tagDeleteTarget.id}`), 404, "Tag not found");
    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/tags/00000000-0000-0000-0000-0000000000a1`),
      404,
      "Tag not found"
    );

    const relationDeleteOk = await requestRaw("DELETE", `${baseUrl}/sub-systems/relations/${relNoTags.id}`);
    assertNoContent(relationDeleteOk);

    const [deletedRelNoTags] = await db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.id, relNoTags.id))
      .limit(1);
    assert.equal(deletedRelNoTags, undefined);

    const tagsBeforeRelationConflict = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdTag)
      .where(eq(phdTag.systemSubsystemId, relWithTags.id));

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/sub-systems/relations/${relWithTags.id}`),
      409,
      "System/sub-system relation has tags"
    );

    const tagsAfterRelationConflict = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(phdTag)
      .where(eq(phdTag.systemSubsystemId, relWithTags.id));

    assert.equal(Number(tagsBeforeRelationConflict[0]?.c), Number(tagsAfterRelationConflict[0]?.c));

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/sub-systems/relations/00000000-0000-0000-0000-0000000000a2`),
      404,
      "System/sub-system relation not found"
    );

    const subDeleteOk = await requestRaw("DELETE", `${baseUrl}/sub-systems/${subNoRel.id}`);
    assertNoContent(subDeleteOk);

    const [deletedSubNoRel] = await db
      .select({ id: phdSubsystem.id })
      .from(phdSubsystem)
      .where(eq(phdSubsystem.id, subNoRel.id))
      .limit(1);
    assert.equal(deletedSubNoRel, undefined);

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/sub-systems/${subWithRel.id}`),
      409,
      "Sub-system has system relations"
    );

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/sub-systems/00000000-0000-0000-0000-0000000000a3`),
      404,
      "Sub-system not found"
    );

    const [relationStillExists] = await db
      .select({ id: phdSystemSubsystem.id })
      .from(phdSystemSubsystem)
      .where(eq(phdSystemSubsystem.id, relWithTags.id))
      .limit(1);
    assert.ok(relationStillExists?.id);

    const systemDeleteOk = await requestRaw("DELETE", `${baseUrl}/systems/${sysNoDeps.id}`);
    assertNoContent(systemDeleteOk);

    const [deletedSysNoDeps] = await db
      .select({ id: phdSystemEntity.id })
      .from(phdSystemEntity)
      .where(eq(phdSystemEntity.id, sysNoDeps.id))
      .limit(1);
    assert.equal(deletedSysNoDeps, undefined);

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/systems/${sysWithRel.id}`),
      409,
      "System has related sub-systems"
    );

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/systems/${sysWithGroup.id}`),
      409,
      "System belongs to one or more groups"
    );

    parseFailure(
      await requestRaw("DELETE", `${baseUrl}/systems/00000000-0000-0000-0000-0000000000a4`),
      404,
      "System not found"
    );

    const [groupMemberStillExists] = await db
      .select({ id: phdSystemGroupMember.id })
      .from(phdSystemGroupMember)
      .where(eq(phdSystemGroupMember.id, groupMember.id))
      .limit(1);
    assert.ok(groupMemberStillExists?.id);

    const evidence = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE id = ${sysNoDeps.id}) AS deleted_system_exists,
        (SELECT COUNT(*)::int FROM phd.subsystem WHERE id = ${subNoRel.id}) AS deleted_subsystem_exists,
        (SELECT COUNT(*)::int FROM phd.system_subsystem WHERE id = ${relNoTags.id}) AS deleted_relation_exists,
        (SELECT COUNT(*)::int FROM phd.tag WHERE id = ${tagDeleteTarget.id}) AS deleted_tag_exists,
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE id = ${sysWithRel.id}) AS protected_system_rel_exists,
        (SELECT COUNT(*)::int FROM phd.system_entity WHERE id = ${sysWithGroup.id}) AS protected_system_group_exists,
        (SELECT COUNT(*)::int FROM phd.subsystem WHERE id = ${subWithRel.id}) AS protected_subsystem_exists,
        (SELECT COUNT(*)::int FROM phd.system_subsystem WHERE id = ${relWithTags.id}) AS protected_relation_exists,
        (SELECT COUNT(*)::int FROM phd.tag WHERE id = ${tagControl.id}) AS protected_tag_exists,
        (SELECT COUNT(*)::int FROM phd.system_group_member WHERE id = ${groupMember.id}) AS protected_group_member_exists,
        (SELECT COUNT(*)::int
           FROM phd.tag t
      LEFT JOIN phd.system_subsystem ss ON ss.id = t.system_subsystem_id
          WHERE ss.id IS NULL) AS orphan_tags
    `);

    const evidenceRow = evidence.rows[0] as {
      deleted_system_exists: number;
      deleted_subsystem_exists: number;
      deleted_relation_exists: number;
      deleted_tag_exists: number;
      protected_system_rel_exists: number;
      protected_system_group_exists: number;
      protected_subsystem_exists: number;
      protected_relation_exists: number;
      protected_tag_exists: number;
      protected_group_member_exists: number;
      orphan_tags: number;
    };

    assert.equal(Number(evidenceRow.deleted_system_exists), 0);
    assert.equal(Number(evidenceRow.deleted_subsystem_exists), 0);
    assert.equal(Number(evidenceRow.deleted_relation_exists), 0);
    assert.equal(Number(evidenceRow.deleted_tag_exists), 0);
    assert.equal(Number(evidenceRow.protected_system_rel_exists), 1);
    assert.equal(Number(evidenceRow.protected_system_group_exists), 1);
    assert.equal(Number(evidenceRow.protected_subsystem_exists), 1);
    assert.equal(Number(evidenceRow.protected_relation_exists), 1);
    assert.equal(Number(evidenceRow.protected_tag_exists), 1);
    assert.equal(Number(evidenceRow.protected_group_member_exists), 1);
    assert.equal(Number(evidenceRow.orphan_tags), 0);

    const publicCheck = await pool.query(`
      SELECT
        to_regclass('public.system_entity') AS public_system_table,
        to_regclass('public.sub_system') AS public_subsystem_table,
        to_regclass('public.system_sub_system') AS public_relation_table,
        to_regclass('public.tag') AS public_tag_table
    `);

    const publicRow = publicCheck.rows[0] as {
      public_system_table: string | null;
      public_subsystem_table: string | null;
      public_relation_table: string | null;
      public_tag_table: string | null;
    };

    assert.equal(publicRow.public_system_table, null);
    assert.equal(publicRow.public_subsystem_table, null);
    assert.equal(publicRow.public_relation_table, null);
    assert.equal(publicRow.public_tag_table, null);

    console.log("phase2d-http-results", JSON.stringify({
      deleteTag: deleteTagOk.status,
      deleteTagMissing: 404,
      deleteRelation: relationDeleteOk.status,
      deleteRelationWithTags: 409,
      deleteSubSystem: subDeleteOk.status,
      deleteSubSystemRelated: 409,
      deleteSystem: systemDeleteOk.status,
      deleteSystemWithRelations: 409,
      deleteSystemWithGroupMember: 409,
      deleteMissingSystem: 404,
    }));

    console.log("phase2d-delete.integration: OK");
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
  console.error("phase2d-delete.integration: FAILED", error);
  process.exit(1);
});
