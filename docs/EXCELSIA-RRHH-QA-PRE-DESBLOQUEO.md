# EXCELSIA — Checklist de QA previo al desbloqueo de "Próximamente"

> **Propósito.** Durante el desarrollo de los nuevos módulos (RRHH, Comercial, Marketing)
> se priorizó velocidad para tener algo demostrable. Varias verificaciones se difirieron
> deliberadamente. Este documento las registra. **Ninguna de estas verificaciones es
> opcional antes de exponer el módulo para uso real.**
>
> **Regla de exposición (vigente):**
>
> - **Mostrar** al jefe / stakeholders → permitido AHORA, entrando por links directos
>   (`/rrhh/...`), con trabajadores de prueba. El gate "Próximamente" permanece puesto.
> - **Exponer** para uso real (sacar "Próximamente" del menú de módulos) → SOLO después de
>   completar (a) la configuración de MinIO en producción y (b) la ronda de QA de permisos
>   de este documento.
>
> Estado del documento: **ABIERTO** — se actualiza a medida que se difieren o completan ítems.
> Última actualización: 2026-06-26.

---

## 0. Las dos condiciones duras (bloqueantes para desbloquear)

Estas dos cosas DEBEN estar resueltas antes de sacar el "Próximamente":

| #   | Condición                                                                   | Estado       | Notas                                                                             |
| --- | --------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| G1  | **MinIO en producción configurado**                                         | ❌ Pendiente | Hoy `MINIO_ENDPOINT` vacío → todos los documentos van a DB-blob fallback. Ver §4. |
| G2  | **Ronda de QA de permisos completa** (todos los roles, todas las pantallas) | ❌ Pendiente | Especialmente datos sensibles: sueldos y finiquitos. Ver §1 y §2.                 |

---

## 1. QA de permisos — verificación a nivel de aplicación (PRIORIDAD MÁXIMA)

**Por qué importa:** los tests de CASL pasan y el RLS de las tablas está verificado, pero la
verificación a nivel de _aplicación_ (entrar con cada rol y confirmar qué ve cada uno en la UI)
no se hizo. En datos no sensibles es bajo riesgo; en **sueldos y finiquitos es crítico**, porque
ahí un error significa que un rol equivocado ve información que no debe.

### 1.1 Procedimiento recomendado

1. Crear un usuario de prueba por cada rol: **ADMIN, MANAGER, ACCOUNTANT, ANALYST, VIEWER**.
2. Con cada uno, recorrer cada pestaña/pantalla del módulo y confirmar contra la matriz (§1.2).
3. Marcar cada celda como verificada. Cualquier desvío = bug a corregir antes de desbloquear.

### 1.2 Matriz esperada (qué debe ver cada rol)

Leyenda: ✅ acceso total · 📊 solo agregados (nunca por persona) · ❌ sin acceso

| Pantalla / dato                        | ADMIN | MANAGER | ACCOUNTANT | ANALYST | VIEWER |
| -------------------------------------- | :---: | :-----: | :--------: | :-----: | :----: |
| Cargos                                 |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Trabajadores (ficha, datos personales) |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| **Remuneración por persona (sueldo)**  |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| **Masa salarial (agregado)**           |  ✅   |   ✅    |     📊     |   ❌    |   ❌   |
| **Liquidaciones por persona (HR-009)** |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| **Liquidaciones agregado (HR-009)**    |  ✅   |   ✅    |     📊     |   ❌    |   ❌   |
| **Finiquito (HR-010)**                 |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Documentos                             |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Contratos                              |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Vacaciones                             |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Licencias / permisos                   |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Certificaciones                        |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Dashboard RRHH                         |  ✅   |   ✅    |     📊     |   ❌    |   ❌   |
| Parámetros previsionales               |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |

> Nota: la matriz refleja el diseño acordado (el dato salarial sensible es MANAGER/ADMIN-only;
> ACCOUNTANT solo ve agregados sin filas por persona). Si al verificar algo no coincide, es un bug.

### 1.3 Verificaciones puntuales de alto riesgo (las que NO se hicieron a mano)

- [ ] **HR-009 (remuneraciones):** entrar como **ACCOUNTANT** → confirmar que NO ve montos de
      sueldo por persona en la ficha (debe decir "sin permiso"); confirmar que sí puede ver el
      agregado en el dashboard. Como **VIEWER** → no ve nada de remuneraciones.
      _Estado: validado solo a nivel tabla (RLS). Falta nivel app._
- [ ] **HR-010 (finiquito):** entrar como **ACCOUNTANT** y **VIEWER** → confirmar que NO ven la
      sección de finiquito ni montos (403).
      _Estado: validado solo a nivel tabla. Falta nivel app._

---

## 2. Cálculo verificado a mano (los números de plata)

**Por qué importa:** los cálculos de dominio chileno tienen tests que pasan, pero algunos no se
verificaron con una cuenta a mano sobre datos reales. Un error acá = plata mal calculada.

- [ ] **HR-010 (finiquito) — cuenta a mano.** Estimar: necesidades de la empresa, trabajador de
      5 años, base 1.000.000, sin aviso previo → IAS esperado = 1.000.000 × 5 = **5.000.000**, + 1.000.000 de aviso, + feriado del saldo. Confirmar que el total cuadra. - [ ] Confirmar doble tope: base sobre 90 UF usa el tope, no el sueldo real. - [ ] Confirmar tope de 11 años: 14 años de antigüedad → calcula como 11. - [ ] Confirmar que la causal cambia los componentes (renuncia → solo feriado).
      _Estado: cubierto por 19 unit tests; sin verificación humana._
