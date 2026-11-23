# Finanzas — Rediseño (FR) · Estado vivo

Única fuente de estado del rediseño de Finanzas. Si otro documento (incluida la fotografía
del paquete en `paquete-traspaso-2026-11-23/`) discrepa con este archivo, manda este
archivo; si este archivo discrepa con el código, manda el código.

## 1. Datos de control

| Campo           | Valor                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fecha           | 2026-11-23                                                                                                                                                                           |
| Rama de trabajo | `review/fr-ola0` (cortada desde `origin/develop` por Patricio; la confirma su salida de git)                                                                                         |
| Ola             | 0 — FR-000 ∥ FR-001-A ∥ FR-001-B                                                                                                                                                     |
| Alcance vigente | Fase de PLAN. Solo documentación: sin cambios de lógica de negocio, schema, migraciones, seeds, configuración, pruebas, dependencias ni UI. Sin escrituras en ninguna base de datos. |
| Producción      | Sin autorización de producción, emisión tributaria, envíos a terceros ni acciones sobre la cuenta de itSave en esta fase.                                                            |

## 2. Roles

- **Director**: Claude en la conversación de claude.ai del proyecto. Planifica, redacta los
  prompts y revisa la evidencia. No abre archivos locales: los informes deben ser
  autocontenidos.
- **Ejecutores**: Claude Code (CC) y Codex, en sesiones paralelas sobre el mismo árbol de
  trabajo, cada una con sus archivos declarados.
- **Patricio (fundador, responsable de producto)**: lleva prompts e informes, es el único
  que ejecuta git y el único que toca producción.

Edición de este directorio en la ola 0: CC es el único editor de `CLAUDE.md`,
`00-ESTADO.md` y `DECISIONES.md`. Codex es el único editor de `FR-001A-RECON-API.md` y
`sql/FR-001A-inventario-solo-lectura.sql`.

## 3. Convención de IDs (D-013)

- `FR-NNN` = «Finanzas Rediseño». Correspondencia 1:1 con el paquete:
  FIN-000 → FR-000 … FIN-038 → FR-038. **FR-009 queda reservado** (como FIN-009).
- Motivo: `FIN-001` ya nombra el trabajo de Presupuestos anuales revertido
  (`docs/EXCELSIA-TECHNICAL-HANDOFF.md` §10) y el Sprint 17 usó `FIN-A` / `FIN-B`
  (`CLAUDE.md:395`, `CLAUDE.md:419`). Comprobado el 2026-11-23: la cadena `FR-0` no
  aparecía en el repositorio antes de esta ola.
- Los archivos del paquete conservan sus IDs `FIN-NNN` originales: léanse como `FR-NNN`.
- IDs de investigación sin cambio: F01–F18 (capacidades), R01–R12 (reglas), T01–T20
  (escenarios de prueba), S01–S23 (fuentes), D-001… (decisiones).
- Subdivisiones con sufijo de letra: `FR-001-A`, `FR-001-B` (método del paquete,
  `METODO_TICKETS.md` §2). El padre y los hijos no se cuentan como entregas distintas.

## 4. Índice de tickets

Tipos y estados según `paquete-traspaso-2026-11-23/METODO_TICKETS.md` §2. Títulos tomados
del backlog del paquete (`BACKLOG_INICIAL.md`).

### Arranque y planificación

