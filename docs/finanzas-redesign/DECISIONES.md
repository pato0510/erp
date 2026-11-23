# Finanzas — Rediseño (FR) · Registro de decisiones

Origen: `paquete-traspaso-2026-11-23/DECISIONES_PENDIENTES.md` (D-001…D-012), más las
decisiones nuevas de la ola 0. Formato de registro del paquete. Regla del paquete: no se
registra como ACORDADA una recomendación sin aceptación cuando requiere decisión del
usuario. Estados: PENDIENTE / PROPUESTA / ACORDADA / REEMPLAZADA.

Los «momentos» citan los IDs del paquete con su equivalente FR (FIN-NNN = FR-NNN).

## Resumen

| ID    | Tema                                                         | Estado                                                 | Quién decide                                |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| D-001 | Datos financieros reales que preservar                       | ACORDADA (hecho documentado)                           | Hecho; volumen pendiente de FR-001-A        |
| D-002 | Operación solo propia o también para clientes                | ACORDADA (contexto del fundador)                       | Patricio puede corregir                     |
| D-003 | Qué desagrada del módulo y recorridos de itSave prioritarios | ACORDADA (explicabilidad, simplificación, completitud) | Patricio                                    |
| D-004 | Mantener, refactorizar o sustituir cada parte                | PENDIENTE                                              | Director con evidencia; Patricio aprueba    |
| D-005 | Responsabilidad de maestros y documentos entre módulos       | PENDIENTE                                              | Director con evidencia                      |
| D-006 | Proveedores y mecanismos de bancos, SII y emisión            | PENDIENTE                                              | Patricio (contratación)                     |
| D-007 | Monedas, fechas, precisión, redondeo y saldos                | PENDIENTE                                              | Director con evidencia                      |
| D-008 | Prioridades de paridad funcional y fidelidad de UX           | PENDIENTE                                              | Patricio                                    |
| D-009 | Alcance de IA, MCP y WhatsApp                                | PENDIENTE                                              | Patricio                                    |
| D-010 | Transición y retiro del módulo anterior                      | PENDIENTE                                              | Patricio                                    |
| D-011 | Alcance de reportes contables y de gestión                   | PENDIENTE                                              | Patricio                                    |
| D-012 | Herramientas de inspección necesarias                        | ACORDADA (técnica)                                     | Director                                    |
| D-013 | Espacio de IDs `FR-NNN`                                      | ACORDADA                                               | Director                                    |
| D-014 | Ubicación del control y prosa en español                     | ACORDADA                                               | Director                                    |
| D-015 | Hecho canónico de caja y de resultado                        | PROPUESTA                                              | Director propone; Patricio acepta en FR-006 |

---

## D-001

```text
ID: D-001
Pregunta: ¿Hay datos financieros reales que preservar o solo datos de prueba?
Hechos y fuentes:
  - Re-sincronización histórica del SII desde 2019 ejecutada en producción, con datos
    reales y coherentes (docs/EXCELSIA-TECHNICAL-HANDOFF.md:317, §8.1 punto 5).
  - FASE 0 (2026-08-03): tax_sync_runs con un solo proveedor histórico 'baseapi',
    318 corridas, 2.046 filas en tax_documents sin huellas de mock (CLAUDE.md:2635).
  - audit_logs de producción al 2026-08-05: 4.131 escrituras en tax_documents y 2.072
    en movements, 351 en counterparties (CLAUDE.md:2242 y siguientes).
  - Movimientos de AGS recategorizados en producción: caso COPEC, recategorización
    hecha por una persona en la UI el 2026-08-05 (CLAUDE.md:2385-2397). FIN-B (S17,
    d090206) entregó la recategorización por reglas (CLAUDE.md:419-452); CLAUDE.md no
    registra cuántos movimientos se recategorizaron con ella en producción.
Alternativas relevantes: no aplica (es un hecho, no una elección).
Recomendación de Claude y motivo: tratar todo Finanzas de producción como dato real que
  se preserva; estrategia de transición conservadora (sin borrados, con reversión).
Impacto en datos, módulos y tickets: FR-007, FR-010, FR-033, FR-037 parten de datos
  reales; cualquier cambio de modelo necesita migración compatible y ensayo.
Quién decide y por qué: hecho documentado; no requiere decisión.
Estado: ACORDADA (hecho documentado)
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, director, con las fuentes
  citadas.
Tickets afectados y acción siguiente: el volumen actual por tabla queda pendiente del SQL
  de solo lectura de FR-001-A (docs/finanzas-redesign/sql/FR-001A-inventario-solo-lectura.sql,
  Codex), a ejecutar por Patricio.
```

