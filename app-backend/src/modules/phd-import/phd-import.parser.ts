import XLSX from "xlsx";
import { ParsedCatalogRow, ParsedSheet, ParsedSystemGroupRow, ParsedWorkbook } from "./phd-import.types";

export class PhdImportParser {
  parseCatalogWorkbook(fileBuffer: Buffer): ParsedWorkbook {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const parseSheet = <T>(
      name: string,
      createRow: (rowNumber: number, raw: Record<string, unknown>) => T
    ): ParsedSheet<T> => {
      const sheet = workbook.Sheets[name];
      if (!sheet) {
        return { present: false, headers: [], rows: [] };
      }

      if (!sheet["!ref"]) {
        return { present: true, headers: [], rows: [] };
      }

      const range = XLSX.utils.decode_range(sheet["!ref"]);

      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
        const value = sheet[addr]?.v;
        headers.push(typeof value === "string" ? value.trim() : String(value ?? "").trim());
      }

      const normalizeCellValue = (value: unknown): unknown => {
        if (value === null || value === undefined) {
          return null;
        }
        if (typeof value === "string" && !value.trim()) {
          return null;
        }
        return value;
      };

      const rows: T[] = [];
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const raw: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          if (!header) {
            return;
          }
          const addr = XLSX.utils.encode_cell({ r: row, c: range.s.c + index });
          raw[header] = normalizeCellValue(sheet[addr]?.v ?? null);
        });

        rows.push(createRow(row + 1, raw));
      }

      return { present: true, headers, rows };
    };

    return {
      catalog: parseSheet<ParsedCatalogRow>("catalog", (rowNumber, raw) => ({ rowNumber, raw })),
      systemGroups: parseSheet<ParsedSystemGroupRow>("system_groups", (rowNumber, raw) => ({ rowNumber, raw })),
    };
  }
}
