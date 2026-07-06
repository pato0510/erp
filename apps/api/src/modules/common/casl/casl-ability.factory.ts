import { AbilityBuilder, createMongoAbility, MongoAbility, InferSubjects } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

type Subjects =
  | InferSubjects<
      | typeof UserSubject
      | typeof CompanySubject
      | typeof TenantSubject
      | typeof MovementSubject
      | typeof ReportSubject
      | typeof CategorySubject
      | typeof CounterpartySubject
      | typeof CostCenterSubject
      | typeof FiscalPeriodSubject
      | typeof OperationalAssetSubject
      | typeof LocationSubject
      | typeof AssetTypeSubject
      | typeof VehicleSubject
      | typeof DocumentTypeSubject
      | typeof DocumentRequirementSubject
      | typeof DocumentRecordSubject
      | typeof AlertRuleSubject
      | typeof AlertSettingsSubject
      | typeof AssetExceptionSubject
      | typeof PermitTypeSubject
      | typeof PermitSubject
      | typeof WorkPermitTypeSubject
      | typeof WorkPermitSubject
      | typeof PermitApprovalStepSubject
      | typeof PermitApprovalSubject
      | typeof ProcedureSubject
      | typeof ProcedureAcknowledgmentSubject
      | typeof DomainEventSubject
      | typeof CommitmentTemplateSubject
      | typeof OperationsDashboardSubject
      | typeof AuditPackageSubject
      | typeof EmployeeSubject
      | typeof EmployeeContractSubject
      | typeof EmployeeDocumentSubject
      | typeof CertificationSubject
      | typeof AvailabilitySubject
      | typeof VacationRequestSubject
      | typeof LeaveRequestSubject
      | typeof MedicalLeaveSubject
      | typeof SalaryRecordSubject
      | typeof TerminationSimulationSubject
      | typeof PayrollParameterSubject
      | typeof EmployeeCompensationSubject
      | typeof JobPositionSubject
      | typeof AccountSubject
      | typeof ContactSubject
      | typeof OpportunitySubject
      | typeof ActivitySubject
      | typeof ServiceCatalogSubject
      | typeof QuoteSubject
    >
  | 'all';

class UserSubject {
  static readonly modelName = 'User' as const;
}
class CompanySubject {
  static readonly modelName = 'Company' as const;
}
class TenantSubject {
  static readonly modelName = 'Tenant' as const;
}
class MovementSubject {
  static readonly modelName = 'Movement' as const;
}
class ReportSubject {
  static readonly modelName = 'Report' as const;
}
class CategorySubject {
  static readonly modelName = 'Category' as const;
}
class CounterpartySubject {
  static readonly modelName = 'Counterparty' as const;
}
class CostCenterSubject {
  static readonly modelName = 'CostCenter' as const;
}
class FiscalPeriodSubject {
  static readonly modelName = 'FiscalPeriod' as const;
}
class OperationalAssetSubject {
  static readonly modelName = 'OperationalAsset' as const;
}
class LocationSubject {
  static readonly modelName = 'Location' as const;
}
class AssetTypeSubject {
  static readonly modelName = 'AssetType' as const;
}
class VehicleSubject {
  static readonly modelName = 'Vehicle' as const;
}
class DocumentTypeSubject {
  static readonly modelName = 'DocumentType' as const;
}
class DocumentRequirementSubject {
  static readonly modelName = 'DocumentRequirement' as const;
}
class DocumentRecordSubject {
  static readonly modelName = 'DocumentRecord' as const;
}
class AlertRuleSubject {
  static readonly modelName = 'AlertRule' as const;
}
class AlertSettingsSubject {
  static readonly modelName = 'AlertSettings' as const;
}
class AssetExceptionSubject {
  static readonly modelName = 'AssetException' as const;
}
class PermitTypeSubject {
  static readonly modelName = 'PermitType' as const;
}
class PermitSubject {
  static readonly modelName = 'Permit' as const;
}
class WorkPermitTypeSubject {
  static readonly modelName = 'WorkPermitType' as const;
}
class WorkPermitSubject {
  static readonly modelName = 'WorkPermit' as const;
}
class PermitApprovalStepSubject {
  static readonly modelName = 'PermitApprovalStep' as const;
}
class PermitApprovalSubject {
  static readonly modelName = 'PermitApproval' as const;
}
class ProcedureSubject {
  static readonly modelName = 'Procedure' as const;
}
class ProcedureAcknowledgmentSubject {
  static readonly modelName = 'ProcedureAcknowledgment' as const;
}
/* OPS-032 — domain events audit subject. `read` is granted to
   ADMIN/MANAGER (covered by MANAGER's blanket `read all`); `manage`
   covers retry/test endpoints (ADMIN-only). */