| ID       | Título                                                                 | Tipo          | Estado      | Depende de     | Nota                                                                                                   |
| -------- | ---------------------------------------------------------------------- | ------------- | ----------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| FR-000   | Recibir el traspaso y establecer continuidad                           | Ticket        | HECHO       | —              | CC, ola 0. Dictamen del director 2026-11-23; commit pendiente (Patricio)                               |
| FR-001   | Diagnosticar Finanzas y sus dependencias en el ERP real                | Ticket        | EN_CURSO    | FR-000         | Dividido en A y B; cierra con FR-001-A                                                                 |
| FR-001-A | Recon api/datos de Finanzas                                            | Ticket (hijo) | EN_REVISION | FR-000         | Codex · `FR-001A-RECON-API.md` + SQL de solo lectura; corrección FR-001A-B en curso                    |
| FR-001-B | Recon web/UX de Finanzas                                               | Ticket (hijo) | HECHO       | FR-000         | CC · `FR-001B-RECON-WEB.md`; aceptado por el director 2026-11-23                                       |
| FR-002   | Revalidar documentación pública y contratos de itSave                  | Ticket        | EN_CURSO    | FR-000         | CC · `FR-002-INVENTARIO-ITSAVE.md`; solo GET públicos sin credenciales                                 |
| FR-003   | Levantar recorridos y comportamiento observable de la cuenta de itSave | Ticket        | EN_CURSO    | FR-002         | Director con Patricio: recorrido de solo lectura en el navegador integrado, sesión de Patricio (D-012) |
| FR-004   | Definir requisitos y matriz de brechas del módulo objetivo             | Ticket        | PROPUESTO   | FR-001, FR-002 |                                                                                                        |
| FR-005   | Definir navegación, flujos y propuesta de experiencia de uso           | Ticket        | PROPUESTO   | FR-004         |                                                                                                        |
| FR-006   | Diseñar arquitectura integrada, modelo y contratos                     | Ticket        | PROPUESTO   | FR-001, FR-004 |                                                                                                        |
| FR-007   | Planificar integraciones y transición de datos                         | Ticket        | PROPUESTO   | FR-006         |                                                                                                        |
| FR-008   | Consolidar el plan completo y preparar la ejecución                    | Ticket        | PROPUESTO   | FR-004…FR-007  |                                                                                                        |
| FR-009   | (reservado, sin asignación)                                            | —             | —           | —              |                                                                                                        |

### Semillas posteriores (todas POR_REFINAR; dependen de FR-008 por transitividad)

| ID     | Trabajo propuesto                                     | Dependencias propuestas                      |
| ------ | ----------------------------------------------------- | -------------------------------------------- |
| FR-010 | Fundamentos de dinero, fechas y contratos financieros | FR-008                                       |
| FR-011 | Entidades compartidas, empresa y permisos de base     | FR-010                                       |
| FR-012 | Cuentas bancarias e incorporación de movimientos      | FR-011                                       |
| FR-013 | Incorporación de documentos tributarios o comerciales | FR-011                                       |
| FR-014 | Movimientos, búsqueda y clasificación manual          | FR-011, FR-012                               |
| FR-015 | Conciliación de documentos y movimientos              | FR-013, FR-014                               |
| FR-016 | Cuentas por cobrar y por pagar                        | FR-015                                       |
| FR-017 | Flujo de caja y estructura personalizable             | FR-014, FR-015, FR-016                       |
| FR-018 | Calendario de vencimientos y compromisos              | FR-016, FR-017                               |
| FR-019 | Proyección y escenarios de caja                       | FR-017, FR-018                               |
| FR-020 | Proyectos, centros de costo y distribución            | FR-011, FR-014                               |
| FR-021 | Cotizaciones y transición comercial                   | FR-011                                       |
| FR-022 | Emisión de documentos y estados asíncronos            | FR-013, FR-021                               |
| FR-023 | Reglas de clasificación y conciliación automática     | FR-014, FR-015                               |
| FR-024 | Asistencia financiera por IA                          | FR-016, FR-017, FR-018                       |
| FR-025 | API y MCP del ERP                                     | FR-011, FR-016, FR-017                       |
| FR-026 | Canal WhatsApp y notificaciones acordadas             | FR-024, FR-025                               |
| FR-027 | Experiencia multiempresa y consolidación              | FR-011, FR-017                               |
| FR-028 | Reportes y exportaciones de gestión                   | FR-016, FR-017, FR-019, FR-020               |
| FR-029 | Experiencia integrada y tablero financiero            | FR-017, FR-018, FR-020, FR-028               |
| FR-030 | Validación integrada de procesos financieros          | FR-015…FR-018, FR-022, FR-023, FR-025…FR-029 |
| FR-031 | Regresión de módulos consumidores del ERP             | FR-020, FR-022, FR-028, FR-029               |
| FR-032 | Revisión transversal de permisos y operación          | FR-023…FR-027                                |
| FR-033 | Ensayo de transición y preservación de datos          | FR-030, FR-031, FR-032                       |
| FR-034 | Aceptación de uso y guía operativa                    | FR-030, FR-031, FR-032                       |
| FR-035 | Preparación de entrega en staging                     | FR-033, FR-034                               |
| FR-036 | Activación autorizada y verificación en operación     | FR-035                                       |
| FR-037 | Retirada acordada de Finanzas anterior                | FR-036                                       |
| FR-038 | Revisión posterior y cierre de cobertura              | FR-036                                       |

