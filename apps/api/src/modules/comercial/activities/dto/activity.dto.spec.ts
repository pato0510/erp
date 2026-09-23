import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';
import { UpdateActivityStatusDto } from './update-activity-status.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

describe('COM-022 activity DTOs — main.ts ValidationPipe', () => {
  const create = { type: 'LLAMADA', subject: 'Llamar', activityDate: '2026-09-23' };

  it.each([
    ['isSystemGenerated', true],
    ['systemEvent', 'CREACION'],
    ['statusChangedAt', '2026-09-23T15:00:00Z'],
  ])('public create rejects %s', async (field, value) => {
    await expect(
      pipe.transform(
        { ...create, [field as string]: value },
        {
          type: 'body',
          metatype: CreateActivityDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('general update rejects status', async () => {
    await expect(
      pipe.transform(
        { status: 'HECHA' },
        {
          type: 'body',
          metatype: UpdateActivityDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['PENDIENTE', 'HECHA'])(
    'accepts %s on create and the canonical status endpoint',
    async (status) => {
      expect(
        await pipe.transform(
          { ...create, status },
          {
            type: 'body',
            metatype: CreateActivityDto,
          },
        ),
      ).toMatchObject({ status });
      expect(
        await pipe.transform(
          { status },
          {
            type: 'body',
            metatype: UpdateActivityStatusDto,
          },
        ),
      ).toMatchObject({ status });
    },
  );

  it.each([
    {},
    { status: null },
    { status: 'EN_EJECUCION' },
    { status: 'CANCELADA' },
    {
      status: 'HECHA',
      statusChangedAt: '2026-09-23T15:00:00Z',
    },
  ])('status rejects missing/calendar states and server fields: %j', async (body) => {
    await expect(
      pipe.transform(body, {
        type: 'body',
        metatype: UpdateActivityStatusDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