## D-002

```text
ID: D-002
Pregunta: ¿El ERP operará solo para empresas propias o también para empresas clientes?
Hechos y fuentes:
  - Plataforma SaaS multi-tenant con aislamiento por empresa (CLAUDE.md:3-11, decisiones
    arquitectónicas 2).
  - Primer cliente en producción: AGS Solutions SPA (CLAUDE.md:13-18).
  - El arco de hardening nace de la pregunta «qué debe ser verdad ANTES de dar de alta
    al segundo cliente» (CLAUDE.md, § ARCO DE HARDENING).
  - Hallazgo de FR-001-B que pesa sobre esta decisión: /tributario muestra nombre y RUT
    de AGS como constantes en el código y el sync SII toma las credenciales de
    variables de entorno únicas por despliegue (ver FR-001B-RECON-WEB.md §6).
Alternativas relevantes: solo empresas propias · empresas clientes (multi-tenant real).
Recomendación de Claude y motivo: diseñar para empresas clientes; es la premisa vigente
  de la plataforma y del arco de hardening.
Impacto en datos, módulos y tickets: FR-011, FR-012, FR-013, FR-027, FR-032 deben
  asumir aislamiento por empresa y credenciales de integración por empresa.
Quién decide y por qué: Patricio (producto); se registra según el contexto que él ya dio.
Estado: ACORDADA (según contexto del fundador; Patricio puede corregir)
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, contexto del fundador
  registrado en CLAUDE.md.
Tickets afectados y acción siguiente: FR-004 y FR-006 lo toman como requisito.
Consecuencia añadida (FR-000-B, 2026-11-23, director): las credenciales SII son hoy por
  despliegue (variables de entorno SII_RUT / SII_PASSWORD, FR-001-A §4.4,
  apps/api/src/modules/tax/tax.service.ts:113), incompatibles con empresas clientes: un
  segundo tenant sincronizaría al mismo contribuyente. Deben pasar a ser por empresa
  (FR-011, FR-013).
```

## D-003

```text
ID: D-003
Pregunta: ¿Qué desagrada del módulo actual y cuáles son los recorridos de itSave que
  quiere reproducir primero?
Hechos y fuentes: respuesta de Patricio, transmitida por el director el 2026-11-23
  (corrección FR-000-A), textual:
  «No entiendo mucho el módulo actual y no me gusta el diseño en general. Quiero
  completarlo: le falta mucha información financiera y tiene muchas cosas que no se
  están ocupando. Se ve cargado y a la vez le falta mucho para que sea útil en una
  empresa.»
  Insumo de evidencia: FR-001B-RECON-WEB.md §6 (deuda de UX) y §6.1 (cifras sin
  explicación, densidad, funciones sin uso aparente).
Alternativas relevantes: —
Recomendación de Claude y motivo: —
Impacto en datos, módulos y tickets — tres consecuencias:
  (a) Explicabilidad: toda cifra debe conducir a sus componentes, a su fuente y a su
      criterio de fecha.
  (b) Simplificación: las funciones sin uso real son candidatas a retirarse u ocultarse;
      se decide después, con evidencia de uso (enlaza con D-010).
  (c) Completitud: la información financiera que falta entra en el alcance.
  Afecta FR-004, FR-005, FR-008, FR-010, FR-029, FR-034, FR-037.
  Los recorridos de itSave a reproducir primero no se nombraron: se derivan en
  FR-003/FR-004 con estas tres consecuencias como criterio.
Quién decide y por qué: Patricio (producto).
Estado: ACORDADA
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, palabras de Patricio citadas
  arriba, vía el director (FR-000-A).
Tickets afectados y acción siguiente: FR-004 y FR-005 las toman como criterios de
  aceptación de experiencia.
```

## D-004

