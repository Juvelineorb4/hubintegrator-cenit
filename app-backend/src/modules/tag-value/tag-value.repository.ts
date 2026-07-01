import { eq, and, gte, lte, asc, inArray, sql } from "drizzle-orm";
import { DrizzleDB } from "../../core/db/drizzle/client";
import { tagValue } from "../../core/db/drizzle/schema/tag-value.schema";
import { tag } from "../../core/db/drizzle/schema/tag.schema";

export interface PressureHistorizedRow extends Record<string, unknown> {
  tagname: string;
  timestamp: string;
  valueDouble: number | null;
  valueText: string | null;
  valueBoolean: boolean | null;
}

export class TagValueRepository {
  constructor(private db: DrizzleDB) { }

  findRawByTagname(tagname: string, start: Date, end: Date) {
    return this.db
      .select({
        timestamp: sql<string>`to_char(${tagValue.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        valueDouble: tagValue.valueDouble,
        valueText: tagValue.valueText,
        valueBoolean: tagValue.valueBoolean,
      })
      .from(tagValue)
      .innerJoin(tag, eq(tagValue.tagId, tag.id))
      .where(
        and(
          eq(tag.tagname, tagname),
          gte(tagValue.timestamp, start),
          lte(tagValue.timestamp, end)
        )
      )
      .orderBy(asc(tagValue.timestamp));
  }

  findRawByTagnames(
    tagnames: string[],
    start: Date,
    end: Date,
    limit: number = 50_000,
    offset: number = 0,
  ) {
    const cleanTagnames = [...new Set(tagnames.map(t => t.trim()).filter(Boolean))];

    if (cleanTagnames.length === 0) {
      return Promise.resolve([]);
    }

    return this.db
      .select({
        tagname: tag.tagname,
        timestamp: sql<string>`to_char(${tagValue.timestamp} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        valueDouble: tagValue.valueDouble,
        valueText: tagValue.valueText,
        valueBoolean: tagValue.valueBoolean,
      })
      .from(tagValue)
      .innerJoin(tag, eq(tagValue.tagId, tag.id))
      .where(
        and(
          inArray(tag.tagname, cleanTagnames),
          gte(tagValue.timestamp, start),
          lte(tagValue.timestamp, end)
        )
      )
      .orderBy(asc(tag.tagname), asc(tagValue.timestamp))
      .limit(limit)
      .offset(offset);
  }

  async findHistorizedByTagnames(
    tagnames: string[],
    start: Date,
    end: Date,
    intervalSeconds: number,
  ): Promise<PressureHistorizedRow[]> {
    const cleanTagnames = [...new Set(tagnames.map(t => t.trim()).filter(Boolean))];

    if (cleanTagnames.length === 0) {
      return [];
    }

    if (intervalSeconds <= 0) {
      return [];
    }

    if (start > end) {
      return [];
    }

    const qr = await this.db.execute<PressureHistorizedRow>(sql`
      WITH grid AS (
        SELECT generate_series(
          ${start}::timestamptz,
          ${end}::timestamptz,
          (${intervalSeconds}::int * INTERVAL '1 second')
        ) AS interval_ts
      ),
      requested_tags AS (
        SELECT
          t.id AS tag_id,
          t.tagname
        FROM tag t
        WHERE t.tagname IN (${sql.join(cleanTagnames.map(t => sql`${t}`), sql`, `)})
      )
      SELECT
        rt.tagname,
        to_char(g.interval_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "timestamp",
        latest.value_double  AS "valueDouble",
        latest.value_text    AS "valueText",
        latest.value_boolean AS "valueBoolean"
      FROM grid g
      CROSS JOIN requested_tags rt
      LEFT JOIN LATERAL (
        SELECT
          tv.value_double,
          tv.value_text,
          tv.value_boolean
        FROM tag_value tv
        WHERE tv.tag_id = rt.tag_id
          AND tv.timestamp <= g.interval_ts
        ORDER BY tv.timestamp DESC
        LIMIT 1
      ) latest ON true
      ORDER BY rt.tagname, g.interval_ts
    `);

    return qr.rows;
  }
}