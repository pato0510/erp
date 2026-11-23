# FR-001-B — Recon web/UX del módulo Finanzas

**Ticket:** FR-001-B (hijo de FR-001; el hermano FR-001-A, api/datos, es de Codex).
**Fecha:** 2026-11-23. **Rama:** `review/fr-ola0`. **Ejecutor:** Claude Code.
**Naturaleza:** inventario de solo lectura. No se cambió código, schema, migraciones,
configuración ni datos. No se levantó ni se abrió el stack local (no estaba corriendo:
ningún proceso escuchando en 3000/3001), así que **ninguna pantalla se observó en
ejecución** en esta ola.

Rutas relativas a `apps/web/src/` salvo indicación. `(d)` abrevia `app/(dashboard)`.

## 0. Etiquetas de clasificación

| Etiqueta             | Criterio aplicado                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OPERATIVO_COMPROBADO | Hay evidencia de ejecución: una prueba o una corrida observada y registrada (producción incluida).                           |
| EXISTE_SIN_COMPROBAR | El código está y se lee completo, pero nada registra que se haya ejercitado. La lectura de código por sí sola queda aquí.    |
| PARCIAL              | Existe una parte del proceso; falta otra parte necesaria para cumplirlo, o un defecto visible por código lo deja incompleto. |
| MOCK_DEMO            | La pantalla o el proceso funciona contra datos simulados o valores fijos en el código.                                       |
| AUSENTE              | No existe en la web.                                                                                                         |

**Base de pruebas web: no hay ninguna.** No existen `*.spec.tsx` / `*.test.tsx` en
`apps/web`, `apps/web/project.json` no define target `test` y no hay E2E. Las pruebas de
Finanzas que existen son de servicios del api (p. ej.
`apps/api/src/modules/movements/movement-recategorization.service.spec.ts`,
`apps/api/src/modules/tax/tax.service.spec.ts`), dominio de FR-001-A: prueban el backend,
no la pantalla. Por eso una pantalla solo llega a OPERATIVO_COMPROBADO aquí cuando
`CLAUDE.md` o los documentos registran una corrida real del proceso.

## 1. Cómo se llega a Finanzas (B2)

- **Hub** `/modulos`: tarjeta `finanzas` → `href: '/dashboard'` (`app/modulos/page.tsx:37-41`).
  ACCESS-002 OCULTA la tarjeta para quien tiene Finanzas bloqueado.
- **Sidebar** `components/sidebars/FinanceSidebar.tsx:25-38`: Dashboard · Movimientos ·
  Caja · Banco · Tributario · Conciliación · Cierre · Alertas · Reportes · Categorías ·
  Contrapartes · Configuración. Badge de alertas CRITICAL en «Alertas» con
  `GET /api/alerts` (`FinanceSidebar.tsx:45-54`); además hace un
  `GET /api/alerts/thresholds` cuyo resultado se descarta (`FinanceSidebar.tsx:47`).
- **Rutas planas** bajo `(dashboard)` sin prefijo `/finanzas` (convención documentada en
  `docs/EXCELSIA-TECHNICAL-HANDOFF.md:98`, confirmada en el árbol: no existe
  `app/(dashboard)/finanzas/` ni `/presupuestos`).
- **Selección de sidebar**: `(d)/layout.tsx:62-94` elige por prefijo; `FinanceSidebar` es
  el **fallback** de cualquier ruta que no sea de otro módulo (incluidas las compartidas
  `/configuracion` y `/notificaciones`).
- **Acceso por perfil (ACCESS-002, interino 2026-10-27)**:
  `lib/moduleAccess.ts` define `FINANZAS_ROUTE_PREFIXES` (`/dashboard`, `/movimientos`,
  `/caja`, `/banco`, `/tributario`, `/conciliacion`, `/cierre`, `/alertas`, `/reportes`,
  `/categorias`, `/contrapartes`) — copia manual de `navItems` del sidebar menos
  `/configuracion`. `(d)/layout.tsx:105` pinta `ModuleAccessDenied` en vez de los hijos si
  la ruta está bloqueada; en rutas compartidas muestra `RestrictedSidebar` (`layout.tsx:78`,
  `:92`). `hooks/useModuleAccess.ts` (`canSee`) oculta Períodos y Umbrales en
  `/configuracion` (`(d)/configuracion/page.tsx:80-83`), la pestaña «Compromisos
  automáticos» de Operaciones y la tarjeta de contraparte en la ficha de cuenta. El api es
  la autoridad (ACCESS-001); la web solo oculta.
- **Contexto de empresa**: `lib/api.ts:30-54` guarda `selectedCompanyId` en
  `localStorage` y envía `x-company-id` en cada llamada (`api.ts:52-54`, `:117-118`,
  `:143-144`, `:169-170`) con `credentials: 'include'`; `lib/download.ts:6-14` hace lo
  mismo para descargas. **No hay selector de empresa en la web**: login y `useAuth` fijan
  siempre `companies[0]` (`app/(auth)/login/page.tsx:48`, `hooks/useAuth.ts:51-53`). Esto
  contradice `CLAUDE.md:2405` («el frontend ya tiene PICKER»).
- **Entradas desde otros módulos**: ninguna página de otro módulo enlaza a rutas de
  Finanzas (grep de `href`/`router.push`). Puntos de contacto de datos:
  `(d)/comercial/cuentas/[id]/page.tsx:213` (`GET /api/counterparties?limit=200`, tarjeta
  «Contraparte (facturación)»), `components/operations/config/AutoCommitmentsTab.tsx:78-180`
  (plantillas de compromisos + `GET /api/categories`), detalle de compromiso con tarjeta
  «Origen del negocio» (`(d)/caja/compromisos/[id]/page.tsx:111-112`), línea de estado del
  hub para `finanzas`.

## 2. Inventario de pantallas (B1)

Columnas por pantalla: propósito · endpoints · componentes · filtros/orden/paginación ·
acciones · estados · permisos · datos fijos/mock · código muerto. Todos los endpoints de
esta sección se encontraron en un controlador del api (§7).

**Permisos, transversal:** ninguna pantalla de Finanzas oculta o deshabilita acciones
según permisos o rol. Ningún archivo de Finanzas usa flags, `currentCompanyRole` ni
`useCanWrite` (grep). Un VIEWER/ANALYST ve todos los botones de escritura y recibe el
error del api al usarlos. Única excepción: `caja/compromisos/[id]` muestra un estado
«forbidden» ante 403 (`(d)/caja/compromisos/[id]/page.tsx:44`).

### 2.1 `/dashboard` — `(d)/dashboard/page.tsx` (1611 líneas)

- **Propósito:** tablero financiero con tres modos «Mes / Año / Historia» (`:467-469`).
- **Endpoints:** `GET /api/dashboard` (`:298`), `GET /api/dashboard/annual?year=` (`:309`),
  `GET /api/dashboard/realtime-cash` (`:331`), `GET /api/dashboard/multiyear?fromYear&toYear`
  (`:345-346`); `PATCH /api/dashboard/goals` vía `components/dashboard/GoalsModal.tsx:48`;
  `GET /api/fiscal-periods?year=2026` vía `components/shared/PeriodSelector.tsx:24`.
- **Componentes:** `PeriodSelector`, `GoalsModal`, `Gauge`, gráficos recharts (barras,
  línea, torta).
