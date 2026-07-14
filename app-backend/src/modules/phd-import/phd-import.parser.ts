import XLSX from "xlsx";
import { ParsedCatalogRow, ParsedWorkbook } from "./phd-import.types";

export class PhdImportParser {
  parseCatalogWorkbook(fileBuffer: Buffer): ParsedWorkbook {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets["catalog"];

    if (!sheet || !sheet["!ref"]) {
      return { headers: [], rows: [] };
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);

    const headers: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const value = sheet[addr]?.v;
      headers.push(typeof value === "string" ? value.trim() : String(value ?? "").trim());
    }

    const rows: ParsedCatalogRow[] = [];
    const normalizeCellValue = (value: unknown): unknown => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === "string" && !value.trim()) {
        return null;
      }
      return value;
    };

    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const raw: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        const addr = XLSX.utils.encode_cell({ r: row, c: range.s.c + index });
        raw[header] = normalizeCellValue(sheet[addr]?.v ?? null);
      });

      rows.push({ rowNumber: row + 1, raw });
    }

    return { headers, rows };
  }
}
