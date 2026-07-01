import { TagValueRepository, PressureHistorizedRow } from "./tag-value.repository";

export class TagValueService {
  constructor(private repo: TagValueRepository) {}

  getRaw(tagname: string, start: Date, end: Date) {
    return this.repo.findRawByTagname(tagname, start, end);
  }

  getRawBatch(
    tagnames: string[],
    start: Date,
    end: Date,
    limit: number = 50_000,
    offset: number = 0,
  ) {
    const clean = [...new Set(tagnames.map((t) => t.trim()).filter(Boolean))];

    if (start > end) {
      throw new Error("Invalid date range: start must be <= end");
    }

    if (clean.length === 0) {
      return Promise.resolve([]);
    }

    return this.repo.findRawByTagnames(clean, start, end, limit, offset);
  }

  getHistorizedBatch(
    tagnames: string[],
    start: Date,
    end: Date,
    intervalSeconds: number,
  ): Promise<PressureHistorizedRow[]> {
    const clean = [...new Set(tagnames.map((t) => t.trim()).filter(Boolean))];

    if (clean.length === 0) {
      throw new Error("'tagnames' must be a non-empty array");
    }
    if (intervalSeconds <= 0) {
      throw new Error("'intervalSeconds' must be greater than 0");
    }
    if (start > end) {
      throw new Error("Invalid date range: 'start' must be <= 'end'");
    }

    return this.repo.findHistorizedByTagnames(clean, start, end, intervalSeconds);
  }
}