- **Filtros:** período (modo Mes, `:486`), año 2019…año actual + 1 (`:439-440`), rango
  Desde/Hasta en Historia (`:1253-1269`). Sin paginación.
- **Acciones:** editar metas (`:641`, `:681`); accesos rápidos a `/movimientos/nuevo`,
  `/caja/nuevo-compromiso`, `/movimientos/importar` (`:742-754`); «Ver todos» a `/caja` y
  `/movimientos` (`:1038`, `:1085`); enlace a `/alertas` (`:537`).
- **Estados:** carga (skeletons), vacíos «Sin datos» (`:908`), «Sin compromisos
  pendientes» (`:1045`), «Sin movimientos confirmados» (`:1092`); errores con toast.
- **Datos fijos:** año inicial `useState(2026)` (`:281`); modo Mes limitado a 2026 por
  `PeriodSelector` (§6, H1).

### 2.2 `/movimientos` — `(d)/movimientos/page.tsx` (760)

- **Propósito:** listado de movimientos con filtros, gráfico y sección «No categorizados (N)»
  al pie (FIN-B).
- **Endpoints:** `GET /api/movements` (lista `:122`, datos de gráfico con `limit=1000`
  `:146-148`, no categorizados `:165`, `:182`); `GET /api/categories` `:209`,
  `GET /api/counterparties?limit=200` `:213`, `GET /api/cost-centers` `:217`,
  `GET /api/fiscal-periods` `:221`; `POST /api/movements/:id/confirm` `:235`;
  `POST /api/movements/:id/cancel` `:242`; export `GET /api/reports/movements/export`
  vía `downloadFile` `:313-314`.
- **Componentes:** `MovementStatusBadge`, `MovementTypeBadge`, tabla propia (`:611`).
- **Filtros:** Tipo, Estado (Borrador/Confirmado/Conciliado/Cancelado), período,
  Categoría, Contraparte, centro de costo, Desde/Hasta, búsqueda por descripción o
  referencia (`:402-515`). **Sin orden por columna.** Paginación de 15 por página
  (`:120`) con anterior/siguiente (`:742`, `:750`); la sección de no categorizados pagina
  aparte (15).
- **Acciones:** nuevo, importar (`:323-329`), confirmar, cancelar con `prompt('Razón de
cancelación:')` (`:240`), exportar XLSX.
- **No hay detalle ni edición de movimiento**: no existe `movimientos/[id]` y la pantalla
  no llama a `PATCH /api/movements/:id` (que el api sí expone).
- **Estados:** carga, vacío «Sin datos suficientes» (gráfico, `:350`), error con
  `role="alert"` (`:546`).
- **Contraparte** limitada a las primeras 200 en el filtro (`:213`).

### 2.3 `/movimientos/nuevo` — `(d)/movimientos/nuevo/page.tsx` (291)

- **Propósito:** alta manual (React Hook Form + Zod).
- **Endpoints:** `POST /api/movements` y `POST /api/movements/:id/confirm` vía
  `hooks/useMovements.ts:65`, `:69`; catálogos `GET /api/categories` `:57`,
  `GET /api/counterparties?limit=100` `:65`, `GET /api/cost-centers` `:67`,
  `GET /api/fiscal-periods?year=2026` `:68`.
- **Acciones:** guardar borrador o guardar y confirmar (`:97`, `:275`).
- **Datos fijos:** períodos solo de 2026 (`:68`); fecha por defecto en UTC
  `new Date().toISOString().split('T')[0]` (`:49`) — después de las 21:00 en Chile propone
  el día siguiente. Contrapartes: primeras 100.

### 2.4 `/movimientos/importar` — `(d)/movimientos/importar/page.tsx` (301)

- **Propósito:** importación masiva CSV/Excel en tres pasos (subir → vista previa →
  resultado).
- **Endpoints:** `POST /api/movements/import/preview` y `POST /api/movements/import` vía
  `hooks/useMovements.ts:79`, `:86`; `GET /api/fiscal-periods?year=2026` (`:49`);
  plantilla `GET /api/movements/import/template` con `window.open('http://localhost:3001/…')`
  (`:106`).
- **Defectos por lectura de código:** (a) URL `localhost` fija: en producción el botón
  apunta a la máquina del usuario; (b) `window.open` no envía `x-company-id` y el endpoint
  exige `PoliciesGuard` (`apps/api/src/modules/movements/import/movement-import.controller.ts:14`,
  `:91-92`), que responde 403 sin ese header (`apps/api/src/modules/common/guards/policies.guard.ts:35-37`).
- **Datos fijos:** períodos solo de 2026.

### 2.5 `/caja` — `(d)/caja/page.tsx` (534)

- **Propósito:** «Caja y Tesorería»: cuentas y saldos, posición de caja, compromisos.
- **Endpoints:** `GET /api/cashflow/position` `:130`, `GET /api/cashflow/accounts` `:131`,
  `GET /api/cashflow/commitments/upcoming` `:133` o
  `GET /api/cashflow/commitments?status=PENDING&limit=50` `:135`,
  `PATCH /api/cashflow/commitments/:id/pay` `:156`, `…/cancel` `:161`,
  `DELETE /api/cashflow/accounts/:id` `:168`, export
  `GET /api/reports/cashflow/export?fiscalPeriodId=` `:191-192`; `POST /api/cashflow/accounts`
  (`components/cashflow/AccountFormModal.tsx:37`); `POST /api/cashflow/accounts/:id/balance`
  y `GET /api/fiscal-periods?year=` (`components/cashflow/OpeningBalanceModal.tsx:44`, `:69`).
- **Componentes:** `PeriodSelector`, `CashPositionCard` (Caja Total, Caja Libre,
  Comprometido, Saldo Apertura, `:355-367`), `AccountFormModal`, `OpeningBalanceModal`,
  `CommitmentStatusBadge`, `MovementTypeBadge`.
- **Filtros:** período; conmutador próximos / «Todos pendientes» (`:395`), máximo 50.
- **Acciones:** crear cuenta, saldo de apertura, eliminar cuenta con `window.confirm`
  (`:166`), marcar compromiso pagado / cancelar (`:485-491`, sin confirmación), nuevo
  compromiso (`:399`), exportar XLSX, abrir detalle (`:460`).
- **Estados:** carga, vacío «Sin compromisos pendientes» (`:443`), «Comienza registrando
  tus cuentas» (`:255`), toasts.

### 2.6 `/caja/nuevo-compromiso` — `(d)/caja/nuevo-compromiso/page.tsx` (243)

- **Endpoints:** `POST /api/cashflow/commitments` `:69`; catálogos `:51`, `:59`;
  `GET /api/fiscal-periods?year=2026` `:61`.
- **Acciones:** crear compromiso (tipo, monto, vencimiento, descripción, categoría,
  período, contraparte). Sin recurrencia en el formulario.
- **Datos fijos:** períodos solo de 2026.

### 2.7 `/caja/compromisos/[id]` — `(d)/caja/compromisos/[id]/page.tsx` (150)

- **Propósito:** detalle de solo lectura de un compromiso con «Origen del negocio»
  (MKT-007b, `components/shared/OriginCard.tsx`).
