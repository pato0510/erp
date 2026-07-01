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
> Última actualización: 2026-06-30 — Política del ACCOUNTANT redefinida por el owner: visibilidad
> financiera completa (Chile: el contador confecciona la nómina y gestiona el dinero). El 403 de
> sueldos/finiquitos por persona para el contador se reclasifica como **BUG a corregir** (antes era
> "blindaje correcto"). Restricciones de VIEWER/ANALYST sin cambios. Ver §1.2–§1.4.

---

## 0. Las dos condiciones duras (bloqueantes para desbloquear)

Estas dos cosas DEBEN estar resueltas antes de sacar el "Próximamente":

| #   | Condición                                                                   | Estado       | Notas                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **MinIO en producción configurado**                                         | ✅ RESUELTO  | Cloudflare R2 configurado; las subidas caen en el bucket `excelsia-documents` (verificado en prod 2026-06-30). El fix fue la config del cliente S3 (puerto/credenciales/región/bucket), no las env vars. Ver §4. |
| G2  | **Ronda de QA de permisos completa** (todos los roles, todas las pantallas) | ❌ Pendiente | Especialmente datos sensibles: sueldos y finiquitos. Ver §1 y §2.                                                                                                                                                |

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
| Trabajadores (ficha, datos personales) |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| **Remuneración por persona (sueldo)**  |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| **Masa salarial (agregado)**           |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| **Liquidaciones por persona (HR-009)** |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| **Liquidaciones agregado (HR-009)**    |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| **Finiquito (HR-010)**                 |  ✅   |   ✅    |     ✅     |   ❌    |   ❌   |
| Documentos                             |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Contratos                              |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Vacaciones                             |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Licencias / permisos                   |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Certificaciones                        |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Disponibilidad (HR-015 / HR-016)       |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |
| Dashboard RRHH                         |  ✅   |   ✅    |     📊     |   ❌    |   ❌   |
| Parámetros previsionales               |  ✅   |   ✅    |     ❌     |   ❌    |   ❌   |

> Nota (política redefinida por el owner, 2026-06-30): el **ACCOUNTANT (contador) tiene visibilidad
> financiera completa** — sueldos por persona, liquidaciones, finiquitos y agregados — porque en
> Chile el contador confecciona la nómina y gestiona el dinero de la empresa.
> **MANAGER/ADMIN/SUPER_ADMIN** mantienen acceso total. **VIEWER y ANALYST NO ven datos financieros
> sensibles** (sueldos, liquidaciones, finiquitos). Si al verificar algo no coincide con esto, es un
> bug. Las filas no financieras (cargos, documentos, contratos, vacaciones, etc.) siguen siendo
> MANAGER/ADMIN-only.

> Nota (Disponibilidad, HR-015 / HR-016): el **tablero de disponibilidad** y el endpoint
> `disponibilidad-servicio` exponen **nombres de trabajadores + motivos de no-disponibilidad**
> (licencia / permiso), que son **PII de salud (health-adjacent)**. Por eso quedan restringidos a
> **MANAGER/ADMIN/SUPER_ADMIN** — gateados en `AvailabilitySubject`, **no** afectados por el grant
> de `read Employee` del ACCOUNTANT (que sigue en ❌ para esta pantalla).

> Nota (Dashboard RRHH — decisión consciente, ya implementada): `GET /rrhh/dashboard/overview` se
> **modela según la ability CASL** de quien llama. Su bloque de **renovaciones de contrato**
> (`proximasRenovaciones`, hoy vacío) está **gateado en `read EmployeeContract`**, de modo que
> cuando se conecte la data de renovaciones, un lector que **no** ve Contratos (p. ej. el
> **ACCOUNTANT**, ❌ en Contratos) **no** la recibirá a través del dashboard.

### 1.3 Verificaciones puntuales de alto riesgo (las que NO se hicieron a mano)

> ⚠️ **REINTERPRETADO bajo la nueva política del owner (2026-06-30).** En la ronda se observó que el
> ACCOUNTANT recibe 403 en los datos por persona y se registró como "blindaje correcto". Con la
> política redefinida (el contador DEBE ver los datos financieros), ese 403 ya **no es el
> comportamiento deseado: es un BUG a corregir antes de exponer**. La validación de VIEWER (no ve
> nada) sigue siendo correcta.