El detalle de cada semilla (cobertura F/R/T, resultado, «antes de ejecutar», verificación
mínima) está en `paquete-traspaso-2026-11-23/BACKLOG_INICIAL.md`. El CSV del paquete es
una fotografía histórica: el estado se lleva solo en esta tabla.

## 4.1 Hallazgos con efecto en producción (fuera del rediseño)

Defectos del módulo actual encontrados por los recon, que afectan a producción con
independencia del rediseño. No son tickets FR: se registran aquí para que Patricio decida
cuándo corregirlos. Todos PROPUESTO.

| ID     | Hallazgo                                                                                                                | Efecto                                                                                                                                                                                                                        | Referencias                                                                                                                                                                                                                                    | Estado                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| FR-H01 | Los selectores de período solo ofrecen 2026                                                                             | El 2027-01-01 deja de poder elegirse el período corriente en dashboard (modo Mes), caja, conciliación, reportes, alta de movimiento, importación y alta de compromiso; hoy no se pueden consultar 2019–2025 en esas pantallas | `FR-001B-RECON-WEB.md` §6 H1: `apps/web/src/components/shared/PeriodSelector.tsx:24`, `app/(dashboard)/movimientos/nuevo/page.tsx:68`, `app/(dashboard)/movimientos/importar/page.tsx:49`, `app/(dashboard)/caja/nuevo-compromiso/page.tsx:61` | PROPUESTO — hotfix pendiente de decisión de Patricio  |
| FR-H02 | Conciliar saca el movimiento de la caja                                                                                 | La conciliación deja el movimiento en `RECONCILED` y los agregados de caja, dashboard y reportes suman solo `CONFIRMED`: el monto conciliado desaparece de ingresos, egresos y caja                                           | `FR-001A-RECON-API.md` §10.1 hallazgo 1 y §4.2; verificado por el director: `reconciliation.service.ts` asigna `'RECONCILED'` y `cashflow.service.ts` agrega `MovementStatus.CONFIRMED`                                                        | PROPUESTO — impacto pendiente del inventario SQL      |
| FR-H03 | `/tributario` muestra a toda empresa el nombre y RUT de AGS fijos en el código y rotula «(mock)» la sincronización real | Datos de otra empresa a la vista y estado de conexión falso; rótulo engañoso                                                                                                                                                  | `FR-001B-RECON-WEB.md` §6 H2 y H3: `app/(dashboard)/tributario/page.tsx:58-59`, `:552-559`, `:630`                                                                                                                                             | PROPUESTO — antes de un cliente #2                    |
| FR-H04 | `CompaniesController` usa `:id` sin igualarlo al `x-company-id` validado                                                | El guard valida la membresía de la empresa del header, pero la operación actúa sobre la empresa de la URL                                                                                                                     | `FR-001A-RECON-API.md` §7.3: `apps/api/src/modules/companies/companies.controller.ts:20`, `companies.service.ts:12`                                                                                                                            | PROPUESTO — arco de hardening, antes de un cliente #2 |

## 5. Mapa de trabajo previo de Finanzas (solo desde documentación)

Fuente: documentos del repositorio. CC no ejecutó git en esta ola; las ramas listadas son
las que nombran los documentos o el encargo y **deben confirmarse con la salida de git de
Patricio**. El código manda sobre cualquier documento.

### 5.1 Finanzas V1 (Sprints 1–8, «V1 COMPLETO EN PRODUCCIÓN»)

Fuente: `CLAUDE.md:332-369` y `docs/EXCELSIA-TECHNICAL-HANDOFF.md` §5.1.

| Sprint                           | Familias / tickets                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Plataforma base              | ARC-001…ARC-007 (Nx, Docker, Prisma, Redis/BullMQ, ESLint, Sentry, CI)                                                                                      |
| 2 — Identidad y multi-tenancy    | TEN-001, IAM-001, IAM-002, IAM-005, TEN-003 (RLS), AUD-001 (triggers de auditoría)                                                                          |
| 3 — Configuración y catálogos    | CFG-001 (config financiera), CAT-001 (categorías), CAT-002 (contrapartes), CAT-003 (centros de costo y períodos fiscales)                                   |
| 4 — Núcleo financiero            | MOV-001 (movimientos), CASH-001 (cuentas, saldos de apertura, compromisos), MOV-002 (importación CSV/Excel), DASH-001/002/003, CASH-002 (pantalla de flujo) |
| 5 — Dashboard, alertas, reportes | DASH-004, ALR-001, REP-001 (export Excel)                                                                                                                   |
| 6 — Integración bancaria         | BNK-001 (adaptador con proveedor **mock**), BNK-002 (sync BullMQ + historial), BNK-003 (cartola manual, 6 bancos)                                           |
| 7 — Tributario y conciliación    | TAX-001 (SII con proveedor mock), REC-001 (motor de conciliación exacta)                                                                                    |
| 8 — Cierre y hardening           | CLS-001 (cierre mensual), SEC-001, QA-001, REL-001                                                                                                          |

