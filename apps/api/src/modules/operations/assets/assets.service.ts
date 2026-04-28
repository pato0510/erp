import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { FilterAssetsDto } from './dto/filter-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

/* Stub service for OPS-002 — wires controllers, RLS and CASL into the route
   table without business logic. Real CRUD lands in OPS-005. */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterAssetsDto) {
    void [this.prisma, this.rlsService, companyId, filters];
    return [];
  }

  async findOne(id: string, companyId: string) {
    void [this.prisma, this.rlsService, companyId];
    return { id, message: 'Stub — implement in OPS-005' };
  }

  async create(companyId: string, userId: string, dto: CreateAssetDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { ...dto, message: 'Stub — implement in OPS-005' };
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAssetDto) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, ...dto, message: 'Stub — implement in OPS-005' };
  }

  async remove(id: string, companyId: string, userId: string) {
    void [this.prisma, this.rlsService, companyId, userId];
    return { id, success: true, message: 'Stub — implement in OPS-005' };
  }
}