class DomainEventSubject {
  static readonly modelName = 'DomainEvent' as const;
}
/* OPS-033 — cost templates that drive auto-commitment creation.
   ADMIN/MANAGER manage; everyone else read-only via blanket
   `read all`. */
class CommitmentTemplateSubject {
  static readonly modelName = 'CommitmentTemplate' as const;
}
/* OPS-034 — admin-only operations on the dashboard's materialized
   views (manual refresh). The dashboard endpoints themselves stay
   open to every authenticated role. Only `manage` is granted, and
   only ADMIN/SUPER_ADMIN have it via `manage all`. */
class OperationsDashboardSubject {
  static readonly modelName = 'OperationsDashboard' as const;
}
/* OPS-036 — packaged compliance evidence (audit packages).
   ADMIN + MANAGER can generate (create) and read; only ADMIN can
   delete. Reading the snapshot KPIs and listing previous packages
   piggybacks on `read all` for MANAGER. */
class AuditPackageSubject {
  static readonly modelName = 'AuditPackage' as const;
}

/* HR-001 — RRHH module subjects. Baseline role rules only (see
   defineAbilityFor): ADMIN/SUPER_ADMIN manage all (via `manage all`),
   MANAGER manages all RRHH subjects, ACCOUNTANT reads ONLY the
   compensation-facing subjects, and every other role gets NONE — the
   blanket `read all` that MANAGER/ACCOUNTANT/ANALYST carry is explicitly
   revoked on RRHH subjects so sensitive HR data (salaries, medical leave,
   PII) is not readable by default. Relationship-conditional rules
   (self-access, supervisor-approves) are DEFERRED to later RRHH tickets. */
class EmployeeSubject {
  static readonly modelName = 'Employee' as const;
}
class EmployeeContractSubject {
  static readonly modelName = 'EmployeeContract' as const;
}
class EmployeeDocumentSubject {
  static readonly modelName = 'EmployeeDocument' as const;
}
class CertificationSubject {
  static readonly modelName = 'Certification' as const;
}
class AvailabilitySubject {
  static readonly modelName = 'Availability' as const;
}
class VacationRequestSubject {
  static readonly modelName = 'VacationRequest' as const;
}
class LeaveRequestSubject {
  static readonly modelName = 'LeaveRequest' as const;
}
class MedicalLeaveSubject {
  static readonly modelName = 'MedicalLeave' as const;
}
class SalaryRecordSubject {
  static readonly modelName = 'SalaryRecord' as const;
}
class TerminationSimulationSubject {
  static readonly modelName = 'TerminationSimulation' as const;
}
class PayrollParameterSubject {
  static readonly modelName = 'PayrollParameter' as const;
}
class EmployeeCompensationSubject {
  static readonly modelName = 'EmployeeCompensation' as const;
}
/* HR-002 — cargos / perfiles de cargo. Baseline (via RRHH_SUBJECTS):
   MANAGER/ADMIN/SUPER_ADMIN manage; all other roles get none. */
class JobPositionSubject {
  static readonly modelName = 'JobPosition' as const;
}

