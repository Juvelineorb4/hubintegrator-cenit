import { TagRepository } from "./tag.repository";

export class TagService {
  constructor(private repo: TagRepository) { }

  getAll() {
    return this.repo.findAll();
  }

  getById(id: string) {
    return this.repo.findById(id);
  }

  getPressureBySystemCode(systemCode: string) {
    return this.repo.findPressureBySystemCode(systemCode);
  }
  getFlowBySystemCode(systemCode: string) {
    return this.repo.findFlowBySystemCode(systemCode);
  }
  getVolumeBySystemCode(systemCode: string) {
    return this.repo.findVolumeBySystemCode(systemCode);
  }

  create(data: Parameters<TagRepository["create"]>[0]) {
    return this.repo.create(data);
  }
}