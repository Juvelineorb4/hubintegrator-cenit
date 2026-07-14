import { SystemGroupRepository } from "./system-group.repository";

export class SystemGroupService {
  constructor(private repo: SystemGroupRepository) {}

  getAll() {
    return this.repo.findAll();
  }

  getById(id: string) {
    return this.repo.findById(id);
  }

  getMembers(id: string) {
    return this.repo.findMembersByGroupId(id);
  }

  create(data: Parameters<SystemGroupRepository["create"]>[0]) {
    return this.repo.create(data);
  }

  createMember(groupId: string, data: Parameters<SystemGroupRepository["createMember"]>[1]) {
    return this.repo.createMember(groupId, data);
  }

  updateById(groupId: string, data: Parameters<SystemGroupRepository["updateById"]>[1]) {
    return this.repo.updateById(groupId, data);
  }

  updateMemberById(
    groupId: string,
    memberId: string,
    data: Parameters<SystemGroupRepository["updateMemberById"]>[2]
  ) {
    return this.repo.updateMemberById(groupId, memberId, data);
  }

  deleteMemberById(groupId: string, memberId: string) {
    return this.repo.deleteMemberById(groupId, memberId);
  }

  deleteById(groupId: string) {
    return this.repo.deleteById(groupId);
  }
}