### 5.2 Post-V1

- SII-002 (BaseAPI como proveedor real), SII-003 (auto-creación de movimientos desde
  documentos SII), configuración fiscal multi-año, dashboard multi-año, rediseño visual
  «Terminal Noir», selector de módulos (`docs/EXCELSIA-TECHNICAL-HANDOFF.md` §5.1, §8.1).
- Re-sincronización histórica desde 2019 ejecutada en producción
  (`docs/EXCELSIA-TECHNICAL-HANDOFF.md:317`).
- FASE 0 / TAX-001 (2026-08-03): proveedor SII verificado `baseapi`, 318 corridas, 2.046
  documentos sin huellas de mock; se quitó el DEFAULT `'mock-sii'` (`CLAUDE.md:2635`).
- HARDEN-004A `f6855df`: escrituras del sync SII dentro de `executeWithRls`, idempotencia
  verificada en producción (`CLAUDE.md:2358-2384`).
- Integraciones cruzadas: compromisos automáticos desde Operaciones (`domain_events`,
  `docs/EXCELSIA-TECHNICAL-HANDOFF.md` §7), Commitment INCOME desde oportunidad ganada
  (COM-014) y tarjeta «Origen del negocio» (MKT-007b) en el detalle de compromiso.
- ACCESS-001/002 (2026-10-27, interino): `Membership.restrictedModules` bloquea Finanzas
  y/o RRHH sobre el rol (`CLAUDE.md:1255-1256`, `CLAUDE.md:2197-2208`).

### 5.3 Sprint 17

| Ticket                                                                | SHA       | Fuente              |
| --------------------------------------------------------------------- | --------- | ------------------- |
| FIN-A — Giro de contraparte, regla `GIRO`, columnas RUT/giro y export | `368e4d7` | `CLAUDE.md:395-417` |
| FIN-B — Recategorización con reglas + no categorizados al pie         | `d090206` | `CLAUDE.md:419-452` |

### 5.4 Trabajo abandonado o revertido

- **FIN-001 — Presupuestos anuales**: construido localmente en mayo de 2026, nunca
  commiteado ni publicado, revertido entero; el cliente lo quiere rediseñado
  (`docs/EXCELSIA-TECHNICAL-HANDOFF.md` §10). Prototipo en la rama solo-local
  `wip/fin-001-budgets-reference` (commit `25780af`, sin remoto) según
  `docs/TECHNICAL-OWNERSHIP-REPORT.md:108`. Solo referencia, nunca base.

### 5.5 Ramas mencionadas (a confirmar con git)

| Rama                                    | Dónde aparece                            | Estado documental                                             |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `wip/fin-001-budgets-reference`         | `docs/TECHNICAL-OWNERSHIP-REPORT.md:108` | Solo local, sin remoto                                        |
| `feature/REC-001-reconciliation`        | Encargo del director (ola 0)             | No aparece en ningún documento del repositorio ni del paquete |
| `feature/TAX-001-sii-integration`       | Encargo del director (ola 0)             | Ídem                                                          |
| `feature/BNK-003-manual-cartola-import` | Encargo del director (ola 0)             | Ídem                                                          |

La convención documentada era `feature/TICKET-ID-description`
(`docs/EXCELSIA-TECHNICAL-HANDOFF.md:202`).

### 5.6 Manual de Finanzas

`docs/EXCELSIA-TECHNICAL-HANDOFF.md:344` registra un «Manual de Finanzas v1.0» en DOCX
entregado al cliente. No está en el repositorio. Fuera del repositorio, en
`~/Desktop/excelsia-erp/`, existe `Manual_Excelsia_ERP-version00.docx` (no abierto en esta
ola; no se confirmó si es ese manual).

## 6. Fotografía del paquete de traspaso

- Ubicación de origen: `~/Desktop/excelsia-erp/Excelsia_ERP_Traspaso_Claude/` (fuera del
  repositorio).