/* COM-001 — Comercial (CRM) module subjects. Declared in the subjects union so
   later tickets (COM-002+) can gate their endpoints with @CheckPolicies. This
   ticket grants NO role any ability on them: a subject present in the union with
   no can()/cannot() rule grants nobody anything, so VIEWER/ANALYST/etc. gain no
   access from COM-001. Abilities are assigned per-entity as each COM ticket lands. */
class AccountSubject {
  static readonly modelName = 'Account' as const;
}
class ContactSubject {
  static readonly modelName = 'Contact' as const;
}
class OpportunitySubject {
  static readonly modelName = 'Opportunity' as const;
}
class ActivitySubject {
  static readonly modelName = 'Activity' as const;
}
class ServiceCatalogSubject {
  static readonly modelName = 'ServiceCatalog' as const;
}
class QuoteSubject {
  static readonly modelName = 'Quote' as const;
}

/* All RRHH subjects — granted/revoked in bulk by the baseline role rules. */
const RRHH_SUBJECTS = [
  EmployeeSubject,
  EmployeeContractSubject,
  EmployeeDocumentSubject,
  CertificationSubject,
  AvailabilitySubject,
  VacationRequestSubject,
  LeaveRequestSubject,
  MedicalLeaveSubject,
  SalaryRecordSubject,
  TerminationSimulationSubject,
  PayrollParameterSubject,
  EmployeeCompensationSubject,
  JobPositionSubject,
];
/* The compensation-facing subset ACCOUNTANT may read. */
const RRHH_COMPENSATION_SUBJECTS = [
  SalaryRecordSubject,
  TerminationSimulationSubject,
  EmployeeCompensationSubject,
];
/* COM-001 — all Comercial (CRM) subjects. Used to establish a default-deny READ
   floor (mirroring RRHH_SUBJECTS): the blanket-`read all` roles have their
   inherited Comercial read revoked in their branches below, so no role reads
   Comercial data until a later ticket grants it per-entity. */
const COMERCIAL_SUBJECTS = [
  AccountSubject,
  ContactSubject,
  OpportunitySubject,
  ActivitySubject,
  ServiceCatalogSubject,
  QuoteSubject,
];

/* `approve`/`reject`/`resubmit`/`supersede` are document-workflow specific
   actions. They ride on the same CASL action union so the policy decorator
   stays uniform. `manage` continues to imply all of them
   (ADMIN/SUPER_ADMIN). `force-unblock` is OPS-020's ADMIN-only override
   for taking an asset out of BLOCKED_DOCUMENTAL when docs are still
   pending — only `manage` grants it, so the spec's "ADMIN only" holds. */
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'reject'
  | 'resubmit'
  | 'supersede'
  | 'force-unblock'
  /* OPS-023 — exception lifecycle. Approve/reject reuse the union
     names but the AssetExceptionSubject scoping makes them distinct
     from the DocumentRecord workflow. `revoke` is exception-only. */
  | 'revoke'
  /* OPS-025 — work permit lifecycle. authorize/reject reuse the verbs
     used by document workflow but the subject scoping isolates them.
     start/suspend/resume/close/cancel are work-permit-specific. */
  | 'authorize'
  | 'start'
  | 'suspend'
  | 'resume'
  | 'close'
  | 'cancel'
  /* OPS-026 — multi-step approval. `skip` is ADMIN-only override
     to bypass an optional/blocked step with prominent audit. */
  | 'skip'
  /* OPS-027 — procedures lifecycle. `publish` is gated to
     ADMIN/MANAGER, `deprecate` to ADMIN. `review` is the
     verb that gates the approve/reject sub-actions on a
     procedure in IN_REVIEW status. */
  | 'publish'
  | 'deprecate'
  | 'review'
  /* OPS-028 — procedure acknowledgments. Any authenticated user
     can acknowledge their own pending readings (the service still
     scopes to userId so they can't ack someone else's). `exempt`
     is ADMIN-only. */
  | 'acknowledge'
  | 'exempt';
export type AppAbility = MongoAbility<[Action, Subjects]>;

