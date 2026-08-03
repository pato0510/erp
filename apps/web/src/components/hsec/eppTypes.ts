/* HSEC-009 — shared types for the EPP UI (the incidentTypes/trainingTypes sibling). The
 * date-trap-safe formatter and file-size helper are REUSED from incidentTypes.ts. */

export interface EppItem {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/* The SHAPED deliveries list row (HSEC-008: fullName leaf-resolved, linesCount folded,
 * no blob). */
export interface EppDeliveryListRow {
  id: string;
  employeeId: string;
  date: string; // @db.Date UTC-midnight ISO — render ONLY via formatDbDate
  notes: string | null;
  fileName: string | null; // acuse indicator: non-null = has file
  fileSize: number | null;
  createdAt: string;
  fullName: string | null;
  linesCount: number;
}

export interface EppDeliveryLine {
  id: string;
  eppItemId: string;
  itemName: string;
  itemActive: boolean;
  quantity: number;
  size: string | null;
}

/* The SHAPED detail (hasFile derived server-side; lines carry the item name). */
export interface EppDeliveryDetail {
  id: string;
  employeeId: string;
  date: string;
  notes: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  hasFile: boolean;
  fullName: string | null;
  lines: EppDeliveryLine[];
  createdAt: string;
}
