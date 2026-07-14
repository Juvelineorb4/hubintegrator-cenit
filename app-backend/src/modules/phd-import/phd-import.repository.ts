import { and, eq, inArray } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import {
  phdSubsystem,
  phdSystemEntity,
  phdSystemGroup,
  phdSystemGroupMember,
  phdSystemSubsystem,
  phdTag,
} from "../../core/db/drizzle/schema/phd.schema";
import {
  ImportSummary,
  ImportValidationError,
  NormalizedCatalogRow,
  NormalizedSystemGroupRow,
  NormalizedWorkbook,
  ValidationIssue,
} from "./phd-import.types";

type EntityOp = "created" | "updated" | "skipped";

function applyCounter(counter: { created: number; updated: number; skipped: number }, op: EntityOp) {
  counter[op] += 1;
}

export class PhdImportRepository {
  async importCatalog(
    tx: DrizzleDB,
    workbook: NormalizedWorkbook,
    dryRun: boolean
  ): Promise<ImportSummary> {
    const rows = workbook.catalogRows;
    const systemGroupRows = workbook.systemGroupRows;

    const summary: ImportSummary = {
      dryRun,
      rowsProcessed: rows.length + systemGroupRows.length,
      systems: { created: 0, updated: 0, skipped: 0 },
      subsystems: { created: 0, updated: 0, skipped: 0 },
      relations: { created: 0, updated: 0, skipped: 0 },
      tags: { created: 0, updated: 0, skipped: 0 },
      groups: { created: 0, updated: 0, skipped: 0 },
      groupMembers: { created: 0, updated: 0, skipped: 0 },
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

    const groupSystemCodes = [...new Set(systemGroupRows.map((row) => row.systemCode))];
    const systemCodes = [...new Set([...systemsByCode.keys(), ...groupSystemCodes])];
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

    const groupDefinitionsByName = new Map<string, NormalizedSystemGroupRow>();
    for (const row of systemGroupRows) {
      if (!groupDefinitionsByName.has(row.groupName)) {
        groupDefinitionsByName.set(row.groupName, row);
      }
    }

    const groupNames = [...groupDefinitionsByName.keys()];
    const existingGroups = groupNames.length
      ? await tx
          .select({
            id: phdSystemGroup.id,
            name: phdSystemGroup.name,
            description: phdSystemGroup.description,
            displayOrder: phdSystemGroup.displayOrder,
          })
          .from(phdSystemGroup)
          .where(inArray(phdSystemGroup.name, groupNames))
      : [];

    const existingGroupByName = new Map(existingGroups.map((group) => [group.name, group]));

    const existingGroupMembers = existingGroups.length
      ? await tx
          .select({
            groupId: phdSystemGroupMember.systemGroupId,
            systemCode: phdSystemEntity.code,
            displayOrder: phdSystemGroupMember.displayOrder,
          })
          .from(phdSystemGroupMember)
          .innerJoin(phdSystemEntity, eq(phdSystemGroupMember.systemId, phdSystemEntity.id))
          .where(inArray(phdSystemGroupMember.systemGroupId, existingGroups.map((group) => group.id)))
      : [];

    const validationErrors: ValidationIssue[] = [];

    if (workbook.hasSystemGroupsSheet) {
      const availableSystemCodes = new Set<string>([...existingSystems.map((item) => item.code), ...systemsByCode.keys()]);
      for (const row of systemGroupRows) {
        if (!availableSystemCodes.has(row.systemCode)) {
          validationErrors.push({
            sheet: "system_groups",
            row: row.rowNumber,
            field: "systemCode",
            value: row.systemCode,
            reason: "System not found",
          });
        }
      }

      const membersByGroupName = new Map<string, NormalizedSystemGroupRow[]>();
      for (const row of systemGroupRows) {
        const bucket = membersByGroupName.get(row.groupName);
        if (bucket) {
          bucket.push(row);
        } else {
          membersByGroupName.set(row.groupName, [row]);
        }
      }

      const existingMembersByGroupName = new Map<string, Array<{ systemCode: string; displayOrder: number }>>();
      const groupNameById = new Map(existingGroups.map((group) => [group.id, group.name]));
      for (const member of existingGroupMembers) {
        const groupName = groupNameById.get(member.groupId);
        if (!groupName) {
          continue;
        }
        const bucket = existingMembersByGroupName.get(groupName);
        if (bucket) {
          bucket.push({ systemCode: member.systemCode, displayOrder: member.displayOrder });
        } else {
          existingMembersByGroupName.set(groupName, [{ systemCode: member.systemCode, displayOrder: member.displayOrder }]);
        }
      }

      for (const [groupName, groupRows] of membersByGroupName.entries()) {
        const existing = existingMembersByGroupName.get(groupName) ?? [];
        const desiredDisplayBySystemCode = new Map<string, number>();
        for (const member of existing) {
          desiredDisplayBySystemCode.set(member.systemCode, member.displayOrder);
        }
        for (const row of groupRows) {
          desiredDisplayBySystemCode.set(row.systemCode, row.systemDisplayOrder);
        }

        const occupancy = new Map<number, string>();
        for (const [systemCode, displayOrder] of desiredDisplayBySystemCode.entries()) {
          const occupiedBy = occupancy.get(displayOrder);
          if (!occupiedBy) {
            occupancy.set(displayOrder, systemCode);
            continue;
          }
          if (occupiedBy !== systemCode) {
            const culprit = groupRows.find(
              (row) => row.systemCode === systemCode && row.systemDisplayOrder === displayOrder
            );
            validationErrors.push({
              sheet: "system_groups",
              row: culprit?.rowNumber ?? groupRows[0].rowNumber,
              field: "systemDisplayOrder",
              value: String(displayOrder),
              reason: "Display order already used in group",
            });
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new ImportValidationError(validationErrors);
    }

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
          const nextPhdTagNo = row.hasExplicitPhdTagno ? row.phdTagno : null;
          const nextPhdUnit = row.hasExplicitPhdUnit ? row.phdUnit : null;
          const nextPhdDataType = row.hasExplicitPhdDataTypeName ? row.phdDataTypeName : null;
          const nextPhdAssetName = row.hasExplicitPhdAssetName ? row.phdAssetName : null;
          const nextPhdDescription = row.hasExplicitPhdDescription ? row.phdDescription : null;

          await tx.insert(phdTag).values({
            tagname,
            description: row.description,
            measurementType: row.measurementType,
            role: row.role,
            qualifier: row.qualifier,
            phdTagNo: nextPhdTagNo,
            phdUnit: nextPhdUnit,
            phdDataType: nextPhdDataType,
            phdAssetName: nextPhdAssetName,
            phdDescription: nextPhdDescription,
            systemSubsystemId: relationId,
          });
        }
        continue;
      }

      const nextPhdTagNo = row.hasExplicitPhdTagno ? row.phdTagno : (existing.phdTagNo ?? null);
      const nextPhdUnit = row.hasExplicitPhdUnit ? row.phdUnit : (existing.phdUnit ?? null);
      const nextPhdDataType = row.hasExplicitPhdDataTypeName ? row.phdDataTypeName : (existing.phdDataType ?? null);
      const nextPhdAssetName = row.hasExplicitPhdAssetName ? row.phdAssetName : (existing.phdAssetName ?? null);
      const nextPhdDescription = row.hasExplicitPhdDescription ? row.phdDescription : (existing.phdDescription ?? null);

      const changed =
        (existing.description ?? null) !== row.description ||
        existing.measurementType !== row.measurementType ||
        existing.role !== row.role ||
        existing.qualifier !== row.qualifier ||
        (existing.phdTagNo ?? null) !== nextPhdTagNo ||
        (existing.phdUnit ?? null) !== nextPhdUnit ||
        (existing.phdDataType ?? null) !== nextPhdDataType ||
        (existing.phdAssetName ?? null) !== nextPhdAssetName ||
        (existing.phdDescription ?? null) !== nextPhdDescription ||
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
            phdTagNo: nextPhdTagNo,
            phdUnit: nextPhdUnit,
            phdDataType: nextPhdDataType,
            phdAssetName: nextPhdAssetName,
            phdDescription: nextPhdDescription,
            systemSubsystemId: relationId,
            updatedAt: new Date(),
          })
          .where(eq(phdTag.id, existing.id));
      }
    }

    const groupIdByName = new Map<string, string>();
    for (const [groupName, row] of groupDefinitionsByName.entries()) {
      const existing = existingGroupByName.get(groupName);
      if (!existing) {
        applyCounter(summary.groups, "created");
        if (!dryRun) {
          const [created] = await tx
            .insert(phdSystemGroup)
            .values({
              name: row.groupName,
              description: row.groupDescription,
              displayOrder: row.groupDisplayOrder,
            })
            .returning({ id: phdSystemGroup.id });
          groupIdByName.set(groupName, created.id);
        } else {
          groupIdByName.set(groupName, `dry-group-${groupName}`);
        }
        continue;
      }

      groupIdByName.set(groupName, existing.id);

      const nextDescription = row.groupDescription ?? existing.description;
      const changed = existing.displayOrder !== row.groupDisplayOrder || (existing.description ?? null) !== (nextDescription ?? null);
      if (!changed) {
        applyCounter(summary.groups, "skipped");
        continue;
      }

      applyCounter(summary.groups, "updated");
      if (!dryRun) {
        await tx
          .update(phdSystemGroup)
          .set({
            description: nextDescription,
            displayOrder: row.groupDisplayOrder,
            updatedAt: new Date(),
          })
          .where(eq(phdSystemGroup.id, existing.id));
      }
    }

    const memberRowsByPair = new Map<string, NormalizedSystemGroupRow>();
    for (const row of systemGroupRows) {
      memberRowsByPair.set(`${row.groupName}::${row.systemCode}`, row);
    }

    const systemCodeToId = new Map<string, string>();
    for (const system of existingSystems) {
      systemCodeToId.set(system.code, system.id);
    }
    for (const [code, id] of systemIdByCode.entries()) {
      systemCodeToId.set(code, id);
    }

    const realGroupIds = [...new Set([...groupIdByName.values()].filter((id) => !id.startsWith("dry-group-")))];
    const realSystemIdsForMembers = [...new Set([...systemCodeToId.values()].filter((id) => !id.startsWith("dry-system-")))];

    const existingMembersForImport = realGroupIds.length && realSystemIdsForMembers.length
      ? await tx
          .select({
            id: phdSystemGroupMember.id,
            groupId: phdSystemGroupMember.systemGroupId,
            systemId: phdSystemGroupMember.systemId,
            displayOrder: phdSystemGroupMember.displayOrder,
          })
          .from(phdSystemGroupMember)
          .where(
            and(
              inArray(phdSystemGroupMember.systemGroupId, realGroupIds),
              inArray(phdSystemGroupMember.systemId, realSystemIdsForMembers)
            )
          )
      : [];

    const existingMemberByPair = new Map<string, { id: string; displayOrder: number }>();
    for (const row of existingMembersForImport) {
      existingMemberByPair.set(`${row.groupId}::${row.systemId}`, { id: row.id, displayOrder: row.displayOrder });
    }

    const pendingMemberInserts: Array<{ groupId: string; systemId: string; displayOrder: number }> = [];
    const pendingMemberUpdates: Array<{ id: string; groupId: string; displayOrder: number }> = [];

    for (const row of memberRowsByPair.values()) {
      const groupId = groupIdByName.get(row.groupName);
      const systemId = systemCodeToId.get(row.systemCode);
      if (!groupId || !systemId) {
        continue;
      }

      const pairKey = `${groupId}::${systemId}`;
      const existing = existingMemberByPair.get(pairKey);
      if (!existing) {
        applyCounter(summary.groupMembers, "created");
        pendingMemberInserts.push({ groupId, systemId, displayOrder: row.systemDisplayOrder });
        continue;
      }

      if (existing.displayOrder === row.systemDisplayOrder) {
        applyCounter(summary.groupMembers, "skipped");
        continue;
      }

      applyCounter(summary.groupMembers, "updated");
      pendingMemberUpdates.push({ id: existing.id, groupId, displayOrder: row.systemDisplayOrder });
    }

    if (!dryRun) {
      for (const insertRow of pendingMemberInserts) {
        await tx.insert(phdSystemGroupMember).values({
          systemGroupId: insertRow.groupId,
          systemId: insertRow.systemId,
          displayOrder: insertRow.displayOrder,
        });
      }

      // Use temporary unique negative values first to avoid transient unique collisions when swapping display orders.
      let tempDisplayOrder = -1;
      for (const updateRow of pendingMemberUpdates) {
        await tx
          .update(phdSystemGroupMember)
          .set({
            displayOrder: tempDisplayOrder,
            updatedAt: new Date(),
          })
          .where(eq(phdSystemGroupMember.id, updateRow.id));
        tempDisplayOrder -= 1;
      }

      for (const updateRow of pendingMemberUpdates) {
        await tx
          .update(phdSystemGroupMember)
          .set({
            displayOrder: updateRow.displayOrder,
            updatedAt: new Date(),
          })
          .where(eq(phdSystemGroupMember.id, updateRow.id));
      }
    }

    return summary;
  }
}
