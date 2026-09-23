import { Injectable } from '@nestjs/common';
import { RlsService } from '../common/rls/rls.service';
import { memberDisplayName } from './member-display-name';

export type MembersScope = 'active' | 'all';

// FOUNDER-SIGNED EXPOSURE (2026-07-21), promoted to IAM by MEM-001:
// structural names-only contract; never expose email, role or state.
export interface MemberOption {
  userId: string;
  displayName: string;
}

@Injectable()
export class MembersService {
  constructor(private readonly rls: RlsService) {}

  listForCompany(
    companyId: string,
    userId: string,
    scope: MembersScope = 'all',
  ): Promise<MemberOption[]> {
    return this.rls.executeWithRls(companyId, userId, async (tx) => {
      // Membership → User is IAM infrastructure, not a business-module boundary.
      // Keep the company filter even under RLS; history includes inactive memberships.
      const memberships = await tx.membership.findMany({
        where: { companyId, ...(scope === 'active' ? { isActive: true } : {}) },
        select: {
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      });
      return memberships.map(({ userId, user }) => ({
        userId,
        displayName: memberDisplayName(user),
      }));
    });
  }
}
