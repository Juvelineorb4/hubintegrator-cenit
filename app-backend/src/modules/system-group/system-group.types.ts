export type SystemGroupListItem = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SystemGroupMemberItem = {
  id: string;
  systemGroupId: string;
  systemId: string;
  systemName: string;
  systemCode: string;
  systemType: "OIL_PIPELINE" | "PRODUCT_PIPELINE" | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SystemGroupDetail = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  members: SystemGroupMemberItem[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSystemGroupInput = {
  name: string;
  description?: string | null;
  displayOrder: number;
};

export type CreateSystemGroupMemberInput = {
  systemId: string;
  displayOrder: number;
};

export type UpdateSystemGroupInput = {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  id?: never;
};

export type UpdateSystemGroupMemberInput = {
  systemId?: string;
  displayOrder?: number;
  groupId?: never;
  memberId?: never;
};

export type SystemGroupSummaryItem = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
};
