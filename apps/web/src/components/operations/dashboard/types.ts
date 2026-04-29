/* OPS-029 — view-models mirroring the dashboard aggregator API.
   Kept loose (non-discriminated) on purpose: the component layer
   wants ergonomic rendering, not strict parsing. */

export interface DashboardOverview {
  operationalHealth: {
    totalActiveAssets: number;
    operationalAssets: number;
    blockedAssets: number;
    withObservations: number;
    inMaintenance: number;
    outOfService: number;
    operationalPercentage: number;
  };
  documentCompliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    compliancePercentage: number;
    criticalIssues: number;
  };
  permitCompliance: {
    activeExternalPermits: number;
    validExternalPermits: number;
    expiringExternalPermits: number;
    expiredExternalPermits: number;
    compliancePercentage: number;
  };
  workPermits: {
    inExecution: number;
    pendingAuthorization: number;
    authorizedToday: number;
    closedToday: number;
  };
  procedures: {
    published: number;
    pendingMyAck: number;
    coveragePercentage: number;
  };
  alerts: {
    total: number;
    critical: number;
    blocking: number;
    unattended: number;
    escalated: number;
  };
  exceptions: {
    activeCount: number;
    pendingApproval: number;
    expiringSoon: number;
  };
  approvals: {
    myPending: number;
    totalPending: number;
  };
  generatedAt: string;
}

export interface AssetRef {
  id: string;
  code: string;
  name: string;
}

export interface DashboardActionItems {
  blockedAssets: Array<{
    assetId: string;
    code: string;
    name: string;
    blockedSince: string | null;
    blockingDocuments: Array<{ id: string; code: string; name: string }>;
  }>;
  criticalUnattendedAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    triggeredAt: string;
    asset: AssetRef | null;
  }>;
  expiredWorkPermits: Array<{
    id: string;
    permitNumber: string;
    title: string;
    plannedEnd: string;
  }>;
  expiringExceptions: Array<{
    id: string;
    validUntil: string;
    asset: AssetRef | null;
  }>;
}

export interface UpcomingDocumentRow {
  documentRecordId: string;
  type: { id: string; name: string; code: string; color: string | null };
  asset: AssetRef | null;
  expirationDate: string;
  daysRemaining: number | null;
}

export interface UpcomingPermitRow {
  permitId: string;
  permitNumber: string;
  type: { id: string; name: string; code: string };
  target: { id: string; code: string; name: string } | null;
  expirationDate: string;
  daysRemaining: number | null;
}

export interface UpcomingWorkPermitRow {
  id: string;
  permitNumber: string;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
}

export interface UpcomingAcknowledgmentRow {
  procedureId: string;
  code: string;
  title: string;
  dueDate: string;
  daysRemaining: number | null;
}

export interface DashboardUpcomingEvents {
  documentsExpiring: UpcomingDocumentRow[];
  permitsExpiring: UpcomingPermitRow[];
  workPermitsScheduled: UpcomingWorkPermitRow[];
  pendingAcknowledgments: UpcomingAcknowledgmentRow[];
}

export interface DashboardAssetRiskRow {
  asset: {
    id: string;
    code: string;
    name: string;
    status: string;
    type: { id: string; name: string; category: string; color: string | null } | null;
  };
  score: number;
  issues: {
    criticalAlerts: number;
    missingDocs: number;
    expiredDocs: number;
    activeAlerts: number;
    expiring: number;
  };
}

export interface DashboardActivityEvent {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  linkPath: string;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
}

export interface DashboardMyTasks {
  myPendingAcknowledgments: number;
  myPendingApprovals: number;
  myAssignedAssets: { total: number; withIssues: number; blocked: number };
  myActiveWorkPermits: number;
  myUpcomingPermits: number;
}

export interface DashboardAssetDistribution {
  total: number;
  segments: Array<{ status: string; count: number; percentage: number }>;
}

export interface DashboardComplianceCategoryRow {
  key: string;
  label: string;
  compliancePercentage: number;
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  missing: number;
}

export type DashboardComplianceByCategory = DashboardComplianceCategoryRow[];

/* Threshold helpers — single source of truth for "what color is this
   percentage". Used by both the KpiCard and ComplianceBarChart so the
   dashboard reads consistently. */
export function thresholdColor(pct: number): string {
  if (pct >= 90) return '#15803d'; // green-700
  if (pct >= 70) return '#a16207'; // yellow-700
  if (pct >= 50) return '#c2410c'; // orange-700
  return '#b91c1c'; // red-700
}

export function thresholdBg(pct: number): string {
  if (pct >= 90) return 'rgba(34,197,94,0.12)';
  if (pct >= 70) return 'rgba(234,179,8,0.14)';
  if (pct >= 50) return 'rgba(249,115,22,0.14)';
  return 'rgba(239,68,68,0.14)';
}