- **Endpoint:** `GET /api/cashflow/commitments/:id` `:38`.
- **Estados:** carga, 403 «forbidden» (`:44`), error. Sin acciones (pagar/cancelar solo
  desde `/caja`).

### 2.8 `/banco` — `(d)/banco/page.tsx` (509)

- **Propósito:** «Conexiones Bancarias»: conectar una cuenta a un proveedor, sincronizar
  saldo/movimientos, ver movimientos externos e historial.
- **Endpoints:** `GET /api/banking/connections` `:87`, `GET /api/cashflow/accounts` `:88`,
  `GET /api/banking/jobs/:jobId/status` (sondeo) `:114`,
  `GET /api/banking/connections/:id/movements?limit=30` `:128`, `:197`,
  `POST /api/banking/connections` `:161`,
  `POST /api/banking/connections/:id/sync-balance|sync-movements` `:180-181`,
  `GET /api/banking/connections/:id/sync-history` `:212`.
- **MOCK_DEMO:** el proveedor es un `<select disabled>` con una sola opción «Mock
  (Simulación)» (`:264-265`), texto «Fintoc y Unnax disponibles próximamente» (`:267`),
  `provider: 'mock'` fijo (`:163`) e ID por defecto `MOCK-001` (`:78`, `:276`). En el api
  el único proveedor registrado es `mock`
  (`apps/api/src/modules/banking/providers/provider.factory.ts:9-10`).
- **Estados:** carga, vacío «Sin conexiones bancarias» (`:309`), toasts. Últimos 30
  movimientos sin paginación.

### 2.9 `/banco/cartola` — `(d)/banco/cartola/page.tsx` (452)

- **Propósito:** «Importar Cartola Manual», respaldo para 6 bancos.
- **Endpoints:** `GET /api/banking/connections` `:98`, `POST /api/banking/cartola/preview`
  `:119-120`, `POST /api/banking/cartola/import` `:154-155`, plantilla
  `GET /api/banking/cartola/template/:format` con `window.open(\`${API_BASE}…\`)` (`:169`).
- **Defecto por lectura de código:** la plantilla se abre sin `x-company-id` y el endpoint
  exige `PoliciesGuard`
  (`apps/api/src/modules/banking/cartola/cartola-import.controller.ts:65`, `:134-135`) →
  403 esperado. `API_BASE` local duplicado (`:75`).
- **Dependencia:** exige elegir una **conexión bancaria**, que hoy solo puede ser `mock`
  (§2.8): la cartola real se importa colgada de una conexión simulada.

### 2.10 `/tributario` — `(d)/tributario/page.tsx` (1077)

- **Propósito:** documentos SII sincronizados vía BaseAPI, resumen tributario,
  sincronización, pendientes de categorizar.
- **Endpoints:** `GET /api/fiscal-periods?year=` `:205`, `POST /api/fiscal-periods` `:259`,
  `GET /api/tax/summary?fiscalPeriodId=` `:242`, `GET /api/tax/documents` `:291`,
  `GET /api/tax/pending-categorization` `:305`, `POST /api/tax/test-connection` `:331`,
  `POST /api/tax/counterparty-giro/backfill` `:362`, `POST /api/tax/sync-all` `:393`,
  `POST /api/tax/sync` `:419`, `GET /api/categories?type=` `:973`,
  `PATCH /api/movements/:id` (categorizar) `:987`.
- **Componentes:** `SummaryCard` local, `TaxDocumentTypeBadge`, `CategorizeModal`
  (`:948`), `Toast`.
- **Filtros:** año 2019…actual y mes en botones (`:465-530`); pestañas de dirección
  Emitidos / Recibidos / Todos (`:801-804`) y búsqueda «por RUT o nombre» (`:827`); sin
  filtro de estado; paginación de 20 (`PAGE_SIZE`, `:131`, `:920-934`).
- **Acciones:** crear período fiscal faltante, probar conexión, sincronizar
  Emitidos/Recibidos/Todo, «Recuperar giros desde SII», categorizar un movimiento
  pendiente.
- **MOCK_DEMO / fijo en código:** la tarjeta de conexión es estática — siempre
  «Conectado al SII vía BaseAPI · Activo» con `SII_COMPANY_NAME = 'AGS SOLUTIONS SPA'` y
  `SII_COMPANY_RUT` constantes (`:58-59`, `:552-559`); no se lee de ningún endpoint. La
  sección de sincronización se titula «Sincronización con SII (mock)» (`:630`) aunque el
  proveedor real es BaseAPI.
- **Estados:** carga, «Selecciona o crea un período fiscal…», resumen efímero de la
  sincronización, toasts.

### 2.11 `/conciliacion` — `(d)/conciliacion/page.tsx` (776)

- **Propósito:** cruzar movimientos bancarios externos, documentos tributarios y
  movimientos internos.
- **Endpoints:** `GET /api/reconciliation/workbench` `:136`, `:580`,
  `GET /api/reconciliation/kpis` `:137`, `POST /api/reconciliation/run` `:161`,
  `PATCH /api/reconciliation/matches/:id/confirm` `:189`, `…/reject` `:205`,
  `POST /api/reconciliation/matches/manual` `:621`, búsquedas `GET /api/tax/documents`
  `:547` y `GET /api/movements` `:567`.
- **Componentes:** `PeriodSelector`, `MatchCard`, `ConfidenceBadge`, `TaxDocumentTypeBadge`.
- **KPIs:** % conciliado, conciliados automáticamente, sugerencias pendientes, sin
  conciliar, discrepancia total (`:269-306`).
- **Acciones:** ejecutar conciliación automática, confirmar/rechazar sugerencias,
  «Conciliar manualmente» desde un movimiento bancario o un documento (`:424`, `:471`).
- **Solo 1:1, sin importe:** el cuerpo manual lleva únicamente IDs (`:612-619`), igual que
  `ManualMatchDto` (`externalMovementId`, `taxDocumentId`, `movementId`). No hay
  asignación parcial ni reparto (R08, T01–T05).
- **Dependencia:** los movimientos bancarios externos solo entran por la conexión mock o
  por cartola colgada de ella (§2.8–2.9).

### 2.12 `/cierre` — `(d)/cierre/page.tsx` (675)

- **Propósito:** cierre mensual OPEN → IN_REVIEW → CLOSED con checklist y resumen.
- **Endpoints:** `GET /api/fiscal-periods` `:83`, `GET /api/fiscal-periods/:id` `:100`,
  `GET /api/closing/checklist` `:101`, `GET /api/closing/summary` `:109`, `:206`,
  `PATCH /api/fiscal-periods/:id/status` `:144`, `POST /api/closing/close` `:163`,
  `POST /api/closing/reopen` `:184`.
- **Componentes:** `ChecklistItem`, diálogo de confirmación local.
- **Acciones:** iniciar revisión, cerrar con observaciones, reabrir con motivo, ver
  resumen.
- **Permisos:** el texto dice «Solo un ADMIN puede reabrir» (`:324`, `:371`, `:408`), pero
  el botón «Reabrir período» se muestra a todos (`:375-385`); decide el api.

### 2.13 `/alertas` — `(d)/alertas/page.tsx` (242)