```text
ID: D-004
Pregunta: Mantener, refactorizar o sustituir cada parte de Finanzas.
Hechos y fuentes: diagnóstico en curso (FR-001-A api/datos, FR-001-B web).
Evidencia necesaria: diagnóstico del código, uso real y brechas.
Estado: PENDIENTE
Momento: FIN-004 / FIN-006 (= FR-004 / FR-006).
```

## D-005

```text
ID: D-005
Pregunta: Responsabilidad de clientes, proveedores, trabajadores, proyectos, empresas y
  documentos.
Evidencia necesaria: módulos existentes, modelos y flujos actuales.
Estado: PENDIENTE
Momento: FIN-001 / FIN-006 (= FR-001 / FR-006).
```

## D-006

```text
ID: D-006
Pregunta: Proveedores y mecanismos de bancos, SII y emisión.
Evidencia necesaria: conectores existentes, contratos, sandbox, requisitos y costes reales.
Nota (FR-000-B, 2026-11-23, director): los movimientos bancarios reales son la pieza
  clave. Sin ellos no hay caja real, ni conciliación real, ni cuentas por cobrar/pagar
  reales: hoy el único proveedor bancario es mock (FR-001-A §4.3,
  apps/api/src/modules/banking/providers/provider.factory.ts:10). Opciones a evaluar en
  FR-007: Fintoc; la importación de cartola existente (sin comprobar, FR-001-A §4.3 y
  FR-001-B §2.9); otras.
Estado: PENDIENTE
Momento: FIN-007 (= FR-007).
```

## D-007

```text
ID: D-007
Pregunta: Monedas, fechas, precisión, redondeo y reglas de saldos.
Evidencia necesaria: código actual, casos de negocio y referencia observable.
Estado: PENDIENTE
Momento: FIN-004 / FIN-006 (= FR-004 / FR-006).
```

## D-008

```text
ID: D-008
Pregunta: Prioridades de paridad funcional y fidelidad de UX.
Evidencia necesaria: recorridos de itSave y validación del usuario.
Estado: PENDIENTE
Momento: FIN-004 / FIN-005 / FIN-008 (= FR-004 / FR-005 / FR-008).
```

## D-009

```text
ID: D-009
Pregunta: Alcance de IA, MCP y WhatsApp.
Evidencia necesaria: necesidad del usuario, infraestructura y permisos.
Estado: PENDIENTE
Momento: FIN-004 / FIN-007 / FIN-008 (= FR-004 / FR-007 / FR-008).
```

## D-010

```text
ID: D-010
Pregunta: Transición y retiro del módulo anterior.
Evidencia necesaria: datos reales, dependencias, reversión y operación.
Estado: PENDIENTE
Momento: FIN-007 / FIN-008 (= FR-007 / FR-008).
```

## D-011

```text
ID: D-011
Pregunta: Alcance de reportes contables y de gestión.
Evidencia necesaria: evidencia de la referencia, necesidades propias y datos disponibles.
Estado: PENDIENTE
Momento: FIN-002 / FIN-003 / FIN-004 (= FR-002 / FR-003 / FR-004).
```

## D-012

```text
ID: D-012
Pregunta: Herramientas de inspección que realmente hacen falta.
Evidencia necesaria: capacidades instaladas, acceso disponible y brechas concretas.
Hechos de la ola 0: en esta máquina no hay suite E2E (Playwright) configurada para la
  web ni target web:test (CLAUDE.md, § Próximos pasos UI-001); el stack local no estaba
  levantado el 2026-11-23.
Alternativas relevantes: instalar desde ya Craft Anything y REA · activarlos solo ante
  una pregunta concreta.
Recomendación de Claude y motivo: —
Impacto en datos, módulos y tickets:
  - Craft Anything y REA NO se instalan ahora. Se activan solo ante una pregunta
    concreta que no puedan responder la UI, la API pública de itSave ni la inspección
    de red del navegador.
  - FR-003 (recorrido de la cuenta de itSave) lo hace el director, en solo lectura, en
    el navegador integrado y con la sesión propia de Patricio. CC no opera esa cuenta.
Quién decide y por qué: director (decisión técnica).
Estado: ACORDADA
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, director (corrección
  FR-000-A).
Tickets afectados y acción siguiente: FR-002, FR-003.
Momento original: FIN-000 / FIN-002 / FIN-003 (= FR-000 / FR-002 / FR-003).
```

