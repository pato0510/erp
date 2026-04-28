import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

/* Stub service for OPS-002 — full CRUD lands in OPS-005. */
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string) {
    void [this.prisma, this.rlsService, companyId];
    return [];
  }

  async findOne(id: string, companyId: string) {
    void [this.prisma, this.rlsService, companyId];
    return { id, message: 'Stub — implement in OPS-005' };
  }

  async create(companyId: string, userId: string, dto: CreateLocationDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { ...dto, message: 'Stub — implement in OPS-005' };
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateLocationDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, ...dto, message: 'Stub — implement in OPS-005' };
  }

  async remove(id: string, companyId: string, userId: string) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, success: true, message: 'Stub — implement in OPS-005' };
  }
}
