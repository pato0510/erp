import { Injectable, Logger } from '@nestjs/common';
import { TodosService } from '../actividades/todos/todos.service';
import { AlertsService as ComercialAlertsService } from '../comercial/alerts/alerts.service';
import {
  AlertRuleSubject,
  AppAbility,
  CampaignSubject,
  EmployeeSubject,
  HsecIncidentSubject,
  MovementSubject,
  OpportunitySubject,
  QuoteSubject,
  TodoSubject,
} from '../common/casl/casl-ability.factory';
import { resolveDefaultCategoryIds } from '../common/default-categories';
import { RlsService } from '../common/rls/rls.service';
import { AlertInstancesService } from '../operations/alerts/alert-instances.service';

export interface HubStatusLine {
  moduleKey: 'finanzas' | 'operaciones' | 'hsec' | 'comercial' | 'marketing' | 'rrhh' | 'gestion';
  kind: 'atencion' | 'correcto' | 'informativo';
  message: string;
}

type StatusContent = Omit<HubStatusLine, 'moduleKey'>;

// Date-only values are stored as UTC midnight; the civil date is Santiago's.
function todayInSantiago(): Date {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function attention(count: number, positive: string, zero: string): StatusContent {
  return { kind: count > 0 ? 'atencion' : 'correcto', message: count > 0 ? positive : zero };
}

@Injectable()
export class HubService {
  private readonly logger = new Logger(HubService.name);

  constructor(
    private readonly rls: RlsService,
    private readonly comercial: ComercialAlertsService,
    private readonly todos: TodosService,
    private readonly operations: AlertInstancesService,
  ) {}

  async getStatus(
    companyId: string,
    userId: string,
    ability: AppAbility,
  ): Promise<{ lines: HubStatusLine[] }> {
    const today = todayInSantiago();
    const sources: {
      moduleKey: HubStatusLine['moduleKey'];
      allowed: boolean;
      load: () => Promise<StatusContent>;
    }[] = [
      {
        moduleKey: 'finanzas',
        allowed: ability.can('read', MovementSubject),
        load: async () => {
          const count = await this.countUncategorized(companyId, userId);
          return attention(
            count,
            `${count} ${count === 1 ? 'movimiento sin categorizar' : 'movimientos sin categorizar'}`,
            'sin movimientos por categorizar',
          );
        },
      },
      {
        moduleKey: 'operaciones',
        allowed: ability.can('read', AlertRuleSubject),
        load: async () => {
          // The alerts page calls OPEN alerts ACTIVE and includes BLOCKING in critical.
          const { active, critical } = await this.operations.getKpis(companyId);
          const suffix =
            critical > 0 ? ` · ${critical} ${critical === 1 ? 'crítica' : 'críticas'}` : '';
          return attention(
            active,
            `${active} ${active === 1 ? 'alerta activa' : 'alertas activas'}${suffix}`,
            'sin alertas activas',
          );
        },
      },
      {
        moduleKey: 'hsec',
        allowed: ability.can('read', HsecIncidentSubject),
        load: async () => {
          // Last 30 civil days, including today; future incidents are excluded.
          const count = await this.rls.executeWithRls(companyId, userId, (tx) =>
            tx.hsecIncident.count({
              where: {
                companyId,
                occurredDate: { gte: addDays(today, -29), lt: addDays(today, 1) },
              },
            }),
          );
          return attention(
            count,
            `${count} ${count === 1 ? 'incidente' : 'incidentes'} · últimos 30 días`,
            '0 incidentes · últimos 30 días',
          );
        },
      },
      {
        moduleKey: 'comercial',
        allowed: ability.can('read', OpportunitySubject) && ability.can('read', QuoteSubject),
        load: async () => {
          const { counts } = await this.comercial.getAlerts(companyId, true);
          return attention(
            counts.total,
            `${counts.total} ${counts.total === 1 ? 'alerta comercial' : 'alertas comerciales'}`,
            'sin alertas comerciales',
          );
        },
      },
      {
        moduleKey: 'marketing',
        allowed: ability.can('read', CampaignSubject),
        load: async () => {
          const count = await this.rls.executeWithRls(companyId, userId, (tx) =>
            tx.campaign.count({ where: { companyId, status: 'ACTIVA' } }),
          );
          return {
            kind: 'informativo',
            message:
              count > 0
                ? `${count} ${count === 1 ? 'campaña activa' : 'campañas activas'}`
                : 'sin campañas activas',
          };
        },
      },
      {
        moduleKey: 'rrhh',
        allowed: ability.can('read', EmployeeSubject),
        load: async () => {
          const count = await this.countExpiring(companyId, userId, today);
          return attention(
            count,
            `${count} ${count === 1 ? 'vencimiento' : 'vencimientos'} en 30 días`,
            'sin vencimientos en 30 días',
          );
        },
      },
      {
        moduleKey: 'gestion',
        allowed: ability.can('read', TodoSubject),
        load: async () => {
          const { counts } = await this.todos.alerts(companyId, userId, ability, {
            scope: 'mine',
            summary: true,
          });
          const parts: string[] = [];
          if (counts.overdue > 0)
            parts.push(
              `${counts.overdue} ${counts.overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}`,
            );
          if (counts.dueSoon > 0)
            parts.push(
              `${counts.dueSoon} ${counts.dueSoon === 1 ? 'vence' : 'vencen'} hoy o mañana`,
            );
          return attention(
            counts.overdue + counts.dueSoon,
            parts.join(' · '),
            'sin tareas pendientes de vencimiento',
          );
        },
      },
    ];

    const authorized = sources.filter((source) => source.allowed);
    const results = await Promise.allSettled(
      authorized.map(async (source) => ({ moduleKey: source.moduleKey, ...(await source.load()) })),
    );
    const lines: HubStatusLine[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') lines.push(result.value);
      else
        this.logger.warn(
          `Hub: fuente ${authorized[index].moduleKey} no disponible; se omite su línea.`,
        );
    });
    return { lines };
  }

  private countUncategorized(companyId: string, userId: string): Promise<number> {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const categoryIds = await resolveDefaultCategoryIds(companyId, tx);
      return tx.movement.count({ where: { companyId, categoryId: { in: categoryIds } } });
    });
  }

  private countExpiring(companyId: string, userId: string, today: Date): Promise<number> {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      const window = { gte: today, lte: addDays(today, 30) };
      // Mirror reminder eligibility without calling their notification-producing runs.
      // Only upcoming expirations count here, not the reminders' overdue backlog.
      const counts = await Promise.all([
        tx.employeeContract.count({
          where: {
            companyId,
            status: 'VIGENTE',
            contractType: { in: ['PLAZO_FIJO', 'POR_OBRA'] },
            parentContractId: null,
            endDate: window,
          },
        }),
        tx.employeeDocument.count({
          where: { companyId, status: 'APPROVED', supersededById: null, expiryDate: window },
        }),
        tx.certification.count({
          where: { companyId, status: 'VIGENTE', expiryDate: window },
        }),
      ]);
      return counts.reduce((sum, count) => sum + count, 0);
    });
  }
}