export {
  UserSubject,
  CompanySubject,
  TenantSubject,
  MovementSubject,
  ReportSubject,
  CategorySubject,
  CounterpartySubject,
  CostCenterSubject,
  FiscalPeriodSubject,
  OperationalAssetSubject,
  LocationSubject,
  AssetTypeSubject,
  VehicleSubject,
  DocumentTypeSubject,
  DocumentRequirementSubject,
  DocumentRecordSubject,
  AlertRuleSubject,
  AlertSettingsSubject,
  AssetExceptionSubject,
  PermitTypeSubject,
  PermitSubject,
  WorkPermitTypeSubject,
  WorkPermitSubject,
  PermitApprovalStepSubject,
  PermitApprovalSubject,
  ProcedureSubject,
  ProcedureAcknowledgmentSubject,
  DomainEventSubject,
  CommitmentTemplateSubject,
  OperationsDashboardSubject,
  AuditPackageSubject,
  EmployeeSubject,
  EmployeeContractSubject,
  EmployeeDocumentSubject,
  CertificationSubject,
  AvailabilitySubject,
  VacationRequestSubject,
  LeaveRequestSubject,
  MedicalLeaveSubject,
  SalaryRecordSubject,
  TerminationSimulationSubject,
  PayrollParameterSubject,
  EmployeeCompensationSubject,
  JobPositionSubject,
  AccountSubject,
  ContactSubject,
  OpportunitySubject,
  ActivitySubject,
  ServiceCatalogSubject,
  QuoteSubject,
};

