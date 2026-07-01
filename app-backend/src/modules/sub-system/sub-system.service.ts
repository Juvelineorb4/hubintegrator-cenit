import { SubSystemRepository } from "./sub-system.repository";

export class SubSystemService {
  constructor(private repo: SubSystemRepository) {}

  getAll() {
    return this.repo.findAll();
  }

  getById(id: string) {
    return this.repo.findById(id);
  }

  getByNomenclature(nomenclature: string) {
    return this.repo.findByNomenclature(nomenclature);
  }

  create(data: Parameters<SubSystemRepository["create"]>[0]) {
    return this.repo.create(data);
  }

  createRelation(data: Parameters<SubSystemRepository["createRelation"]>[0]) {
    return this.repo.createRelation(data);
  }
}