- **Propósito:** alertas financieras y umbrales.
- **Endpoints:** `GET /api/alerts` `:50`, `GET /api/alerts/thresholds` `:51`,
  `POST /api/alerts/generate` `:74`, `PATCH /api/alerts/:id/dismiss` `:84`,
  `PATCH /api/alerts/thresholds` `:91`.
- **Acciones:** «Generar Alertas» manual (`:119`), descartar, configurar umbrales.
- **Estado vacío:** pide presionar «Generar Alertas» (`:167`): las alertas no se generan
  solas desde esta pantalla. `PATCH /api/alerts/:id/resolve` existe en el api y la web no
  lo usa.

### 2.14 `/reportes` — `(d)/reportes/page.tsx` (284)

- **Propósito:** «Reportes y Exportaciones»: movimientos XLSX, caja XLSX por período,
  resumen ejecutivo imprimible.
- **Endpoints:** `GET /api/reports/movements/export` `:34`,
  `GET /api/reports/cashflow/export?fiscalPeriodId=` `:47-48`,
  `GET /api/reports/executive-summary` `:62`.
- **Acciones:** descargar, ver resumen, imprimir con `window.print()` (`:163`).
- **Datos fijos:** período vía `PeriodSelector` (solo 2026).

### 2.15 `/categorias` — `(d)/categorias/page.tsx` (519)

- **Endpoints:** `GET /api/categories?type=&isActive=` `:55-56`, `POST /api/categories`
  `:92`, `PATCH /api/categories/:id` `:87`, `:111`, `DELETE /api/categories/:id` `:108`,
  `DELETE /api/categories/:id/permanent` `:130`.
- **Acciones:** pestañas Ingreso/Egreso, crear/editar (un nivel de padre: `:141-143`),
  activar/desactivar, eliminar permanente con `window.confirm` (`:125`), enlace a reglas
  (`:154`).

### 2.16 `/categorias/reglas` — `(d)/categorias/reglas/page.tsx` (761)

- **Endpoints:** `GET /api/category-rules` `:102`, `GET /api/categories?type=INCOME|EXPENSE`
  `:103-104`, `POST /api/category-rules` `:549`, `PATCH /api/category-rules/:id` `:125`,
  `:547`, `DELETE /api/category-rules/:id` `:142`, `POST /api/category-rules/test` `:350`;
  `POST /api/movements/recategorize` (preview `dryRun` y aplicación) vía
  `components/movements/RecategorizePanel.tsx:32`, `:52`, `:56`.
- **Acciones:** CRUD de reglas `RUT` / `GIRO` / `KEYWORD` (`:21`, `:63`), activar/desactivar,
  panel de prueba, recategorizar con vista previa y aplicación, por período.

### 2.17 `/contrapartes` — `(d)/contrapartes/page.tsx` (576)

- **Endpoints:** `GET /api/counterparties?…` `:90`, `POST /api/counterparties` `:129`,
  `PATCH /api/counterparties/:id` `:124`, `:148`, `DELETE /api/counterparties/:id` `:145`.
- **Filtros:** búsqueda por nombre o RUT (`:189`), tipo Cliente/Proveedor/Banco/Gobierno/
  Otro (`:198-203`); paginación (`:328-342`).
- **Acciones:** crear/editar (nombre, tipo, RUT, email, teléfono, giro), desactivar/activar
  (`:318`).

### 2.18 `/configuracion` (compartida) — `(d)/configuracion/page.tsx` (792)

Partes de Finanzas, visibles solo con `canSee('FINANZAS')` (`:80-83`): períodos fiscales
por año con `GET /api/fiscal-periods/status/:year` (`:398`), `GET /api/fiscal-periods?year=`
(`:416`) y `POST /api/fiscal-periods/generate/:year` (`:442`); umbrales de alertas
`PATCH /api/alerts/thresholds` (`:655`). También empresa y `CompanySettings`
(`:211-245`).

### 2.19 Código muerto o inalcanzable

- `components/tax/SiiConnectionModal.tsx`: no lo importa ningún archivo (grep). Llama a
  `POST /api/sii/connection/certificate` y `POST /api/sii/connection/test` (`:77-79`),
  flujo de certificado (LibreDTE) sin superficie en la web.
- Sin pantalla para: centros de costo (el api expone CRUD; la web solo lee la lista),
  edición de movimiento, resolución de alertas, `GET /api/cashflow/free`,
  `GET /api/movements/summary`, `GET /api/reconciliation/matches`,
  `GET /api/dashboard/goals` (las metas llegan dentro de `GET /api/dashboard`; verificar en
  FR-001-A).

## 3. Hechos transversales de UI (B3)

- **Dinero:** `formatCLP` (`lib/formatters.ts:1-11`), `Intl.NumberFormat('es-CL', CLP)`,
  0 decimales; `null`/`undefined`/`NaN` → `$0` (un dato faltante se ve como cero). Hace
  `parseFloat` de strings Decimal: correcto para CLP entero, no para moneda con decimales.
- **Fechas:** Finanzas usa `formatDate` (`lib/formatters.ts:13-16`), que hace
  `new Date(x).toLocaleDateString('es-CL')` en la zona del navegador. Los campos
  `@db.Date` de Finanzas (`Movement.date` `movements.prisma:33`, `Commitment.dueDate`
  `cashflow.prisma:67`, `TaxDocument.issueDate` `tax.prisma:33`, movimiento bancario
  `banking.prisma:60`) llegan como medianoche UTC; en Chile (UTC−3/−4) se pintarían como
  el día anterior. Es el mismo mecanismo que COM-025 corrigió en Comercial con
  `formatDbDate` (`lib/dates.ts:43`). **Ningún archivo de Finanzas usa `lib/dates.ts`.**
  Ocurrencias: `(d)/movimientos/page.tsx:676`, `(d)/caja/page.tsx:451`,
  `(d)/caja/compromisos/[id]/page.tsx:106`, `:117`, `(d)/banco/page.tsx:473`,
  `(d)/banco/cartola/page.tsx:354`, `(d)/tributario/page.tsx:882`,
  `(d)/conciliacion/page.tsx:408`, `:553`, `:573`, `:594`, `(d)/dashboard/page.tsx:1123`.
  No observado en ejecución (sin stack): probable por código.
  Fechas «hoy» en UTC: `(d)/movimientos/nuevo/page.tsx:49`, nombres de archivo de export
  `(d)/movimientos/page.tsx:312`, `(d)/caja/page.tsx:190`, `(d)/reportes/page.tsx:33`, `:46`.
- **Períodos:** `components/shared/PeriodSelector.tsx:24` pide solo
  `?year=2026`; lo usan dashboard (modo Mes), caja, conciliación y reportes. Mismo valor
  fijo en `(d)/movimientos/nuevo/page.tsx:68`, `(d)/movimientos/importar/page.tsx:49`,
  `(d)/caja/nuevo-compromiso/page.tsx:61`. Tributario y configuración sí calculan el año.
- **Tablas:** cada pantalla arma su `<table>`; no hay componente compartido de tabla,
  ni orden por columna en ninguna pantalla de Finanzas (0 `aria-sort`), ni `scope` salvo
  en movimientos.
- **Componentes reutilizados:** `PeriodSelector`, `Toast`, `OriginCard` (compartidos);
  badges por dominio (`MovementStatusBadge`, `CommitmentStatusBadge`,
  `TaxDocumentTypeBadge`, `ConfidenceBadge`). Diálogos: `window.confirm`/`prompt` en
  movimientos, caja, categorías y reglas; modales locales en el resto. No usan
  `DialogShell` (patrón de foco de COM-027).