- Copia verbatim en `paquete-traspaso-2026-11-23/` (21 archivos; `cmp` byte a byte sin
  diferencias el 2026-11-23). No incluye `00_LEEME.md`, `01_PROMPT_INICIO_DIRECTOR.md`,
  el consolidado `Excelsia_ERP_Contexto_Completo_Para_Claude.md`, ni los antecedentes
  reemplazados de `referencias_historicas/` (prompts y directivas anteriores,
  `00_VIGENCIA.md`).
- **Exclusión de Prettier (FR-000-B, 2026-11-23)**: el hook de pre-commit
  (`.husky/pre-commit` → `npx lint-staged` → `prettier --write` sobre `*.md`,
  `package.json:15-23`) reformateaba 8 de los archivos copiados. La carpeta quedó en
  `.prettierignore`; Prettier 3.6.2 la ignora también con rutas absolutas explícitas, que
  es como las pasa lint-staged. `cmp` posterior: 21 archivos idénticos al origen.
  Huellas SHA-256 (16 primeros hex) del
  origen, para verificar después del commit:

```text
c5a8b379bca1bee9  02_TRASPASO_MAESTRO.md
2d2a80ff7a4a6ffb  03_PROTOCOLO_DIRECTOR_CC.md
ec9e986cdb9ade6b  METODO_TICKETS.md
7581ce8262ad26ae  ESTADO_ACTUAL.md
01f3f8058b6ee0b6  DECISIONES_PENDIENTES.md
f777bc81cbd816cd  BACKLOG_INICIAL.md
ca9d0590250ade35  BACKLOG_INICIAL.csv
df9a1b5799734306  tickets/FIN-000.md
e3afe194bfc45eed  tickets/FIN-001.md
072c764dde8a6f63  tickets/FIN-002.md
995e5489912f076e  tickets/FIN-003.md
19cf2c2e4af3260c  tickets/FIN-004.md
70063597fee2b514  tickets/FIN-005.md
d95ebd1f898ccbce  tickets/FIN-006.md
58291c5ea8149b74  tickets/FIN-007.md
79791980b3b86d8f  tickets/FIN-008.md
a612c432039b3349  plantillas/CIERRE_TICKET.md
48c917f5f84194ca  plantillas/CONTINUIDAD.md
d019c24ba711e92d  plantillas/PROMPT_PARA_CC.md
1d5cded39d288aa2  plantillas/TICKET.md
8ce3d811317fb4f4  referencias_historicas/ItSave_Reporte_Investigacion_Claude_Code.md
```

## 7. Documentos de la ola 0

| Archivo                                   | Responsable | Estado                                             |
| ----------------------------------------- | ----------- | -------------------------------------------------- |
| `00-ESTADO.md` (este)                     | CC          | Vigente                                            |
| `DECISIONES.md`                           | CC          | Vigente                                            |
| `paquete-traspaso-2026-11-23/`            | CC          | Copiado; excluido de Prettier en `.prettierignore` |
| `FR-001B-RECON-WEB.md`                    | CC          | HECHO                                              |
| `FR-002-INVENTARIO-ITSAVE.md`             | CC          | EN_CURSO                                           |
| `FR-001A-RECON-API.md`                    | Codex       | EN_REVISION (no editado por CC)                    |
| `sql/FR-001A-inventario-solo-lectura.sql` | Codex       | EN_REVISION (no editado por CC)                    |

Evidencia de terceros de FR-002 (catálogo y OpenAPI de itSave): fuera del repositorio, en
`~/Desktop/excelsia-erp/evidencia-itsave/2026-11-23/`. Nunca se commitea.

## 8. Siguiente acción

1. Patricio commitea la ola 0 (FR-000 y FR-001-B HECHO) y confirma rama, commit base y
   ramas existentes con su salida de git (contrastar §5.5).
2. Codex cierra la corrección FR-001A-B; Patricio corre el SQL de solo lectura en
   producción si el director lo autoriza, para cuantificar D-001 y el impacto de FR-H02.
3. CC entrega FR-002 (`FR-002-INVENTARIO-ITSAVE.md`); el director usa su matriz de
   preguntas en FR-003, con la sesión de Patricio y en solo lectura.
4. Patricio decide cuándo corregir FR-H01 (antes del 2027-01-01) y FR-H02…FR-H04.
5. Con FR-001, FR-002 y FR-003 revisados, el director prepara FR-004 con D-003 (a)–(c)
   como criterios.

Última actualización: 2026-11-23 (FR-000-B: dictamen del director, hallazgos FR-H01…H04, CC)