- [ ] **HR-009 (remuneraciones) — ❌ permiso DEMASIADO restrictivo para ACCOUNTANT (a corregir).**
      Observado en producción: **ACCOUNTANT** ve solo el agregado de masa salarial y los endpoints de
      sueldo por persona devuelven 403 (Network tab: `payroll`=200, `overview`=403, `employees`=403).
      Bajo la nueva política eso es un **BUG**: el contador DEBE ver los sueldos por persona. A
      corregir antes de exponer (ver §1.4). **VIEWER:** no ve nada sensible → ✅ correcto, sin cambios.
- [ ] **HR-010 (finiquito) — ❌ permiso DEMASIADO restrictivo para ACCOUNTANT (a corregir).** El
      **ACCOUNTANT** DEBE poder ver los finiquitos por persona (es quien gestiona el dinero de la
      empresa). Si en producción el contador recibe 403 en finiquito, es un **BUG a corregir** (ver
      §1.4). **VIEWER y ANALYST:** NO deben ver finiquitos ni montos → ✅ se mantiene la restricción.

### 1.4 Hallazgos de la ronda QA en producción (2026-06-30)

> **Decisión del owner (contexto Chile): el ACCOUNTANT (contador) confecciona la nómina /
> liquidaciones y gestiona TODO el dinero de la empresa → DEBE tener visibilidad financiera
> completa.** Esto REEMPLAZA el hallazgo anterior (que pedía "lista sin sueldos"); ahora el contador
> debe ver también los montos por persona.

- [ ] **AJUSTE DE PERMISOS (bloqueante antes de exponer) — abrir los datos financieros al
      contador.** Estado requerido para **ACCOUNTANT**: lectura completa de (a) la LISTA de
      trabajadores y su ficha, (b) **sueldos por persona** (HR-003 compensación), (c)
      **liquidaciones por persona** (HR-009), (d) **finiquitos** (HR-010), además de los agregados.
      Hoy en producción el contador recibe 403 en estos recursos → es un **BUG a corregir**.
- [ ] **PREGUNTA ABIERTA para el owner (TBD antes de implementar): ¿el contador solo VE o también
      CONFECCIONA?** ¿El ACCOUNTANT debe poder además **crear/editar** liquidaciones en el sistema, o
      solo verlas? Si solo VE → basta abrir la lectura. Si también las confecciona → hay que otorgarle
      escritura (create/edit) sobre liquidaciones. **Decidir antes de implementar.**
- [ ] **CONSTRAINT (inverso al anterior).** El fix debe **ABRIR** los datos financieros al
      ACCOUNTANT **manteniendo a VIEWER y ANALYST bloqueados** (sin sueldos, liquidaciones ni
      finiquitos). MANAGER/ADMIN/SUPER_ADMIN sin cambios.
- [ ] **Nota técnica para quien lo implemente.** Hoy el ACCOUNTANT tiene **solo lectura** sobre los
      subjects de compensación, pero los endpoints sensibles por persona gatean en **"read AND
      update"** (lo que excluye al ACCOUNTANT de solo-lectura → de ahí el 403 observado). Para darle
      visibilidad, los endpoints de **lectura** (compensación, liquidaciones por persona, finiquito)
      deben gatear en **"read"** con el ACCOUNTANT teniendo `read` sobre esos subjects. Si el owner
      además quiere que el contador **confeccione** liquidaciones (item anterior), los endpoints de
      **escritura** y CASL deben otorgar `update` al ACCOUNTANT sobre el subject de liquidaciones
      (TBD). `TerminationSimulationSubject` en `RRHH_COMPENSATION_SUBJECTS` (legible por ACCOUNTANT)
      es ahora **correcto/deseado**.
- [ ] **Secundario (cosmético, menor prioridad).** Donde un 403 SÍ es intencional (p.ej. VIEWER /
      ANALYST en datos financieros), la pantalla Trabajadores debería mostrar un mensaje limpio "sin
      permiso" en vez del rojo genérico "No se pudieron cargar", igual que lo maneja Disponibilidad.

---

## 2. Cálculo verificado a mano (los números de plata)

**Por qué importa:** los cálculos de dominio chileno tienen tests que pasan, pero algunos no se
verificaron con una cuenta a mano sobre datos reales. Un error acá = plata mal calculada.