- **Tokens de tema:** convivencia de dos estilos. Dashboard, movimientos, caja, categorías
  y contrapartes usan sobre todo valores arbitrarios `text-[var(--text-primary)]`
  (102, 40, 45, 23 y 28 ocurrencias), mientras banco y tributario usan las utilidades de
  UI-001 (`text-fg`, `bg-card`, `border-line`). Colores semánticos crudos (`bg-blue-600`,
  `text-green-600`, `bg-yellow-50`…) permitidos por la regla «`dark:` solo semántico».
  Entradas en `apps/web/scripts/theme-allowlist.json` para dashboard (8), movimientos (1),
  contrapartes (4) y reglas (1).
- **Móvil a 390 px (solo lectura de código):** hay 12 `<table>` en las páginas de
  Finanzas; tienen `overflow-x-auto` en el archivo movimientos, tributario, dashboard y
  conciliación (1 contenedor para 2 tablas); caja, banco (2), cartola, importar y reportes
  no tienen ninguno. Formularios de ancho fijo `max-w-3xl` /
  `max-w-lg`. Prefijos responsivos `sm:`/`md:` casi ausentes en movimientos, banco,
  cartola y alertas (0).
- **Accesibilidad:** `aria-*` escaso (0 en banco, cartola, conciliación, cierre, alertas,
  reportes, importar, nuevo movimiento y nuevo compromiso); botones de icono con `aria-label` solo en algunos casos (eliminar cuenta,
  editar metas, paginación). Errores con `role="alert"` solo en movimientos (`:546`).
  Estados de carga como skeletons sin `aria-busy` (salvo backfill de giro).

## 4. Clasificación (B4)

### 4.1 Pantallas

