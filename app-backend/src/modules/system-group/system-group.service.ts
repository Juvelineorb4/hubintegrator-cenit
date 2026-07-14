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
}
