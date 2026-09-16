import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CounterpartiesService } from './counterparties.service';
import { CreateCounterpartyDto } from './dto/create-counterparty.dto';
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';

describe('FIN-A manual counterparty giro', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  for (const metatype of [CreateCounterpartyDto, UpdateCounterpartyDto]) {
    it.each([
      [' Construcción ', 'Construcción'],
      ['', null],
      ['  ', null],
      [null, null],
      [undefined, undefined],
      ['x'.repeat(200), 'x'.repeat(200)],
    ])(`${metatype.name} trims giro and maps empty to null (%s)`, async (giro, expected) => {
      const dto = await pipe.transform(
        { name: 'Contraparte', type: 'SUPPLIER', giro },
        { type: 'body', metatype },
      );
      expect(dto.giro).toBe(expected);
    });
    it.each(['x'.repeat(201), 123, {}])(`${metatype.name} rejects invalid giro`, async (giro) => {
      await expect(
        pipe.transform({ name: 'Contraparte', type: 'SUPPLIER', giro }, { type: 'body', metatype }),
      ).rejects.toThrow(BadRequestException);
    });
  }

  it('writes through RLS, permits clearing giro and preserves it on unrelated PATCH', async () => {
    const row = { id: 'party', companyId: 'company', giro: null as string | null };
    const tx = {
      counterparty: {
        create: jest.fn(({ data }) => Object.assign(row, data)),
        update: jest.fn(({ data }) => {
          for (const key of Object.keys(data))
            if (data[key] !== undefined) Object.assign(row, { [key]: data[key] });
          return row;
        }),
      },
    };
    const prisma = { counterparty: { findFirst: jest.fn().mockResolvedValue(row) } };
    const rls = { executeWithRls: jest.fn(async (_company, _user, fn) => fn(tx)) };
    const service = new CounterpartiesService(
      prisma as unknown as PrismaService,
      rls as unknown as RlsService,
    );
    await service.create('company', 'user', {
      name: 'Contraparte',
      type: 'SUPPLIER',
      giro: ' Construcción ',
    });
    expect(row.giro).toBe('Construcción');
    await service.update('party', 'company', 'user', { giro: ' Giro manual ' });
    expect(row.giro).toBe('Giro manual');
    await service.update('party', 'company', 'user', { name: 'Nuevo nombre' });
    expect(row.giro).toBe('Giro manual');
    await service.update('party', 'company', 'user', { giro: '   ' });
    expect(row.giro).toBeNull();
    expect(prisma.counterparty.findFirst).toHaveBeenCalledWith({
      where: { id: 'party', companyId: 'company' },
    });
    expect(rls.executeWithRls).toHaveBeenCalledTimes(4);
    expect(rls.executeWithRls).toHaveBeenCalledWith('company', 'user', expect.any(Function));
  });
});