- [x] **HR-011 (vacaciones) — cuenta a mano.** _YA VERIFICADO por el owner: devengado = meses ×
      1,25; conteo viernes-a-lunes = 2 días hábiles; aprobar/cancelar mueve el saldo._ ✅

---

## 3. Flujos que requieren un segundo usuario

**Por qué importa:** ciertas reglas (uploader ≠ approver) no se pueden probar con un solo usuario.
Quedaron cubiertas por tests pero sin recorrido manual completo.

- [ ] **HR-004 (documentos):** - [ ] Versionado / supersede (subir nueva versión de un documento APROBADO → el anterior
      queda como versión previa). - [ ] Rechazo + "reenviar a revisión" (necesita un segundo usuario para aprobar/rechazar). - [ ] Aprobar un documento subido por otro usuario (uploader ≠ approver).
      _Estado: subida/descarga/validación de archivo inválido YA verificados por el owner._
- [ ] **HR-007 (contratos):** - [ ] Agregar un anexo a un contrato vigente → confirmar que NO desplaza al principal. - [ ] 403 con VIEWER en endpoints de contratos.
      _Estado: creación de contrato y supersede del principal YA verificados por el owner._
- [ ] **HR-012 (licencias / permisos):** - [ ] Recorrido manual completo del bloqueo de disponibilidad (aprobar una ausencia que
      cubre hoy → indicador "no disponible"; cancelar → "disponible").
      _Estado: la prueba automática falló por rate-limiting transitorio; CC verificó a mano el
      "no toca Operaciones". El owner verificó registrar permiso/licencia + archivo. Falta el
      recorrido del indicador de disponibilidad con datos._

---

## 4. Deuda de infraestructura (resolver antes o junto al desbloqueo)

- [ ] **MinIO en producción (G1 — bloqueante).** Hoy en Railway: `MINIO_BUCKET=excelsia-documents`,
      `MINIO_PORT=9000`, `MINIO_USE_SSL=true` seteados, pero `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`,
      `MINIO_SECRET_KEY` **vacíos** → `isConfigured()=false` → todos los documentos se guardan como
      blob en PostgreSQL. Funciona, pero infla la DB y los backups. - Decisión pendiente: S3 externo (Cloudflare R2 / Backblaze B2, recomendado por simplicidad
      y costo) vs. servicio MinIO propio en Railway. - Acción: setear `MINIO_ENDPOINT` + credenciales válidas + asegurar que el bucket existe.
- [ ] **Completar las 4 comisiones de AFP faltantes (HR-008).** Capital, Cuprum, Habitat, PlanVital
      están en `NULL` (no se inventaron). Completar desde spensiones.cl. No urgente (no hay motor
      que las use aún), pero dejar la tabla al día.

---

## 5. Deuda de plataforma (no bloqueante para el desbloqueo, sí para multi-tenant futuro)

Estos ítems están documentados y son consistentes en todo el módulo. NO bloquean el desbloqueo de
RRHH (single-tenant hoy), pero deben resolverse antes de un escenario multi-tenant real.

- [ ] **RLS en producción depende de BYPASSRLS.** La API conecta como superusuario `postgres`, que
      ignora las policies RLS. Las lecturas company-scoped (dashboard, compliance, dedup de crons)
      usan `prisma` directo apoyándose en esa postura. El fix correcto es un path de lectura
      company-scoped a nivel plataforma (no parches locales). Agrupado con la remediación
      multi-tenant.
- [ ] **`SentryExceptionFilter` aplana cuerpos de error estructurados** (app-wide). Detectado en
      HR-004b (el 409 con `existingDocumentId` se sorteó del lado cliente). Afecta cualquier
      endpoint que devuelva datos en un error. Ticket de plataforma.
- [ ] **Drift de `qrToken` en `operational_assets`.** El schema dice `@unique`, la migración real
      usó índice parcial. Obliga a migraciones hand-authored. Reconciliar cuando se pueda (tarea
      pensada, no apurada).
- [ ] **Off-by-one de fechas `@db.Date` en Operaciones.** El mismo bug de timezone que se corrigió
      en RRHH (HR-004b con `formatDateOnly`) está latente en Operaciones. Fuera del alcance de RRHH.

---

## 6. Orden sugerido para la ronda de QA

Cuando se haga la ronda (antes de desbloquear), este es el orden por prioridad de riesgo:

1. **§1.3 + §2** — permisos y cálculo de datos sensibles (sueldos, finiquitos). Lo más crítico.
2. **§1.2** — recorrido completo de la matriz de permisos con los 5 roles.
3. **§3** — flujos con segundo usuario.
4. **§4** — MinIO (bloqueante) + comisiones AFP.
5. **§5** — deuda de plataforma (puede ir a un sprint de hardening posterior, no bloquea el
   desbloqueo single-tenant).

---

## 7. Firma de desbloqueo

El "Próximamente" de RRHH se puede sacar SOLO cuando:

- [ ] §1 (QA de permisos, incluyendo §1.3 datos sensibles) — completo y sin desvíos.
- [ ] §2 (cálculo de finiquito verificado a mano) — completo.
- [ ] §4 MinIO (G1) — resuelto y verificado en producción.

Las secciones §3 y §5 son fuertemente recomendadas pero pueden planificarse como sprint de
hardening posterior si se decide conscientemente. §1, §2 y §4-MinIO son **innegociables**.

_Responsable: Pato (AGS Soluciones). Este documento se versiona junto al código._
