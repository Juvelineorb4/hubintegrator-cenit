import { SystemRepository } from "./system.repository";

export class SystemService {
  constructor(private repo: SystemRepository) {}

  getAll() {
    return this.repo.findAll();
  }

  getById(id: string) {
    return this.repo.findById(id);
  }

  getByName(name: string) {
    return this.repo.findByName(name);
  }

  create(data: Parameters<SystemRepository["create"]>[0]) {
    return this.repo.create(data);
  }

  updateById(id: string, data: Parameters<SystemRepository["updateById"]>[1]) {
    return this.repo.updateById(id, data);
  }
}