## D-013

```text
ID: D-013
Pregunta: ¿Qué espacio de IDs usa el trabajo del rediseño?
Hechos y fuentes: el paquete numera FIN-000…FIN-038; FIN-001 ya nombra los Presupuestos
  revertidos (docs/EXCELSIA-TECHNICAL-HANDOFF.md §10) y el Sprint 17 usó FIN-A/FIN-B
  (CLAUDE.md:395, CLAUDE.md:419). "FR-0" no aparecía en el repositorio (grep, 2026-11-23).
Alternativas relevantes: reutilizar FIN-NNN · espacio nuevo FR-NNN.
Recomendación de Claude y motivo: FR-NNN, para evitar colisiones con IDs históricos.
Impacto en datos, módulos y tickets: FIN-000→FR-000 … FIN-038→FR-038, FR-009 reservado;
  F/R/T/S/D del paquete sin cambio.
Quién decide y por qué: director (convención interna).
Estado: ACORDADA
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, encargo del director (ola 0).
Tickets afectados y acción siguiente: todos los FR; aplicado en 00-ESTADO.md §3–4.
```

## D-014

```text
ID: D-014
Pregunta: ¿Dónde vive el control del rediseño y en qué idioma?
Hechos y fuentes: METODO_TICKETS.md §1 propone docs/finanzas-redesign/ si no hay otra
  convención; los planes anteriores viven en docs/ (EXCELSIA-*-PLAN-PART1/PART2,
  *-RECON.md) y la prosa de CLAUDE.md está en español.
Alternativas relevantes: archivos sueltos en docs/ · carpeta propia.
Recomendación de Claude y motivo: carpeta propia, con un único estado vivo.
Impacto en datos, módulos y tickets: estado en 00-ESTADO.md, decisiones aquí, fotografía
  del paquete en paquete-traspaso-2026-11-23/, recon en FR-001A/FR-001B; prosa en español;
  identificadores, rutas y citas de código verbatim.
Quién decide y por qué: director.
Estado: ACORDADA
Decisión adoptada, fecha y evidencia de acuerdo: 2026-11-23, encargo del director (ola 0).
Tickets afectados y acción siguiente: todos los FR.
```

## D-015

```text
ID: D-015
Pregunta: ¿Cuál es el hecho canónico de caja y cuál el de resultado?
Hechos y fuentes (FR-001-A §4):
  - El sync SII crea movimientos CONFIRMED con la fecha de emisión/recepción del
    documento (issueDate → Movement.date), no con la fecha de pago (§4.4).
  - El único proveedor bancario es mock (§4.3); no hay movimientos bancarios reales.
  - Caja = apertura + ingresos CONFIRMED − egresos CONFIRMED (§4.8); conciliar deja el
    movimiento en RECONCILED y lo saca de esos totales (§10.1 hallazgo 1; FR-H02).
  - La conciliación enlaza a lo sumo un movimiento bancario, un documento y un
    movimiento por match, sin importe aplicado ni saldo residual (§4.6).
Alternativas relevantes: mantener Movement como hecho único de caja y resultado ·
  separar caja (banco) y devengado (documento) unidos por aplicaciones.
Recomendación de Claude y motivo (propuesta del director):
  - Caja = movimiento bancario, con su fecha bancaria.
  - Devengado / resultado = documento, con su fecha de emisión o de imputación.
  - Conciliación = aplicación total o parcial de movimientos a documentos.
  - Saldo pendiente de CxC / CxP = documento − aplicaciones.
Impacto en datos, módulos y tickets: FR-006 (modelo), FR-010, FR-012…FR-017, FR-028;
  migración de los movimientos SII existentes (D-001, D-010); contratos con Operaciones
  y Comercial que hoy escriben compromisos (FR-001-A §4.7).
Quién decide y por qué: el director propone; requiere aceptación en FR-006 porque cambia
  el significado de cifras que Patricio ya usa.
Estado: PROPUESTA
Decisión adoptada, fecha y evidencia de acuerdo: —
Tickets afectados y acción siguiente: FR-006; contrastar con la semántica documentada de
  itSave (FR-002 §B4) y con lo observado en FR-003.
```

Última actualización: 2026-11-23 (FR-000-B: D-015 propuesta; notas en D-002 y D-006, CC)