- [x] **HR-010 (finiquito) — cuenta a mano. ✅ VALIDADO por el owner en producción (2026-06-30).** - [x] Caso normal (necesidades de la empresa, 5 años, base $1.000.000, UF 40.000, con aviso) →
      IAS $5.000.000 (1.000.000×5), aviso $0 (aviso dado), feriado $40.333 → total **$5.040.333**. ✅ - [x] Tope 90 UF: base $5.000.000 → topada a $3.600.000 (90×40.000), IAS = 3.600.000×5 =
      **$18.000.000** (NO sobre los 5M). El feriado usó la base FULL ($166.667/día), no la topada
      — correcto: el tope aplica solo a IAS/aviso. ✅ - [x] Causal renuncia → IAS $0, aviso $0, solo feriado. La lógica de causales funciona. ✅ - [x] Disclaimer "Estimación referencial…" visible. ✅
      _Estado: cálculo de finiquito totalmente validado (caso normal + tope UF + causales), además
      de los 19 unit tests. El tope de 11 años de antigüedad queda cubierto por unit tests (no se
      ejerció a mano en esta ronda)._
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
- [ ] **HR-015 (tablero de disponibilidad):** - [ ] Recorrido visual: la pantalla Disponibilidad muestra el equipo con su estado de hoy
      (chips disponible/vacaciones/no disponible). - [ ] Cambiar la fecha del selector a un día con vacaciones aprobadas → ese trabajador
      aparece como VACACIONES. - [ ] Aprobar una licencia que cubra hoy en la ficha → en el tablero ese trabajador sale
      `NO_DISPONIBLE` con motivo. - [ ] La matriz cruza cargos con certificaciones requeridas. - [ ] 403 con
      VIEWER/ANALYST/ACCOUNTANT.
      _Estado: lectura/agregación que reúne HR-011/012/014; cubierto por unit tests + chequeos
      en vivo (incl. aserción recursiva de "sin datos de sueldo"). Sin recorrido visual del
      owner. Riesgo bajo._
- [ ] **HR-016 (endpoint disponibilidad-para-servicio):** - [ ] Verificar que `GET /api/rrhh/disponibilidad-servicio/:employeeId?date=` devuelve el
      shape documentado y que coincide con el tablero de HR-015 para la misma fecha. - [ ] 403 con ACCOUNTANT/VIEWER. - [ ] Nota: cuando se conecte Operaciones, DECIDIR conscientemente quién puede consumir
      este endpoint (expone nombres + motivo de no-disponibilidad = PII de salud). Hoy gateado a
      MANAGER/ADMIN/SUPER*ADMIN; abrir a roles de Operaciones es una decisión deliberada a
      documentar.
      \_Estado: endpoint de servicio (sin UI); cubierto por unit tests (incl. paridad con el
      tablero). Riesgo bajo.*

---

## 4. Deuda de infraestructura (resolver antes o junto al desbloqueo)

- [x] **MinIO en producción (G1) — ✅ RESUELTO (2026-06-30).** Se eligió **Cloudflare R2**
      (S3-compatible). Las subidas caen en el bucket `excelsia-documents`, verificado en prod.
      El fix fue la **config del cliente S3** (`StorageService`), no las env vars: `region: 'auto'`,
      `forcePathStyle: true`, endpoint `https://<MINIO_ENDPOINT>` con el scheme agregado una sola vez,
      puerto leído de `MINIO_PORT` (443) y credenciales de `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`
      (antes el cliente leía `MINIO_API_PORT`/`MINIO_ROOT_*`, por eso caía a DB-blob). El bucket ahora
      resuelve de `MINIO_BUCKET`. Los documentos ya no van a blob en PostgreSQL.
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
- [ ] **Habilitación por faena (V2 de HR-016).** Crear `faena` como entidad con su dossier de
      documentos/certificaciones obligatorios, para cruzar qué trabajador está habilitado para cuál
      faena. Hoy el endpoint `disponibilidad-servicio` expone solo disponibilidad
      (vacaciones/licencias/permisos), no habilitación.

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

- [ ] §1 (QA de permisos, incluyendo §1.3 datos sensibles) — completo y sin desvíos. ← **único gate duro pendiente**
- [ ] §2 (cálculo de finiquito verificado a mano) — fuertemente recomendado (es una _estimación_, no bloquea el desbloqueo).
- [x] §4 MinIO (G1) — ✅ resuelto y verificado en producción (2026-06-30, Cloudflare R2).

Con §4-MinIO (G1) ya resuelto, el **único gate duro pendiente para exponer es §1 (QA de
permisos)**. §2 (cálculo de finiquito) y las secciones §3 y §5 son fuertemente recomendadas pero
pueden planificarse como sprint de hardening posterior si se decide conscientemente.

_Responsable: Pato (AGS Soluciones). Este documento se versiona junto al código._
