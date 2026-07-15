'use client';

import { ActividadesPlaceholder } from '../../../../components/actividades/ActividadesPlaceholder';

/* CAL-001 — Calendario placeholder. The month/week/day activity calendar lands in
   CAL-005 (fed by CAL-003, with birthdays in CAL-006). */
export default function ActividadesCalendarioPage() {
  return (
    <ActividadesPlaceholder
      title="Calendario"
      description="Calendario maestro de actividades internas (mes · semana · día)."
    />
  );
}
