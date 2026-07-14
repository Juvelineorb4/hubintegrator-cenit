import assert from "node:assert/strict";
import express from "express";

import { db } from "../core/db/drizzle/client";
import { appRouter } from "../app.routes";
import { and, eq } from "drizzle-orm";
import { phdSubsystem, phdSystemSubsystem } from "../core/db/drizzle/schema/phd.schema";

type ApiListResponse<T> = {
  success: boolean;
  data: T[];
  total: number;
};

type SystemRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  distance: string | null;
  type: string | null;
  createdAt: string;
  updatedAt: string;
};

type SubSystemRelationRow = {
  systemId: string;
  systemCode: string;
  systemName: string;
  subSystemId: string;
  subSystemCode: string;
  subSystemName: string;
  nomenclature: string | null;
  displayOrder: number;
};

type TagRow = {
  id: string;
  tagname: string;
  description: string | null;
  category: string;
  phdTagno: string | null;
  phdUnit: string | null;
  phdDataTypeName: string | null;
  phdAssetName: string | null;
  phdDescription: string | null;
  systemId: string;
  systemName: string;
  systemCode: string;
  subSystemId: string;
  subSystemName: string;
  subSystemCode: string;
};

const BASE_URL = "http://127.0.0.1";

function assertUniqueTagname(rows: TagRow[], label: string) {
  const names = rows.map((row) => row.tagname);
  const unique = new Set(names);
  assert.equal(unique.size, names.length, `${label}: duplicate rows by tagname`);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  assert.equal(response.status, 200, `Expected 200 for ${url}`);
  return response.json() as Promise<T>;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  let tempSubsystemId: string | null = null;

  const app = express();
  app.use(express.json());
  app.use("/api", appRouter);

  const server = await new Promise<import("http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }

  const baseUrl = `${BASE_URL}:${address.port}/api`;

  try {
    const systemsResponse = await getJson<ApiListResponse<SystemRow>>(`${baseUrl}/systems`);
    assert.equal(systemsResponse.success, true);
    assert.ok(Array.isArray(systemsResponse.data));
    assert.ok(systemsResponse.data.some((row) => row.code === "11"));
    assert.ok(systemsResponse.data.some((row) => row.code === "22"));

    const system11 = systemsResponse.data.find((row) => row.code === "11");
    assert.ok(system11, "Seed system 11 not found");

    const tempSubsystemCode = "TMP_NO_TAGS";
    const tempSubsystemName = "Tmp no tags";
    const [insertedSubsystem] = await db
      .insert(phdSubsystem)
      .values({
        code: tempSubsystemCode,
        name: tempSubsystemName,
        nomenclature: tempSubsystemCode,
        description: "Temporary subsystem for phase2a integration test",
      })
      .onConflictDoUpdate({
        target: phdSubsystem.code,
        set: {
          name: tempSubsystemName,
          nomenclature: tempSubsystemCode,
          description: "Temporary subsystem for phase2a integration test",
          updatedAt: new Date(),
        },
      })
      .returning({ id: phdSubsystem.id });

    tempSubsystemId = insertedSubsystem.id;

    await db
      .insert(phdSystemSubsystem)
      .values({
        systemId: system11.id,
        subsystemId: tempSubsystemId,
        displayOrder: 99,
      })
      .onConflictDoUpdate({
        target: [phdSystemSubsystem.systemId, phdSystemSubsystem.subsystemId],
        set: {
          displayOrder: 99,
          updatedAt: new Date(),
        },
      });

    const subSystemsResponse = await getJson<ApiListResponse<SubSystemRelationRow>>(`${baseUrl}/sub-systems`);
    assert.equal(subSystemsResponse.success, true);

    const system11SubSystems = subSystemsResponse.data.filter((row) => row.systemCode === "11");
    assert.ok(system11SubSystems.some((row) => row.subSystemCode === "AYA"), "AYA must be linked to system 11");
    assert.ok(system11SubSystems.some((row) => row.subSystemCode === "COP"), "COP must be linked to system 11");
    assert.ok(system11SubSystems.some((row) => row.subSystemCode === tempSubsystemCode), "TMP_NO_TAGS must be linked");

    const system22SubSystems = subSystemsResponse.data.filter((row) => row.systemCode === "22");
    assert.equal(system22SubSystems.length, 0, "System 22 should have no subsystems in seed data");

    const pressureResponse = await getJson<ApiListResponse<TagRow>>(`${baseUrl}/tags/pressure?systemCode=11`);
    assert.equal(pressureResponse.success, true);
    assert.ok(pressureResponse.data.length > 0);
    assert.ok(pressureResponse.data.some((row) => row.category === "PRESSURE_OUT_MAX"));
    assertUniqueTagname(pressureResponse.data, "pressure");

    const flowResponse = await getJson<ApiListResponse<TagRow>>(`${baseUrl}/tags/flow?systemCode=11`);
    assert.equal(flowResponse.success, true);
    assert.ok(flowResponse.data.some((row) => row.category === "FLOW_IN"));
    assert.ok(flowResponse.data.some((row) => row.category === "FLOW_OUT"));
    assert.ok(flowResponse.data.some((row) => row.category === "SELECTOR_S_E"));
    assert.equal(
      flowResponse.data.some((row) => row.subSystemCode === tempSubsystemCode),
      false,
      "Subsystem without tags should not appear in flow tags"
    );
    assertUniqueTagname(flowResponse.data, "flow");

    const volumeResponse = await getJson<ApiListResponse<TagRow>>(`${baseUrl}/tags/volume?systemCode=11`);
    assert.equal(volumeResponse.success, true);
    assert.ok(volumeResponse.data.length > 0);
    assert.ok(volumeResponse.data.every((row) => row.category === "VOLUME"));
    assertUniqueTagname(volumeResponse.data, "volume");

    const missingSystemPressure = await getJson<ApiListResponse<TagRow>>(`${baseUrl}/tags/pressure?systemCode=DOES_NOT_EXIST`);
    assert.equal(missingSystemPressure.success, true);
    assert.equal(missingSystemPressure.data.length, 0);

    console.log("phase2a-read.integration: OK");
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

    if (tempSubsystemId) {
      await db
        .delete(phdSystemSubsystem)
        .where(and(eq(phdSystemSubsystem.subsystemId, tempSubsystemId), eq(phdSystemSubsystem.displayOrder, 99)));

      await db.delete(phdSubsystem).where(eq(phdSubsystem.id, tempSubsystemId));
    }
  }
}

run().catch((error) => {
  console.error("phase2a-read.integration: FAILED", error);
  process.exit(1);
});
