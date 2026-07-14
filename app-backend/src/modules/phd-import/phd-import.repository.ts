import { and, eq, inArray } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemSubsystem,
  phdTag,
} from "../../core/db/drizzle/schema/phd.schema";
import { ImportSummary, NormalizedCatalogRow } from "./phd-import.types";

type EntityOp = "created" | "updated" | "skipped";

function applyCounter(counter: { created: number; updated: number; skipped: number }, op: EntityOp) {
  counter[op] += 1;
}

export class PhdImportRepository {
  async importCatalog(
    tx: DrizzleDB,
    rows: NormalizedCatalogRow[],
    dryRun: boolean
  ): Promise<ImportSummary> {
    const summary: ImportSummary = {
      dryRun,
      rowsProcessed: rows.length,
      systems: { created: 0, updated: 0, skipped: 0 },
      subsystems: { created: 0, updated: 0, skipped: 0 },
      relations: { created: 0, updated: 0, skipped: 0 },
      tags: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    const systemsByCode = new Map<string, NormalizedCatalogRow>();
    const subsystemsByCode = new Map<string, NormalizedCatalogRow>();
    const relationsByPair = new Map<string, { systemCode: string; subSystemCode: string; displayOrder: number | null }>();
    const tagsByName = new Map<string, NormalizedCatalogRow>();

    for (const row of rows) {
      if (!systemsByCode.has(row.systemCode)) {
        systemsByCode.set(row.systemCode, row);
      }
      if (!subsystemsByCode.has(row.subSystemCode)) {
        subsystemsByCode.set(row.subSystemCode, row);
      }

      const pairKey = `${row.systemCode}::${row.subSystemCode}`;
      const currentPair = relationsByPair.get(pairKey);
      if (!currentPair) {
        relationsByPair.set(pairKey, {
          systemCode: row.systemCode,
          subSystemCode: row.subSystemCode,
          displayOrder: row.displayOrder,
        });
      } else if (row.displayOrder !== null) {
        currentPair.displayOrder = row.displayOrder;
      }

      if (!tagsByName.has(row.tagname)) {
        tagsByName.set(row.tagname, row);
      }
    }

    const systemCodes = [...systemsByCode.keys()];
    const subSystemCodes = [...subsystemsByCode.keys()];
    const tagNames = [...tagsByName.keys()];

    const existingSystems = systemCodes.length
      ? await tx
          .select({
            id: phdSystemEntity.id,
            code: phdSystemEntity.code,
            name: phdSystemEntity.name,
            description: phdSystemEntity.description,
            distance: phdSystemEntity.distance,
            type: phdSystemEntity.type,
          })
          .from(phdSystemEntity)
          .where(inArray(phdSystemEntity.code, systemCodes))
      : [];

    const existingSubSystems = subSystemCodes.length
      ? await tx
          .select({
            id: phdSubsystem.id,
            code: phdSubsystem.code,
            name: phdSubsystem.name,
            description: phdSubsystem.description,
            nomenclature: phdSubsystem.nomenclature,
            latitude: phdSubsystem.latitude,
            longitude: phdSubsystem.longitude,
          })
          .from(phdSubsystem)
          .where(inArray(phdSubsystem.code, subSystemCodes))
      : [];

    const existingTags = tagNames.length
      ? await tx
          .select({
            id: phdTag.id,
            tagname: phdTag.tagname,
            description: phdTag.description,
            measurementType: phdTag.measurementType,
            role: phdTag.role,
            qualifier: phdTag.qualifier,
            phdTagNo: phdTag.phdTagNo,
            phdUnit: phdTag.phdUnit,
            phdDataType: phdTag.phdDataType,
            phdAssetName: phdTag.phdAssetName,
            phdDescription: phdTag.phdDescription,
            systemSubsystemId: phdTag.systemSubsystemId,
          })
          .from(phdTag)
          .where(inArray(phdTag.tagname, tagNames))
      : [];

    const systemIdByCode = new Map<string, string>();
    const existingSystemByCode = new Map(existingSystems.map((item) => [item.code, item]));

    for (const [code, row] of systemsByCode.entries()) {
      const existing = existingSystemByCode.get(code);
      if (!existing) {
        applyCounter(summary.systems, "created");
        if (!dryRun) {
          const [created] = await tx
            .insert(phdSystemEntity)
            .values({
              code,
              name: row.systemName,
              description: row.systemDescription,
              distance: row.distance,
              type: row.systemType,
            })
            .returning({ id: phdSystemEntity.id });
          systemIdByCode.set(code, created.id);
        } else {
          systemIdByCode.set(code, `dry-system-${code}`);
        }
        continue;
      }

      systemIdByCode.set(code, existing.id);

      const changed =
        existing.name !== row.systemName ||
        (existing.description ?? null) !== row.systemDescription ||
        (existing.distance ?? null) !== row.distance ||
        (existing.type ?? null) !== row.systemType;

      if (!changed) {
        applyCounter(summary.systems, "skipped");
        continue;
      }

      applyCounter(summary.systems, "updated");
      if (!dryRun) {
        await tx
          .update(phdSystemEntity)
          .set({
            name: row.systemName,
            description: row.systemDescription,
            distance: row.distance,
            type: row.systemType,
            updatedAt: new Date(),
          })
          .where(eq(phdSystemEntity.id, existing.id));
      }
    }

    const subSystemIdByCode = new Map<string, string>();
    const existingSubSystemByCode = new Map(existingSubSystems.map((item) => [item.code, item]));

    for (const [code, row] of subsystemsByCode.entries()) {
      const existing = existingSubSystemByCode.get(code);
      if (!existing) {
        applyCounter(summary.subsystems, "created");
        if (!dryRun) {
          const [created] = await tx
            .insert(phdSubsystem)
            .values({
              code,
              name: row.subSystemName,
              description: row.subSystemDescription,
              nomenclature: row.nomenclature,
              latitude: row.latitude,
              longitude: row.longitude,
            })
            .returning({ id: phdSubsystem.id });
          subSystemIdByCode.set(code, created.id);
        } else {
          subSystemIdByCode.set(code, `dry-subsystem-${code}`);
        }
        continue;
      }

      subSystemIdByCode.set(code, existing.id);

      const changed =
        existing.name !== row.subSystemName ||
        (existing.description ?? null) !== row.subSystemDescription ||
        (existing.nomenclature ?? null) !== row.nomenclature ||
        (existing.latitude ?? null) !== row.latitude ||
        (existing.longitude ?? null) !== row.longitude;

      if (!changed) {
        applyCounter(summary.subsystems, "skipped");
        continue;
      }

      applyCounter(summary.subsystems, "updated");
      if (!dryRun) {
        await tx
          .update(phdSubsystem)
          .set({
            name: row.subSystemName,
            description: row.subSystemDescription,
            nomenclature: row.nomenclature,
            latitude: row.latitude,
            longitude: row.longitude,
            updatedAt: new Date(),
          })
          .where(eq(phdSubsystem.id, existing.id));
      }
    }

    const relationPairs = [...relationsByPair.values()]
      .map((pair) => {
        const systemId = systemIdByCode.get(pair.systemCode);
        const subSystemId = subSystemIdByCode.get(pair.subSystemCode);
        if (!systemId || !subSystemId) {
          return null;
        }
        return { pairKey: `${pair.systemCode}::${pair.subSystemCode}`, systemId, subSystemId, displayOrder: pair.displayOrder };
      })
      .filter((value): value is { pairKey: string; systemId: string; subSystemId: string; displayOrder: number | null } => value !== null);

    const realSystemIds = [...new Set(relationPairs.map((item) => item.systemId).filter((id) => !id.startsWith("dry-system-")))];
    const realSubSystemIds = [...new Set(relationPairs.map((item) => item.subSystemId).filter((id) => !id.startsWith("dry-subsystem-")))];

    const existingRelations = realSystemIds.length && realSubSystemIds.length
      ? await tx
          .select({
            id: phdSystemSubsystem.id,
            systemId: phdSystemSubsystem.systemId,
            subSystemId: phdSystemSubsystem.subsystemId,
            displayOrder: phdSystemSubsystem.displayOrder,
          })
          .from(phdSystemSubsystem)
          .where(
            and(
              inArray(phdSystemSubsystem.systemId, realSystemIds),
              inArray(phdSystemSubsystem.subsystemId, realSubSystemIds)
            )
          )
      : [];

    const relationByPair = new Map(existingRelations.map((item) => [`${item.systemId}::${item.subSystemId}`, item]));
    const relationIdByPairCode = new Map<string, string>();

    const maxDisplayBySystem = new Map<string, number>();

    for (const relation of relationPairs) {
      const relationKey = `${relation.systemId}::${relation.subSystemId}`;
      const existing = relationByPair.get(relationKey);

      if (!existing) {
        applyCounter(summary.relations, "created");

        const baseMax = maxDisplayBySystem.get(relation.systemId) ?? 0;
        const effectiveDisplay = relation.displayOrder ?? baseMax + 1;
        maxDisplayBySystem.set(relation.systemId, Math.max(baseMax, effectiveDisplay));

        if (!dryRun) {
          const [created] = await tx
            .insert(phdSystemSubsystem)
            .values({
              systemId: relation.systemId,
              subsystemId: relation.subSystemId,
              displayOrder: effectiveDisplay,
            })
            .returning({ id: phdSystemSubsystem.id });
          relationIdByPairCode.set(relation.pairKey, created.id);
        } else {
          relationIdByPairCode.set(relation.pairKey, `dry-relation-${relation.pairKey}`);
        }
        continue;
      }

      relationIdByPairCode.set(relation.pairKey, existing.id);

      const changed = relation.displayOrder !== null && relation.displayOrder !== existing.displayOrder;
      if (!changed) {
        applyCounter(summary.relations, "skipped");
        continue;
      }

      applyCounter(summary.relations, "updated");
      if (!dryRun) {
        await tx
          .update(phdSystemSubsystem)
          .set({
            displayOrder: relation.displayOrder as number,
            updatedAt: new Date(),
          })
          .where(eq(phdSystemSubsystem.id, existing.id));
      }
    }

    const existingTagByName = new Map(existingTags.map((item) => [item.tagname, item]));

    for (const [tagname, row] of tagsByName.entries()) {
      const relationPairCode = `${row.systemCode}::${row.subSystemCode}`;
      const relationId = relationIdByPairCode.get(relationPairCode);
      if (!relationId) {
        continue;
      }

      const existing = existingTagByName.get(tagname);
      if (!existing) {
        applyCounter(summary.tags, "created");

        if (!dryRun) {
          await tx.insert(phdTag).values({
            tagname,
            description: row.description,
            measurementType: row.measurementType,
            role: row.role,
            qualifier: row.qualifier,
            phdTagNo: row.phdTagno,
            phdUnit: row.phdUnit,
            phdDataType: row.phdDataTypeName,
            phdAssetName: row.phdAssetName,
            phdDescription: row.phdDescription,
            systemSubsystemId: relationId,
          });
        }
        continue;
      }

      const changed =
        (existing.description ?? null) !== row.description ||
        existing.measurementType !== row.measurementType ||
        existing.role !== row.role ||
        existing.qualifier !== row.qualifier ||
        existing.phdTagNo !== row.phdTagno ||
        (existing.phdUnit ?? null) !== row.phdUnit ||
        existing.phdDataType !== row.phdDataTypeName ||
        (existing.phdAssetName ?? null) !== row.phdAssetName ||
        (existing.phdDescription ?? null) !== row.phdDescription ||
        existing.systemSubsystemId !== relationId;

      if (!changed) {
        applyCounter(summary.tags, "skipped");
        continue;
      }

      applyCounter(summary.tags, "updated");
      if (!dryRun) {
        await tx
          .update(phdTag)
          .set({
            description: row.description,
            measurementType: row.measurementType,
            role: row.role,
            qualifier: row.qualifier,
            phdTagNo: row.phdTagno,
            phdUnit: row.phdUnit,
            phdDataType: row.phdDataTypeName,
            phdAssetName: row.phdAssetName,
            phdDescription: row.phdDescription,
            systemSubsystemId: relationId,
            updatedAt: new Date(),
          })
          .where(eq(phdTag.id, existing.id));
      }
    }

    return summary;
  }
}
