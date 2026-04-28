import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

/* Stub service for OPS-002 — full CRUD lands in OPS-009. */
@Injectable()
export class FleetService {
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
    return { id, message: 'Stub — implement in OPS-009' };
  }

  async create(companyId: string, userId: string, dto: CreateVehicleDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { ...dto, message: 'Stub — implement in OPS-009' };
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateVehicleDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, ...dto, message: 'Stub — implement in OPS-009' };
  }

  async remove(id: string, companyId: string, userId: string) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, success: true, message: 'Stub — implement in OPS-009' };
  }
}
