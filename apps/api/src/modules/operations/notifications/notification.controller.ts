import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { FilterNotificationsDto } from './dto/filter-notifications.dto';
import { NotificationService } from './notification.service';

/* OPS-022 — all endpoints implicitly scope to the caller's userId.
   PoliciesGuard isn't applied because the spec calls out "always own
   data". JwtAuthGuard alone is enough — RLS enforces the per-user
   isolation at the database layer. */
@Controller('operations/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query() filters: FilterNotificationsDto,
  ) {
    return this.service.findAll(companyId, user.id, filters);
  }

  @Get('unread-count')
  unreadCount(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getUnreadCount(companyId, user.id);
  }

  @Post('mark-all-read')
  markAllRead(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.markAllAsRead(companyId, user.id);
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.markAsRead(id, companyId, user.id);
  }

  @Post(':id/dismiss')
  dismiss(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.dismiss(id, companyId, user.id);
  }
}