@Injectable()
export class CaslAbilityFactory {
  defineAbilityFor(role: UserRole): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (role) {
      case UserRole.SUPER_ADMIN:
        can('manage', 'all');
        break;

      case UserRole.ADMIN:
        can('manage', 'all');
        break;

      case UserRole.MANAGER:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        can(['create', 'update'], ReportSubject);
        can(['create', 'update'], CategorySubject);
        can(['create', 'update'], CounterpartySubject);
        can(['create', 'update'], CostCenterSubject);
        can(['create', 'update'], FiscalPeriodSubject);
        can(['create', 'update'], OperationalAssetSubject);
        can(['create', 'update'], LocationSubject);
        can(['create', 'update'], VehicleSubject);
        can(['create', 'update', 'delete'], DocumentTypeSubject);
        can(['create', 'update', 'delete'], DocumentRequirementSubject);
        /* DocumentRecord delete is ADMIN-only per OPS-014 — APPROVED records
           must be archived, not deleted, so MANAGER-driven workflows go
           through `update`/archive endpoints. Approval/rejection (OPS-015)
           is granted explicitly so MANAGER can clear the review queue. */
        can(
          ['create', 'update', 'approve', 'reject', 'resubmit', 'supersede'],
          DocumentRecordSubject,
        );
        /* OPS-018 — alert config: MANAGER + ADMIN can author rules and
           tweak the singleton settings row. Lower roles only read. */
        can(['create', 'update', 'delete'], AlertRuleSubject);
        /* OPS-033 — commitment templates that seed auto-generated
           cashflow commitments. MANAGER + ADMIN manage; lower roles
           inherit read via blanket `read all` above. */
        can('manage', CommitmentTemplateSubject);
        can(['update'], AlertSettingsSubject);
        /* OPS-023 — MANAGER can request an exception but cannot
           approve/reject/revoke it. Only ADMIN (via `manage 'all'`)
           gets the lifecycle verbs. */
        can('create', AssetExceptionSubject);
        /* OPS-024 — same shape as documents: MANAGER manages the
           catalog and individual permit rows + workflow actions; only
           ADMIN can outright delete an APPROVED permit (must archive). */
        can(['create', 'update', 'delete'], PermitTypeSubject);
        can(['create', 'update', 'approve', 'reject', 'resubmit', 'supersede'], PermitSubject);
        /* OPS-025 — MANAGER manages the work-permit catalog, can author
           and edit permits, and runs the full lifecycle (authorize, start,
           suspend, resume, close, cancel). Required-role guards are
           layered on top of this in the service. */
        can(['create', 'update', 'delete'], WorkPermitTypeSubject);
        can(
          [
            'create',
            'update',
            'authorize',
            'reject',
            'start',
            'suspend',
            'resume',
            'close',
            'cancel',
          ],
          WorkPermitSubject,
        );
        /* OPS-026 — MANAGER can author approval-chain templates and
           record per-step approvals. `skip` stays ADMIN-only. */
        can(['create', 'update', 'delete'], PermitApprovalStepSubject);
        can(['read', 'approve', 'reject'], PermitApprovalSubject);
        /* OPS-027 — MANAGER authors and publishes procedures.
           `deprecate` stays ADMIN-only via `manage 'all'`. */
        can(['create', 'update', 'review', 'publish'], ProcedureSubject);
        /* OPS-028 — MANAGER reads global ack coverage and can
           acknowledge their own readings. `exempt` stays
           ADMIN-only via `manage 'all'`. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        /* OPS-036 — MANAGER can generate audit packages (and
           read existing ones via blanket `read all`). `delete`
           stays ADMIN-only via `manage all`. */
        can('create', AuditPackageSubject);
        /* HR-001 — MANAGER fully manages all RRHH subjects. */
        RRHH_SUBJECTS.forEach((subject) => can('manage', subject));
        /* COM-001 — default-deny floor: revoke the inherited blanket `read all`
           on Comercial subjects; per-subject grants are added by each COM ticket. */
        COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject));
        /* COM-002 — service_catalog is the shared, non-sensitive catalog: re-grant
           read AFTER the revoke (last-rule-wins) and grant MANAGER write. */
        can('read', ServiceCatalogSubject);
        can(['create', 'update', 'delete'], ServiceCatalogSubject);
        /* COM-003 — accounts (CRM core): MANAGER is the commercial role → full CRUD. */
        can(['read', 'create', 'update', 'delete'], AccountSubject);
        /* COM-004 — contacts share the account permission profile → full CRUD. */
        can(['read', 'create', 'update', 'delete'], ContactSubject);
        /* COM-005 — opportunities (pipeline core) share the same profile → full CRUD. */
        can(['read', 'create', 'update', 'delete'], OpportunitySubject);
        /* COM-008 — activities (CRM timeline) share the same profile → full CRUD. */
        can(['read', 'create', 'update', 'delete'], ActivitySubject);
        break;

      case UserRole.ACCOUNTANT:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        can(['create', 'update'], CategorySubject);
        can(['create', 'update'], CounterpartySubject);
        can(['create', 'update'], CostCenterSubject);
        /* Resubmit is open to any authenticated user — the service layer
           still enforces "only the original uploader". */
        can('resubmit', DocumentRecordSubject);
        /* OPS-023 — request-only exception flow. Approval still
           requires ADMIN. */
        can('create', AssetExceptionSubject);
        /* OPS-025 — anyone authenticated can request a work permit
           (typical workflow: a contractor's supervisor lodges the
           request and waits for MANAGER authorization). */
        can(['create', 'update'], WorkPermitSubject);
        /* OPS-028 — every authenticated user can acknowledge their
           own readings; the service still scopes to userId. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        /* HR-001 + financial-visibility policy (Chile): the ACCOUNTANT handles
           payroll and company money, so it gets full RRHH financial READ
           visibility while staying strictly READ-ONLY. The blanket `read all`
           above is first revoked on every RRHH subject, then read is re-granted
           on the compensation-facing subjects AND on Employee (per-person fichas
           + the dashboard overview — neither carries salary). The re-grants run
           AFTER the cannot loop so @casl last-rule-wins leaves read enabled.
           NO create/update/delete is granted on any RRHH subject — settlements
           and finiquitos are produced in an external portal and only loaded into
           Excelsia, never written in-app. VIEWER/ANALYST keep no RRHH read. */
        RRHH_SUBJECTS.forEach((subject) => cannot('read', subject));
        RRHH_COMPENSATION_SUBJECTS.forEach((subject) => can('read', subject));
        can('read', EmployeeSubject);
        /* COM-001 — default-deny floor: revoke inherited blanket `read all` on
           Comercial subjects, then re-grant only the non-sensitive ones below. */
        COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject));
        /* COM-002 — service_catalog is non-sensitive and read by every role:
           re-grant read AFTER the revoke (last-rule-wins). No write for ACCOUNTANT. */
        can('read', ServiceCatalogSubject);
        /* COM-003 — accounts: ACCOUNTANT gets READ-ONLY portfolio visibility (same
           rationale as its RRHH financial read). No create/update/delete. */
        can('read', AccountSubject);
        /* COM-004 — contacts share the account read profile. Read-only, no write. */
        can('read', ContactSubject);
        /* COM-005 — opportunities: ACCOUNTANT read-only (pipeline visibility). No write. */
        can('read', OpportunitySubject);
        /* COM-008 — activities: ACCOUNTANT read-only (timeline visibility). No write. */
        can('read', ActivitySubject);
        break;

      case UserRole.ANALYST:
        can('read', 'all');
        can('resubmit', DocumentRecordSubject);
        can('create', AssetExceptionSubject);
        can(['create', 'update'], WorkPermitSubject);
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        /* HR-001 — ANALYST has no RRHH access; revoke the blanket
           `read all` on RRHH subjects. */
        RRHH_SUBJECTS.forEach((subject) => cannot('read', subject));
        /* COM-001 — default-deny floor: revoke inherited blanket `read all` on
           Comercial subjects, then re-grant only the non-sensitive ones below. */
        COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject));
        /* COM-002 — service_catalog is non-sensitive and read by every role:
           re-grant read AFTER the revoke (last-rule-wins). No write for ANALYST. */
        can('read', ServiceCatalogSubject);
        break;

      case UserRole.VIEWER:
        can('read', ReportSubject);
        can('read', MovementSubject);
        can('read', CategorySubject);
        can('read', CounterpartySubject);
        can('read', CostCenterSubject);
        can('read', FiscalPeriodSubject);
        can('read', OperationalAssetSubject);
        can('read', LocationSubject);
        can('read', AssetTypeSubject);
        can('read', VehicleSubject);
        can('read', DocumentTypeSubject);
        can('read', DocumentRequirementSubject);
        can('read', DocumentRecordSubject);
        can('resubmit', DocumentRecordSubject);
        can('read', AlertRuleSubject);
        can('read', AlertSettingsSubject);
        /* OPS-023 — even VIEWER can request an exception (they often
           are the operator of the blocked asset). Approval gating
           still happens at the ADMIN level. */
        can('read', AssetExceptionSubject);
        can('create', AssetExceptionSubject);
        /* OPS-024 — read-only on permit catalog/rows for VIEWER. */
        can('read', PermitTypeSubject);
        can('read', PermitSubject);
        /* OPS-025 — VIEWER reads but cannot author or move work
           permits through the lifecycle. */
        can('read', WorkPermitTypeSubject);
        can('read', WorkPermitSubject);
        /* OPS-026 — VIEWER can read approval chains/audit but cannot
           record actions. */
        can('read', PermitApprovalStepSubject);
        can('read', PermitApprovalSubject);
        /* OPS-027 — VIEWER reads procedures (the whole point of the
           library) but cannot author/edit/publish. */
        can('read', ProcedureSubject);
        /* OPS-028 — VIEWER can acknowledge their own readings.
           Coverage dashboards stay gated by the service. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        /* COM-002 — service_catalog is non-sensitive: VIEWER reads it (no blanket
           `read all` to inherit, so grant explicitly). No write. */
        can('read', ServiceCatalogSubject);
        break;
    }

    return build();
  }
}
