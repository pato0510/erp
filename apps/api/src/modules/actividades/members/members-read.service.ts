import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/* CAL-008 — members-lite read for the Actividades module (Gestión plan §2.4).
 *
 * FOUNDER-SIGNED EXPOSURE, 2026-07-21: every reader of the activities table must be able to
 * resolve the responsable's NAME, so this returns a minimal roster of the caller's company
 * gated `read CalendarActivity` (all six roles — like birthdays). The privacy line is
 * STRUCTURAL, not a filter: MemberOption carries ONLY { userId, displayName } — NEVER email,
 * role, status or any other field. The interface cannot leak what it does not hold.
 *
 * It reads Membership + User, which are PLATFORM-COMMON infra (IAM), not a business module —
 * so reading them directly via PrismaService is correct (the same class of access as reading
 * PrismaService itself), NOT a cross-business-module boundary that would need an expose/consume
 * contract. displayName follows the User display convention: "firstName lastName" (the only
 * name fields the User model carries), falling back to the email local-part if that is blank. */

export interface MemberOption {
  userId: string;
  displayName: string;
}

@Injectable()
export class MembersReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCompany(companyId: string): Promise<MemberOption[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId },
      select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });

    // Dedupe by userId (a user could hold more than one membership row in a company).
    const byUser = new Map<string, MemberOption>();
    for (const m of memberships) {
      const full = `${m.user.firstName} ${m.user.lastName}`.trim();
      const displayName = full || m.user.email.split('@')[0];
      byUser.set(m.userId, { userId: m.userId, displayName });
    }

    return [...byUser.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