| Ruta                        | Archivo                              | Clasificación        | Motivo                                                                                                                         |
| --------------------------- | ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/dashboard`                | `(d)/dashboard/page.tsx`             | EXISTE_SIN_COMPROBAR | Sin corrida registrada; modo Mes limitado a 2026                                                                               |
| `/movimientos`              | `(d)/movimientos/page.tsx`           | EXISTE_SIN_COMPROBAR | Sin corrida registrada                                                                                                         |
| `/movimientos/nuevo`        | `(d)/movimientos/nuevo/page.tsx`     | EXISTE_SIN_COMPROBAR | Períodos solo 2026                                                                                                             |
| `/movimientos/importar`     | `(d)/movimientos/importar/page.tsx`  | PARCIAL              | Importación por código completa; plantilla rota por código (localhost + sin header)                                            |
| `/caja`                     | `(d)/caja/page.tsx`                  | EXISTE_SIN_COMPROBAR | Períodos solo 2026                                                                                                             |
| `/caja/nuevo-compromiso`    | `(d)/caja/nuevo-compromiso/page.tsx` | EXISTE_SIN_COMPROBAR | Períodos solo 2026                                                                                                             |
| `/caja/compromisos/[id]`    | `(d)/caja/compromisos/[id]/page.tsx` | EXISTE_SIN_COMPROBAR | Solo lectura                                                                                                                   |
| `/banco`                    | `(d)/banco/page.tsx`                 | MOCK_DEMO            | Único proveedor `mock`                                                                                                         |
| `/banco/cartola`            | `(d)/banco/cartola/page.tsx`         | PARCIAL              | Importación por código; requiere conexión mock; plantilla 403 por código                                                       |
| `/tributario`               | `(d)/tributario/page.tsx`            | PARCIAL              | Sync y categorización comprobados en producción; tarjeta de conexión fija con AGS y rótulo «(mock)»                            |
| `/conciliacion`             | `(d)/conciliacion/page.tsx`          | PARCIAL              | Exacta y manual 1:1; sin parciales; banco solo vía mock/cartola                                                                |
| `/cierre`                   | `(d)/cierre/page.tsx`                | EXISTE_SIN_COMPROBAR | —                                                                                                                              |
| `/alertas`                  | `(d)/alertas/page.tsx`               | EXISTE_SIN_COMPROBAR | Generación manual                                                                                                              |
| `/reportes`                 | `(d)/reportes/page.tsx`              | EXISTE_SIN_COMPROBAR | Períodos solo 2026                                                                                                             |
| `/categorias`               | `(d)/categorias/page.tsx`            | EXISTE_SIN_COMPROBAR | —                                                                                                                              |
| `/categorias/reglas`        | `(d)/categorias/reglas/page.tsx`     | EXISTE_SIN_COMPROBAR | Camino de reglas sin ejercitar en producción a 2026-08-05 (`CLAUDE.md:2358-2384`, «NO EJERCITADO»); nada posterior lo registra |
| `/contrapartes`             | `(d)/contrapartes/page.tsx`          | EXISTE_SIN_COMPROBAR | —                                                                                                                              |
| `/configuracion` (Finanzas) | `(d)/configuracion/page.tsx`         | EXISTE_SIN_COMPROBAR | —                                                                                                                              |

### 4.2 Procesos visibles

| Proceso                                                      | Clasificación                         | Evidencia / motivo                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sincronizar documentos SII (Emitidos / Recibidos / Todo)     | OPERATIVO_COMPROBADO                  | 318 corridas `baseapi` en producción (`CLAUDE.md:2635-2642`); re-sync idempotente verificado por el fundador (`CLAUDE.md:2377`). El api no tiene scheduler SII y el único llamador web de `POST /api/tax/sync(-all)` es `/tributario`. |
| Recuperar giros desde SII                                    | OPERATIVO_COMPROBADO                  | Ejecutado en producción el 2026-09-16, devolvió 0 (`CLAUDE.md:415`)                                                                                                                                                                    |
| Categorizar un movimiento pendiente (modal de `/tributario`) | OPERATIVO_COMPROBADO (por inferencia) | Caso COPEC: recategorización por una persona en la UI el 2026-08-05 (`CLAUDE.md:2385-2397`). Antes de FIN-B, el único camino web que cambia `categoryId` es `PATCH /api/movements/:id` en `(d)/tributario/page.tsx:987`.               |
| Ver resumen y documentos tributarios por período             | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Estado de conexión SII                                       | MOCK_DEMO                             | Tarjeta fija (`(d)/tributario/page.tsx:58-59`, `:552-559`)                                                                                                                                                                             |
| Crear / confirmar / cancelar movimiento                      | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Editar un movimiento / ver su detalle                        | AUSENTE                               | Sin ruta ni llamada a `PATCH` desde movimientos                                                                                                                                                                                        |
| Importar movimientos (CSV/Excel)                             | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Descargar plantilla de movimientos                           | PARCIAL                               | `localhost` + sin `x-company-id` (`(d)/movimientos/importar/page.tsx:106`)                                                                                                                                                             |
| Exportar movimientos XLSX                                    | EXISTE_SIN_COMPROBAR                  | Existe un `movimientos-2026-04-22.xlsx` fuera del repo (`~/Desktop/excelsia-erp/`); indicio, no registro                                                                                                                               |
| Recategorizar por reglas (preview + aplicar)                 | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| CRUD de reglas y prueba de regla                             | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Cuentas bancarias y saldo de apertura                        | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Conectar banco y sincronizar                                 | MOCK_DEMO                             | `provider.factory.ts:9-10`                                                                                                                                                                                                             |
| Importar cartola                                             | PARCIAL                               | Requiere conexión mock                                                                                                                                                                                                                 |
| Compromisos: crear / pagar / cancelar / ver                  | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Posición de caja y export de caja                            | EXISTE_SIN_COMPROBAR                  | Limitado a períodos 2026                                                                                                                                                                                                               |
| Conciliación automática exacta y sugerencias                 | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Conciliación manual 1:1                                      | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Conciliación parcial / reparto                               | AUSENTE                               | `ManualMatchDto` sin importe                                                                                                                                                                                                           |
| Cierre mensual (revisión, cierre, reapertura)                | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Alertas: generar, descartar, umbrales                        | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Resolver alerta                                              | AUSENTE (en web)                      | Endpoint sin superficie                                                                                                                                                                                                                |
| Resumen ejecutivo imprimible                                 | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Categorías y contrapartes (CRUD)                             | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Centros de costo (gestión)                                   | AUSENTE (en web)                      | Solo lectura en selects                                                                                                                                                                                                                |
| Generar períodos fiscales del año                            | EXISTE_SIN_COMPROBAR                  | —                                                                                                                                                                                                                                      |
| Cambiar de empresa                                           | AUSENTE                               | Siempre `companies[0]`                                                                                                                                                                                                                 |
| Conexión SII por certificado                                 | AUSENTE (código muerto)               | `SiiConnectionModal` sin importar                                                                                                                                                                                                      |

## 5. Cobertura F01–F18 del lado web (B5)

| F   | Capacidad                                          | Pantallas                                                     | Clasificación        | Nota                                                                                                                  |
| --- | -------------------------------------------------- | ------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| F01 | Cuentas bancarias y sincronización                 | `/caja` (cuentas), `/banco`, `/banco/cartola`                 | MOCK_DEMO            | Cuentas manuales existen; la sincronización solo con `mock`; cartola cuelga de conexión mock                          |
| F02 | Documentos SII                                     | `/tributario`                                                 | OPERATIVO_COMPROBADO | Para AGS: sync real en producción. Identidad de empresa fija en pantalla y credenciales por variable de entorno (api) |
| F03 | Movimientos (listas, detalle, filtros, pendientes) | `/movimientos`, `/movimientos/nuevo`, `/movimientos/importar` | PARCIAL              | Lista, filtros y «No categorizados»; sin detalle, sin edición, sin orden                                              |
| F04 | Conciliación (incl. parcial)                       | `/conciliacion`                                               | PARCIAL              | Exacta + manual 1:1; parcial AUSENTE                                                                                  |
| F05 | Clasificación y corrección                         | `/tributario` (modal), `/categorias/reglas` (recategorizar)   | PARCIAL              | Corrección individual solo para pendientes SII; no desde movimientos                                                  |
| F06 | Flujo de caja                                      | `/caja`, `/dashboard`, `/reportes`                            | PARCIAL              | Posición y gráficos; sin flujo por períodos × categorías ni distinción fecha bancaria/imputada                        |
| F07 | Personalización del flujo                          | —                                                             | AUSENTE              | —                                                                                                                     |
| F08 | Calendario financiero                              | `/caja` (lista de compromisos)                                | PARCIAL              | Lista con vencimiento; sin vista calendario; los compromisos no están en el calendario maestro de Gestión             |
| F09 | Cuentas por cobrar                                 | —                                                             | AUSENTE              | Sin saldo pendiente por documento emitido                                                                             |
| F10 | Cuentas por pagar                                  | —                                                             | AUSENTE              | Ídem para recibidos                                                                                                   |
| F11 | Cotizaciones y facturación/emisión                 | — (cotizaciones viven en `/comercial`)                        | AUSENTE              | En Finanzas no hay cotización ni emisión; las cotizaciones de COM-010 son de Comercial                                |
| F12 | Proyectos / centros de costo                       | `/movimientos` (select y filtro)                              | PARCIAL              | Un centro por movimiento; sin gestión, sin reparto                                                                    |
| F13 | Reglas de automatización                           | `/categorias/reglas`                                          | EXISTE_SIN_COMPROBAR | Solo categorización; no conciliación automática configurable                                                          |
| F14 | Categorías, subcuentas, entidades                  | `/categorias`, `/contrapartes`                                | EXISTE_SIN_COMPROBAR | Un nivel de subcategoría en la UI                                                                                     |
| F15 | IA y canales (WhatsApp)                            | —                                                             | AUSENTE              | —                                                                                                                     |
| F16 | API / MCP propios                                  | —                                                             | AUSENTE              | Solo el REST interno de la app                                                                                        |
| F17 | Multiempresa                                       | `lib/api.ts` (`x-company-id`)                                 | PARCIAL              | Header por empresa; sin selector; AGS fijo en `/tributario`                                                           |
| F18 | Estado de resultados / contabilidad                | `/dashboard` (margen), `/reportes` (resumen ejecutivo)        | AUSENTE              | Ingresos − egresos no es un estado de resultados                                                                      |

## 6. Deuda de UX observable (B6) — solo hechos, sin propuestas

H1. **Períodos fijos en 2026.** `components/shared/PeriodSelector.tsx:24` y tres
formularios (`(d)/movimientos/nuevo/page.tsx:68`, `(d)/movimientos/importar/page.tsx:49`,
`(d)/caja/nuevo-compromiso/page.tsx:61`) solo ofrecen períodos de 2026. Desde el
2027-01-01 no se podría elegir el período corriente en dashboard (modo Mes), caja,
conciliación, reportes, alta de movimiento, importación ni alta de compromiso; hoy ya no se
pueden consultar 2019–2025 en esas pantallas, pese a que hay datos SII desde 2019.
H2. **Identidad de AGS fija en una pantalla multi-tenant.**
`(d)/tributario/page.tsx:58-59` muestra «AGS SOLUTIONS SPA» y su RUT a cualquier empresa,
con estado «Activo» que no consulta nada. Del lado api (dominio de FR-001-A, solo como
referencia cruzada): `apps/api/src/modules/tax/tax.service.ts:109-115`, `:230-231` toma
`SII_RUT` / `SII_PASSWORD` del entorno, un único contribuyente por despliegue.
H3. **Rótulo «(mock)» sobre la sincronización real** (`(d)/tributario/page.tsx:630`).
H4. **Plantillas de importación rotas por código**: `(d)/movimientos/importar/page.tsx:106`
(`localhost` + sin header) y `(d)/banco/cartola/page.tsx:169` (sin header) contra
endpoints con `PoliciesGuard`.
H5. **Fechas civiles con posible desfase de un día** (§3, Fechas): 12 renders de `@db.Date`
con `formatDate` en zona del navegador; fechas por defecto en UTC.
H6. **Sin permisos en la UI**: ninguna pantalla oculta escrituras según capacidad; el
botón «Reabrir período» se muestra a todos aunque el texto diga «Solo un ADMIN»
(`(d)/cierre/page.tsx:324`, `:375-385`).
H7. **Callejones sin salida**: no hay detalle/edición de movimiento; el detalle de
compromiso no permite pagar ni cancelar; la conexión bancaria solo admite «Mock
(Simulación)» con «Fintoc y Unnax disponibles próximamente» (`(d)/banco/page.tsx:264-267`);
las alertas vacías piden generarlas a mano (`(d)/alertas/page.tsx:167`).
H8. **Confirmaciones nativas del navegador** para acciones destructivas o con motivo:
`prompt` en cancelar movimiento (`(d)/movimientos/page.tsx:240`), `window.confirm` en
eliminar cuenta (`(d)/caja/page.tsx:166`), eliminar categoría permanente
(`(d)/categorias/page.tsx:125`) y regla (`(d)/categorias/reglas/page.tsx:140`); pagar y
cancelar compromiso sin confirmación (`(d)/caja/page.tsx:156-161`).
H9. **Listas truncadas sin aviso**: contrapartes 200 en el filtro de movimientos
(`(d)/movimientos/page.tsx:213`) y 100 en los altas (`(d)/movimientos/nuevo/page.tsx:65`,
`(d)/caja/nuevo-compromiso/page.tsx:59`); compromisos pendientes 50 (`(d)/caja/page.tsx:135`);
movimientos bancarios 30 (`(d)/banco/page.tsx:128`).
H10. **Sin selector de empresa** pese a que el modelo lo admite (`hooks/useAuth.ts:51-53`,
`app/(auth)/login/page.tsx:48`); deriva documental en `CLAUDE.md:2405`.
H11. **Inconsistencia visual**: dos sistemas de estilo en el mismo módulo (§3, Tokens);
tablas sin orden por columna; tablas de caja/banco/cartola/conciliación/reportes sin
contenedor de scroll horizontal (riesgo a 390 px, no observado).
H12. **Accesibilidad**: `aria-*` ausente en nueve pantallas; errores sin `role="alert"`
fuera de movimientos; modales locales sin el patrón de foco de `DialogShell`.
H13. **Llamada sin uso** en el sidebar: `GET /api/alerts/thresholds` cuyo resultado se
descarta (`components/sidebars/FinanceSidebar.tsx:47`).
H14. **Código muerto**: `components/tax/SiiConnectionModal.tsx` sin importar.

## 6.1 Explicabilidad, densidad y funciones sin uso aparente (extensión FR-000-A)

Insumo para D-003 (explicabilidad, simplificación, completitud). Solo hechos, sin
propuestas. «Sin explicación visible» = la pantalla no muestra qué registros, fechas,
filtros o estados entran en la cifra, ni permite abrir sus componentes. Criterio de
conteo de densidad (lectura de código, `grep`, por archivo de página): **widgets** =
tarjetas de cifra + gráficos + tablas + secciones con título; **columnas** = `<th>`;
**acciones** = `<button>` + `<Link>` (incluye conmutadores, paginación y cerrar);
**controles** = `<input>`/`<select>`/`<textarea>`. Los modales hijos cuentan en su
archivo padre.

### Hechos transversales

- **Ninguna cifra es navegable.** Las tarjetas de cifra son `div` sin `onClick`, `href` ni
  ayuda: `KpiCard` (`(d)/dashboard/page.tsx:185-247`), `SummaryCard`
  (`(d)/tributario/page.tsx:133-169`), `KpiCard` de conciliación
  (`(d)/conciliacion/page.tsx:73-110`), `CashPositionCard`
  (`components/cashflow/CashPositionCard.tsx:21-45`), `SummaryStat`
  (`(d)/cierre/page.tsx:668`). Ningún `title`, `aria-describedby` ni ícono de ayuda en
  ellas. Los únicos tooltips son los de los gráficos recharts, que muestran el valor del
  punto, no su composición.
- **Ninguna cifra declara qué estados entran.** La lista de movimientos tiene estados
  Borrador / Confirmado / Conciliado / Cancelado (`(d)/movimientos/page.tsx:421-424`), pero
  solo un subtítulo del dashboard dice «N confirmados» / «Confirmados en el año»
  (`(d)/dashboard/page.tsx:577-579`). El resto de los totales no indica si incluye
  borradores, cancelados o movimientos del sync SII.
- **Ninguna cifra declara su criterio de fecha** (fecha del movimiento, emisión del
  documento, vencimiento, fecha bancaria) ni su zona horaria.
- **Mismo nombre, cifras distintas.** «Caja Libre» aparece como «Caja Libre hoy» con
  «Disponible tras compromisos» (`(d)/dashboard/page.tsx:1217-1223`), como barra del
  gráfico de flujo del período (`:994`), como tarjeta con «N% disponible»
  (`(d)/caja/page.tsx:361-364`) y como «Libre» en el resumen de cierre
  (`(d)/cierre/page.tsx:569`), sin aclarar si es foto de hoy o del período. «Balance» es
  Ingresos − Egresos en el dashboard (`(d)/dashboard/page.tsx:580`) y en cierre
  (`(d)/cierre/page.tsx:553`), y Emitidas − Recibidas en tributario
  (`(d)/tributario/page.tsx:610-612`). «Resultado» y «Margen» (`(d)/dashboard/page.tsx:609-621`)
  se calculan sobre movimientos, no sobre un estado de resultados.
- **Sin evidencia de uso.** La web no tiene analítica ni registro de visitas. El uso real
  por función solo puede inferirse de conteos de filas por tabla (FR-001-A, SQL de solo
  lectura de Codex); esta sección marca lo que el código hace inalcanzable o dependiente de
  datos simulados, no lo que la gente usa.

### Por pantalla

| Pantalla                     | (i) Cifras sin explicación visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | (ii) Densidad: widgets · columnas · acciones · controles                                                                                                                               | (iii) Sin punto de entrada visible o sin uso aparente                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`                 | Modo Mes/Año: Ingresos, Egresos (subtítulo «Balance»), Margen %, Resultado (`:595-621`); dos medidores de meta (`:648-704`); «Distribución»/top categorías de ingreso y gasto (`:418-422`); gráfico de flujo Saldo Apertura / Ingresos / Egresos / Caja Libre (`:974-1012`); «Caja Total hoy» y «Caja Libre hoy» (`:1206-1223`). Modo Historia: cuatro KPI históricos (`:1334-1360`), dos gráficos y tabla Año/Ingresos/Egresos/Margen/Resultado (`:1554-1600`). Solo los ingresos dicen «confirmados» | 11 secciones con título, 6 gráficos, 10 tarjetas/medidores, 1 tabla · 6 columnas · 13 acciones · 2 controles; tres modos con contenido distinto                                        | «Editar metas» (`:641`, `:681`) solo como ícono de lápiz; los accesos rápidos duplican el sidebar (`:742-754`)                                                                                                                                                                    |
| `/movimientos`               | «Distribución por categoría» (`:336-372`) calculada en el cliente sobre hasta 1000 filas (`:140-148`) sin indicarlo; montos de fila sin signo ni moneda de origen explicados                                                                                                                                                                                                                                                                                                                           | 1 gráfico, 1 tabla (más la tabla de no categorizados) · 12 columnas · 9 acciones · 9 controles (8 filtros + búsqueda, `:402-515`)                                                      | Sin detalle ni edición de movimiento (`PATCH /api/movements/:id` sin superficie)                                                                                                                                                                                                  |
| `/movimientos/nuevo`         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 0 widgets · 3 acciones · 10 controles                                                                                                                                                  | —                                                                                                                                                                                                                                                                                 |
| `/movimientos/importar`      | Conteos «Listas para importar» / «Se omitirán» (`:159-167`)                                                                                                                                                                                                                                                                                                                                                                                                                                            | 1 tabla · 5 columnas · 5 acciones · 2 controles                                                                                                                                        | Plantilla inalcanzable en producción (H4)                                                                                                                                                                                                                                         |
| `/caja`                      | Caja Total (subtítulo «Ingr: … / Egr: …», en el código separados por una barra vertical, `:355-358`), Caja Libre «N% disponible» (`:361-364`), Comprometido, Saldo Apertura (`:366-367`); saldo por cuenta (`:307`) sin decir si es apertura o actual                                                                                                                                                                                                                                                  | 2 secciones, 4 tarjetas, 1 tabla · 7 columnas · 11 acciones                                                                                                                            | `GET /api/cashflow/free` sin superficie                                                                                                                                                                                                                                           |
| `/caja/nuevo-compromiso`     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 0 widgets · 2 acciones · 8 controles                                                                                                                                                   | Sin recurrencia en el formulario                                                                                                                                                                                                                                                  |
| `/caja/compromisos/[id]`     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 2 bloques · 2 enlaces                                                                                                                                                                  | Pagar/cancelar solo desde `/caja`                                                                                                                                                                                                                                                 |
| `/banco`                     | Montos de movimientos externos en valor absoluto (`:486`)                                                                                                                                                                                                                                                                                                                                                                                                                                              | 1 sección, 2 tablas · 12 columnas · 8 acciones · 3 controles                                                                                                                           | Conexión y sincronización solo con `mock` (`:163`, `:264-267`): sin uso real posible                                                                                                                                                                                              |
| `/banco/cartola`             | Conteos de válidos/omitidos (`:319-327`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 2 secciones, 1 tabla · 6 columnas · 6 acciones · 3 controles                                                                                                                           | Exige una conexión que solo puede ser mock; plantilla 403 (H4)                                                                                                                                                                                                                    |
| `/tributario`                | Facturas Emitidas / Recibidas (total y cantidad), Balance Tributario «Emitidas − Recibidas», Pendientes conciliación (`:596-619`): no dicen si el total es neto o con IVA, ni si incluye notas de crédito, ni qué fecha (emisión vs período) los ubica                                                                                                                                                                                                                                                 | 2 secciones + tarjeta de conexión + bloque de sync + pendientes, 4 tarjetas, 2 tablas · 17 columnas · 16 acciones · 2 controles; selector de 8 años × 12 meses en botones (`:465-530`) | Tarjeta de conexión estática (H2); `SiiConnectionModal` muerto (`components/tax/SiiConnectionModal.tsx`)                                                                                                                                                                          |
| `/conciliacion`              | % Conciliado (con «N de M movimientos bancarios»), Conciliados automáticamente, Sugerencias pendientes, Sin conciliar, Discrepancia total «Suma de diferencias» (`:269-306`): no explica entre qué pares se mide la diferencia                                                                                                                                                                                                                                                                         | 2 secciones, 5 tarjetas, 2 tablas · 13 columnas · 10 acciones · 1 control                                                                                                              | El lado bancario depende de movimientos externos que solo llegan por mock o cartola-sobre-mock; `GET /api/reconciliation/matches` sin superficie                                                                                                                                  |
| `/cierre`                    | Resumen: Ingresos, Egresos, Balance, Apertura, Cierre, Libre, Comprometido (`:543-572`), % de conciliación (`:579-588`), tributario (`:597-610`), categorías (`:631`)                                                                                                                                                                                                                                                                                                                                  | 10 secciones con título · 8 acciones · 3 controles                                                                                                                                     | —                                                                                                                                                                                                                                                                                 |
| `/alertas`                   | Conteos por severidad (`:128-141`), umbral «Actual» (`:202`)                                                                                                                                                                                                                                                                                                                                                                                                                                           | 0 tablas (tarjetas `AlertCard`) · 3 acciones · 3 controles                                                                                                                             | Las alertas no aparecen sin «Generar Alertas» manual (`:119`, `:167`); `PATCH /api/alerts/:id/resolve` sin superficie                                                                                                                                                             |
| `/reportes`                  | Resumen ejecutivo: KPI de caja (`:180-189`), ingresos, egresos, balance, cantidad (`:204-221`), categorías (`:244`)                                                                                                                                                                                                                                                                                                                                                                                    | 7 secciones con título, 1 tabla · 4 columnas · 4 acciones                                                                                                                              | —                                                                                                                                                                                                                                                                                 |
| `/categorias`                | Contador «N sub» (`:262`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | lista · 11 acciones · 4 controles                                                                                                                                                      | —                                                                                                                                                                                                                                                                                 |
| `/categorias/reglas`         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | lista · 12 acciones · 9 controles (incluye panel de prueba; `RecategorizePanel` aparte)                                                                                                | Camino de reglas sin ejercitar en producción a 2026-08-05 (`CLAUDE.md:2358-2384`)                                                                                                                                                                                                 |
| `/contrapartes`              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | lista paginada · 10 acciones · 9 controles                                                                                                                                             | —                                                                                                                                                                                                                                                                                 |
| Sin pantalla (api existente) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                      | Gestión de centros de costo (CRUD `apps/api/src/modules/catalogs/cost-centers.controller.ts:27-64`); `GET /api/movements/summary`; `PATCH /api/movements/:id` desde movimientos; `GET /api/dashboard/goals` (las metas llegan en `GET /api/dashboard`, por confirmar en FR-001-A) |

## 7. Verificaciones

| Comprobación           | Comando / método                                                                                                                                                                                                                                                                                                                     | Resultado                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos web              | `npx tsc -p apps/web/tsconfig.json --noEmit`                                                                                                                                                                                                                                                                                         | Exit 0, sin errores                                                                                                                                 |
| Lint web               | `npx nx lint web`                                                                                                                                                                                                                                                                                                                    | Exit 0: 0 errores, 42 advertencias (las 42 preexistentes de `CLAUDE.md`); 2 en Finanzas: `(d)/dashboard/page.tsx` (1) y `(d)/reportes/page.tsx` (1) |
| Endpoints web ↔ api   | Extracción de las llamadas `apiClient`/`downloadFile`/`window.open` de las 17 páginas, 6 componentes y `hooks/useMovements.ts`, contra los decoradores `@Get/@Post/@Put/@Patch/@Delete` de los controladores de `movements`, `catalogs`, `cashflow`, `banking`, `tax`, `reconciliation`, `closing`, `alerts`, `reports`, `dashboard` | Todas las rutas llamadas existen en un controlador. Sin desajustes de ruta. Defectos de llamada (no de ruta): plantillas sin `x-company-id` (H4)    |
| Rutas citadas          | Cada archivo citado se abrió o se listó en esta sesión                                                                                                                                                                                                                                                                               | Existen                                                                                                                                             |
| Ejecución en navegador | —                                                                                                                                                                                                                                                                                                                                    | No realizada: stack local apagado                                                                                                                   |

Última actualización: 2026-11-23 (FR-001-B + extensión §6.1 de FR-000-A, CC)
