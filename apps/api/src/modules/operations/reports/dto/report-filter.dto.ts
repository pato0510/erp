/* OPS-031 — DTOs for the report filter endpoints. Permissive on
   purpose: every filter is optional and we trust the controller to
   strip unknowns before passing through. */

export interface AssetComplianceFilters {
  assetTypeId?: string;
  locationId?: string;
  status?: string;
  blockedOnly?: boolean;
  includeDeprecated?: boolean;
}

export interface ActivityFilters {
  startDate: string;
  endDate: string;
  /* When set, restricts the activity stream to only the listed
     subsystems. Unknown values are dropped. */
  activityTypes?: Array<
    'document' | 'alert' | 'asset-status' | 'work-permit' | 'procedure' | 'exception'
  >;
}

export interface AcknowledgmentCoverageFilters {
  procedureId?: string;
  category?: string;
  includeExempted?: boolean;
}

export interface AlertsHistoryFilters {
  startDate: string;
  endDate: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';
  status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED' | 'DISMISSED';
  assetId?: string;
}

export interface WorkPermitsFilters {
  startDate: string;
  endDate: string;
  status?: string;
  supervisorId?: string;
  permitTypeId?: string;
}

export type AnyReportFilters =
  | AssetComplianceFilters
  | ActivityFilters
  | AcknowledgmentCoverageFilters
  | AlertsHistoryFilters
  | WorkPermitsFilters;
