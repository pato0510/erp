# FR-002 — Inventario documental de itSave (revalidación pública)

**Ticket:** FR-002 (= FIN-002 del paquete). **Fecha:** 2026-11-23. **Rama:** `review/fr-ola0`.
**Ejecutor:** Claude Code. **Naturaleza:** solo documentación. Se hicieron únicamente GET
públicos sin credenciales; no se invocó ninguna operación de itSave, no se enviaron
formularios ni se accedió a ninguna cuenta.

Entradas: el reporte de investigación
(`paquete-traspaso-2026-11-23/referencias_historicas/ItSave_Reporte_Investigacion_Claude_Code.md`,
IDs F01–F18, R01–R12, T01–T20, S01–S23) y el ticket `paquete-traspaso-2026-11-23/tickets/FIN-002.md`.

## 0. Etiquetas de evidencia

| Etiqueta     | Significado en este documento                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PUBLICADO    | Lo afirma una página comercial pública de itSave (S12–S21). Es material comercial: no fija cifras ni comportamiento real.                                                          |
| DOCUMENTADO  | Lo declara un contrato técnico público: catálogo `tools` (S18) u OpenAPI (S22), en su descripción, entradas o anotaciones. Describe la API, no la implementación interna ni la UI. |
| HIPÓTESIS    | Inferencia propia a partir de lo anterior (por ejemplo, por ausencia). Debe confirmarse en FR-003.                                                                                 |
| NO OBSERVADO | No aparece en ninguna fuente pública revisada.                                                                                                                                     |

Nada en este documento es OBSERVADO ni VALIDADO: ninguna afirmación proviene de usar la
cuenta. Lo DOCUMENTADO es lo que itSave declara de su API, no nuestro diseño.

## 1. Fuentes revalidadas (B1)

Consulta: 2026-11-23, 16:36–16:38 (America/Santiago, −03). GET sin credenciales y con un
agente de usuario genérico. Copias de trabajo fuera del repositorio, en
`~/Desktop/excelsia-erp/evidencia-itsave/2026-11-23/` (no se commitean). El reporte se
consultó el mismo día y no conserva copia de las páginas: «qué cambió» compara con lo que
el reporte afirma de cada fuente, no texto contra texto.

| ID  | Recurso                                                 | HTTP | Tamaño    | Estado frente al reporte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | ---- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S12 | `https://www.itsave.cl/`                                | 200  | 154.992 B | Disponible. PUBLICADO: conexión bancaria vía Fintoc con 8 bancos (BancoEstado, Chile, Santander, BCI, Scotiabank, Itaú, BICE, Security) y SII; integraciones con Mercado Pago, Previred, Shopify, Bsale, SumUp y Global66; plan Multiempresa desde 2 empresas; la captura de producto muestra en su menú «Estado de resultados», «Contabilidad», «Proyectos», «Facturación» y «Cambiar empresa». Coherente con el reporte (F01, F15, F17, F18 visual).                                                    |
| S13 | `https://www.itsave.cl/flujo-de-caja`                   | 200  | 132.470 B | Disponible. PUBLICADO: flujo personalizable, proyección a 30/60/90 días, una vista «Flujo de caja personalizado Multi-Empresas» en la captura; distingue flujo de caja de estado de resultados. Coherente (F06, F07).                                                                                                                                                                                                                                                                                     |
| S14 | `https://www.itsave.cl/conciliacion-bancaria`           | 200  | 115.228 B | Disponible. PUBLICADO: cruce automático banco ↔ facturas SII y revisión de dudas. Coherente (F04).                                                                                                                                                                                                                                                                                                                                                                                                       |
| S15 | `https://rea.tools/`                                    | 200  | 59.496 B  | Disponible (sitio de REA, no de itSave). Sin uso en este ticket (D-012).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| S16 | `https://www.itsave.cl/mcp`                             | 200  | 112.062 B | Disponible. PUBLICADO: MCP con lectura y escritura con confirmación; «ItSave AI» en la app y por WhatsApp con avisos de vencimientos. La página agrupa herramientas por bloques (p. ej. «Lectura 9», «Cotizaciones 6»): esos conteos no coinciden con el catálogo y no se usan. Coherente (F15, F16).                                                                                                                                                                                                     |
| S17 | `https://www.itsave.cl/api-rest`                        | 200  | 113.218 B | Disponible. PUBLICADO: API Key de solo lectura vinculada a una empresa; OAuth 2.0 para lectura y acciones; límites iniciales: 12 solicitudes/min por conexión, 2 consultas simultáneas por empresa, 30 s de timeout, 366 días de rango, 100 resultados, 256 KB por solicitud y 512 KB por respuesta; recursos pausados no aparecen en la especificación. Agrupa «Lectura 11 recursos» (no coincide con el catálogo). Coherente con el reporte (S17); los límites concretos son nuevos en este inventario. |
| S18 | `https://plataforma.itsave.cl/api/rest/v1/tools`        | 200  | 114.357 B | Disponible. DOCUMENTADO: 98 operaciones (ver §2). El reporte no fijó un número, a propósito.                                                                                                                                                                                                                                                                                                                                                                                                              |
| S19 | `https://www.itsave.cl/cuentas-por-cobrar`              | 200  | 115.720 B | Disponible. PUBLICADO: antigüedad de deuda (al día / por vencer / vencido), avisos por WhatsApp, cierre automático al conciliar el pago. Coherente (F09).                                                                                                                                                                                                                                                                                                                                                 |
| S20 | `https://www.itsave.cl/facturacion-electronica-gratis`  | 200  | 124.798 B | Disponible. PUBLICADO: facturación incluida en todos los planes, cotización → factura, cada venta queda como cuenta por cobrar. Coherente (F11).                                                                                                                                                                                                                                                                                                                                                          |
| S21 | `https://www.itsave.cl/planes`                          | 200  | 110.482 B | Disponible. PUBLICADO: Basic, Business, Multiempresa; «flujo de caja personalizable» solo desde Business; cuentas bancarias extra no incluidas. Coherente (F07, F17). No se incorporan precios al alcance.                                                                                                                                                                                                                                                                                                |
| S22 | `https://plataforma.itsave.cl/api/rest/v1/openapi.json` | 200  | 137.487 B | Disponible. DOCUMENTADO: OpenAPI 3.1.0, `info.version` **1.4.0** (igual que el reporte).                                                                                                                                                                                                                                                                                                                                                                                                                  |

Ningún recurso quedó inaccesible.

## 2. Contratos descargados (B2)

| Archivo (fuera del repo)                                          | Tamaño    | SHA-256                                                            | Versión declarada                        |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `~/Desktop/excelsia-erp/evidencia-itsave/2026-11-23/tools.json`   | 114.357 B | `03137fc413b6bb459c7afc177bddcbb23ea86eed036f62e604962f7a4584bb3d` | Sin campo de versión (`{ ok, tools[] }`) |
| `~/Desktop/excelsia-erp/evidencia-itsave/2026-11-23/openapi.json` | 137.487 B | `aa54f4ebc3c6d3493b05f6c597bb22edef3c1c6dd0de4e74587d7f62f6099e78` | OpenAPI 3.1.0 · API 1.4.0                |

DOCUMENTADO, ambos al 2026-11-23:

- **98 operaciones** en el catálogo y 98 rutas en el OpenAPI; cada `name` del catálogo
  coincide con un `operationId` (comprobado por script: 98/98).
- **67 de lectura y 31 de escritura** según `readOnlyHint`. 18 escrituras llevan
  `destructiveHint=true`. Solo `enviar_cotizacion` declara `idempotentHint=false`.
- **36 GET**, todos admiten API Key (`X-Api-Key`) u OAuth `itsave.lectura`. **62 POST**:
  31 son «preparar» de solo lectura (validan y devuelven un `confirmacion_token`) y 31 son
  «aplicar», que exigen OAuth con un alcance específico. Patrón general: preparar →
  confirmación explícita del usuario → aplicar con el token.
- Seguridad: `OAuth2` (authorization code, 24 alcances; `itsave.lectura` más 23 de
  escritura) y `ApiKey` en cabecera.
- **El OpenAPI no define esquemas de respuesta**: las 98 operaciones solo declaran
  códigos (200, 400, 401, 403, 429) con texto. Las salidas se conocen solo por la
  descripción de cada operación.
- Ninguna operación recibe un identificador de empresa: el alcance de empresa lo da la
  credencial (S17 dice que la API Key está «vinculada a una empresa»).

## 3. Inventario de operaciones (B3)

Agrupado por dominio. **L** = lectura (`readOnlyHint`), **E** = escritura, **E destr.** =
escritura con `destructiveHint`. Rutas sin el prefijo `/api/rest/v1`. Los alcances OAuth se
muestran sin el prefijo `itsave.`. La columna de semántica parafrasea la descripción y
las entradas del catálogo (DOCUMENTADO); «—» = sin aporte financiero relevante más allá
del nombre.

### Movimientos y clasificación — 9 operaciones (F03, F05)

| Operación                                        | Método y ruta                                     | L/E      | Autenticación                    | Semántica financiera (paráfrasis)                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consultar_movimientos`                          | GET `/movimientos`                                | L        | API Key u OAuth `lectura`        | Solo movimientos bancarios ya clasificados; filtro por rango de fechas, tipo, nombre de categoría y texto; tope 100                                                 |
| `consultar_movimientos_sin_clasificar`           | GET `/movimientos/sin-clasificar`                 | L        | API Key u OAuth `lectura`        | Pendientes de clasificar; usa un ID distinto (`movimiento_semanal_id`) del de los clasificados                                                                      |
| `revisar_movimiento_para_clasificar`             | GET `/movimientos/clasificacion/revisar`          | L        | API Key u OAuth `lectura`        | Estado de reconocimiento de la glosa; reglas de cuenta→entidad (Remuneraciones exige trabajador, Costo de Venta exige proveedor); detecta pagos masivos sin dividir |
| `buscar_entidades_para_clasificar`               | GET `/movimientos/clasificacion/entidades/buscar` | L        | API Key u OAuth `lectura`        | —                                                                                                                                                                   |
| `preparar_clasificacion_movimiento`              | POST `/movimientos/clasificacion/preparar`        | L        | OAuth `lectura`                  | Cuenta + entidad + reconocimiento por glosa + otros movimientos con igual glosa + automatizar + proyectos, en un solo paso                                          |
| `clasificar_movimiento_bancario`                 | POST `/movimientos/clasificacion/aplicar`         | E destr. | OAuth `conciliaciones.modificar` | Escritura con alcance `conciliaciones.modificar`                                                                                                                    |
| `revisar_clasificacion_movimiento`               | GET `/movimientos/clasificacion-actual/revisar`   | L        | API Key u OAuth `lectura`        | —                                                                                                                                                                   |
| `preparar_modificacion_clasificacion_movimiento` | POST `/movimientos/clasificacion-actual/preparar` | L        | OAuth `lectura`                  | Conserva proyectos y conciliaciones; no cambia la entidad si hay documentos conciliados; alcance solo este movimiento o toda la entidad                             |
| `modificar_clasificacion_movimiento`             | POST `/movimientos/clasificacion-actual/aplicar`  | E destr. | OAuth `conciliaciones.modificar` | Escritura con alcance `conciliaciones.modificar`                                                                                                                    |

### Flujo de caja — 1 operaciones (F06, F07)

| Operación            | Método y ruta             | L/E | Autenticación             | Semántica financiera (paráfrasis)                                                                                                                        |
| -------------------- | ------------------------- | --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resumen_flujo_caja` | GET `/flujo-caja/resumen` | L   | API Key u OAuth `lectura` | `tipo_flujo` normal = fecha bancaria, personalizado = fecha imputada; fuentes, comparaciones y tarjetas de crédito opcionales; saldos solo si hay cuadre |

### Calendario financiero — 10 operaciones (F08)

| Operación                                      | Método y ruta                                               | L/E      | Autenticación                            | Semántica financiera (paráfrasis)                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `leer_calendario_financiero`                   | GET `/calendario-financiero`                                | L        | API Key u OAuth `lectura`                | CxP, CxC, compromisos manuales y saldo proyectado; separa documento automático de compromiso; solo entidades con conciliación automatizada |
| `preparar_edicion_vencimiento_calendario`      | POST `/calendario-financiero/vencimientos/preparar`         | L        | OAuth `lectura`                          | Solo documentos vinculados, no compromisos manuales; devuelve monto total y pendiente e impacto en saldo proyectado                        |
| `editar_vencimiento_calendario`                | POST `/calendario-financiero/vencimientos/aplicar`          | E        | OAuth `calendario.editar_vencimientos`   | Rechaza si la fecha o el pendiente cambiaron desde la preparación; no cambia el plazo del cliente/proveedor                                |
| `buscar_documentos_para_compromiso`            | GET `/calendario-financiero/compromisos/documentos/buscar`  | L        | API Key u OAuth `lectura`                | Busca facturas del mismo tipo y monto antes de crear un compromiso (anti doble registro)                                                   |
| `preparar_creacion_compromisos_calendario`     | POST `/calendario-financiero/compromisos/crear/preparar`    | L        | OAuth `lectura`                          | Compromiso único o en cuotas (monto + fecha por cuota); bloquea si encuentra documentos coincidentes                                       |
| `crear_compromisos_calendario`                 | POST `/calendario-financiero/compromisos/crear/aplicar`     | E        | OAuth `calendario.gestionar_compromisos` | Revalida documentos y duplicados al aplicar                                                                                                |
| `preparar_cambio_estado_compromiso_calendario` | POST `/calendario-financiero/compromisos/estado/preparar`   | L        | OAuth `lectura`                          | Estado del compromiso como booleano (completado o no)                                                                                      |
| `cambiar_estado_compromiso_calendario`         | POST `/calendario-financiero/compromisos/estado/aplicar`    | E        | OAuth `calendario.gestionar_compromisos` | —                                                                                                                                          |
| `preparar_eliminacion_compromiso_calendario`   | POST `/calendario-financiero/compromisos/eliminar/preparar` | L        | OAuth `lectura`                          | —                                                                                                                                          |
| `eliminar_compromiso_calendario`               | POST `/calendario-financiero/compromisos/eliminar/aplicar`  | E destr. | OAuth `calendario.gestionar_compromisos` | —                                                                                                                                          |

### Documentos, cuentas por cobrar y por pagar — 6 operaciones (F02, F09, F10)

| Operación                | Método y ruta             | L/E | Autenticación             | Semántica financiera (paráfrasis)                                                                                                                                                               |
| ------------------------ | ------------------------- | --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_facturas_venta`    | GET `/facturas/venta`     | L   | API Key u OAuth `lectura` | Emisión, vencimiento, neto, IVA, total, monto conciliado, saldo; estado pagada / pendiente / vencida / parcialmente pagada calculado con conciliaciones y vencimiento; fecha de referencia `al` |
| `list_facturas_compra`   | GET `/facturas/compra`    | L   | API Key u OAuth `lectura` | Igual que ventas, para compras                                                                                                                                                                  |
| `get_factura`            | GET `/facturas/detalle`   | L   | API Key u OAuth `lectura` | Detalle con los movimientos bancarios y notas de crédito usados para conciliarla                                                                                                                |
| `get_cuentas_por_cobrar` | GET `/cuentas-por-cobrar` | L   | API Key u OAuth `lectura` | Saldo pendiente, días de atraso, vencidos, agrupado por cliente; la fecha del compromiso activo prevalece sobre la de la factura                                                                |
| `get_cuentas_por_pagar`  | GET `/cuentas-por-pagar`  | L   | API Key u OAuth `lectura` | Espejo de CxC para proveedores                                                                                                                                                                  |
| `get_ventas_sii`         | GET `/ventas-sii`         | L   | API Key u OAuth `lectura` | Ventas mensuales SII: documentos de venta menos notas de crédito; resolución mensual                                                                                                            |

### Cotizaciones y emisión de facturas — 15 operaciones (F11)

| Operación                              | Método y ruta                              | L/E      | Autenticación                  | Semántica financiera (paráfrasis)                                                |
| -------------------------------------- | ------------------------------------------ | -------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `buscar_clientes_cotizacion`           | GET `/cotizaciones/clientes`               | L        | API Key u OAuth `lectura`      | —                                                                                |
| `buscar_productos_cotizacion`          | GET `/cotizaciones/productos`              | L        | API Key u OAuth `lectura`      | —                                                                                |
| `preparar_cotizacion`                  | POST `/cotizaciones/preparar`              | L        | OAuth `lectura`                | Líneas, validez, forma de pago, tipo de documento 33/34                          |
| `crear_cotizacion`                     | POST `/cotizaciones/crear`                 | E        | OAuth `cotizaciones.crear`     | —                                                                                |
| `preparar_envio_cotizacion`            | POST `/cotizaciones/preparar-envio`        | L        | OAuth `lectura`                | —                                                                                |
| `enviar_cotizacion`                    | POST `/cotizaciones/enviar`                | E        | OAuth `cotizaciones.enviar`    | Único con `idempotentHint=false`: un reintento puede reenviar                    |
| `listar_cotizaciones_facturables`      | GET `/cotizaciones/facturables`            | L        | API Key u OAuth `lectura`      | —                                                                                |
| `obtener_cotizacion_facturable`        | GET `/cotizaciones/facturable`             | L        | API Key u OAuth `lectura`      | —                                                                                |
| `buscar_clientes_factura`              | GET `/facturas/clientes`                   | L        | API Key u OAuth `lectura`      | —                                                                                |
| `extraer_datos_cliente_sii_facturador` | POST `/facturas/clientes/datos-sii`        | E        | OAuth `facturas.consultar_sii` | Escribe en la ficha del cliente datos traídos del SII                            |
| `buscar_productos_factura`             | GET `/facturas/productos`                  | L        | API Key u OAuth `lectura`      | —                                                                                |
| `preparar_factura_desde_cotizacion`    | POST `/facturas/preparar-desde-cotizacion` | L        | OAuth `lectura`                | Factura desde cotización con fecha de emisión y de vencimiento                   |
| `preparar_factura_directa`             | POST `/facturas/preparar`                  | L        | OAuth `lectura`                | Solo productos activos del catálogo; forma de pago Contado / Crédito / Sin costo |
| `emitir_factura`                       | POST `/facturas/emitir`                    | E destr. | OAuth `facturas.emitir`        | Emisión real e irreversible; devuelve un lote en proceso, no una factura emitida |
| `consultar_estado_emision_factura`     | GET `/facturas/estado`                     | L        | API Key u OAuth `lectura`      | Procesando / emitida / error, con folio y motivo                                 |

### Conciliación — 4 operaciones (F04)

| Operación                          | Método y ruta                             | L/E      | Autenticación                    | Semántica financiera (paráfrasis)                                                                                   |
| ---------------------------------- | ----------------------------------------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `get_movimiento_conciliacion`      | GET `/conciliaciones/movimientos/revisar` | L        | API Key u OAuth `lectura`        | Saldo disponible del movimiento y todas sus asignaciones; la conciliación parte siempre del movimiento              |
| `buscar_documentos_conciliacion`   | GET `/conciliaciones/documentos/buscar`   | L        | API Key u OAuth `lectura`        | Tipos: factura compra/venta, boletas de honorarios, afecta, exenta y de terceros; alcance misma contraparte primero |
| `preparar_conciliacion_movimiento` | POST `/conciliaciones/preparar`           | L        | OAuth `lectura`                  | `monto_asignado` = total que queda asignado al documento; 0 elimina; confirmación si el RUT difiere                 |
| `conciliar_movimiento_documento`   | POST `/conciliaciones/aplicar`            | E destr. | OAuth `conciliaciones.modificar` | Rechaza si los saldos cambiaron desde la preparación                                                                |

### Proyectos — 8 operaciones (F12)

| Operación                                  | Método y ruta                           | L/E      | Autenticación             | Semántica financiera (paráfrasis)                                             |
| ------------------------------------------ | --------------------------------------- | -------- | ------------------------- | ----------------------------------------------------------------------------- |
| `listar_proyectos_asignacion`              | GET `/proyectos`                        | L        | API Key u OAuth `lectura` | —                                                                             |
| `get_movimiento_proyectos`                 | GET `/proyectos/movimientos/revisar`    | L        | API Key u OAuth `lectura` | Asignaciones actuales del movimiento a proyectos                              |
| `preparar_asignacion_movimiento_proyectos` | POST `/proyectos/asignaciones/preparar` | L        | OAuth `lectura`           | Distribución final completa; la suma no puede exceder el monto del movimiento |
| `asignar_movimiento_proyectos`             | POST `/proyectos/asignaciones/aplicar`  | E destr. | OAuth `proyectos.asignar` | Aplicación atómica; rechaza si la distribución cambió                         |
| `preparar_creacion_proyecto`               | POST `/proyectos/crear/preparar`        | L        | OAuth `lectura`           | —                                                                             |
| `crear_proyecto`                           | POST `/proyectos/crear/aplicar`         | E        | OAuth `proyectos.crear`   | —                                                                             |
| `preparar_edicion_nombre_proyecto`         | POST `/proyectos/nombre/preparar`       | L        | OAuth `lectura`           | —                                                                             |
| `editar_nombre_proyecto`                   | POST `/proyectos/nombre/aplicar`        | E        | OAuth `proyectos.editar`  | —                                                                             |

### Automatización de proveedores y clientes — 24 operaciones (F13)

| Operación                                         | Método y ruta                                                   | L/E      | Autenticación                                 | Semántica financiera (paráfrasis)                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------- | -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `buscar_proveedores_automatizacion`               | GET `/proveedores/automatizaciones/buscar`                      | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `revisar_automatizacion_conciliacion_proveedor`   | GET `/proveedores/conciliacion-automatica/revisar`              | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `preparar_automatizacion_conciliacion_proveedor`  | POST `/proveedores/conciliacion-automatica/preparar`            | L        | OAuth `lectura`                               | Exige declarar deuda (monto o facturas), plazo de pago y confirmar que no faltan pagos ni documentos posteriores |
| `automatizar_conciliacion_proveedor`              | POST `/proveedores/conciliacion-automatica/activar`             | E destr. | OAuth `proveedores.automatizar_conciliacion`  | —                                                                                                                |
| `preparar_desactivacion_conciliacion_proveedor`   | POST `/proveedores/conciliacion-automatica/desactivar/preparar` | L        | OAuth `lectura`                               | —                                                                                                                |
| `desactivar_conciliacion_proveedor`               | POST `/proveedores/conciliacion-automatica/desactivar/aplicar`  | E destr. | OAuth `proveedores.desactivar_conciliacion`   | Limpia deuda y borra solo conciliaciones automáticas; conserva manuales                                          |
| `revisar_automatizacion_clasificacion_proveedor`  | GET `/proveedores/clasificacion-automatica/revisar`             | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `buscar_glosas_proveedor`                         | GET `/proveedores/clasificacion-automatica/glosas/buscar`       | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `preparar_glosa_proveedor`                        | POST `/proveedores/clasificacion-automatica/glosas/preparar`    | L        | OAuth `lectura`                               | —                                                                                                                |
| `agregar_glosa_proveedor`                         | POST `/proveedores/clasificacion-automatica/glosas/agregar`     | E destr. | OAuth `proveedores.automatizar_clasificacion` | Texto de la glosa bancaria que reconoce a la entidad                                                             |
| `preparar_automatizacion_clasificacion_proveedor` | POST `/proveedores/clasificacion-automatica/preparar`           | L        | OAuth `lectura`                               | Cuenta, subcuenta o categoría de costo para clasificar automáticamente                                           |
| `automatizar_clasificacion_proveedor`             | POST `/proveedores/clasificacion-automatica/activar`            | E destr. | OAuth `proveedores.automatizar_clasificacion` | —                                                                                                                |
| `buscar_clientes_automatizacion`                  | GET `/clientes/automatizaciones/buscar`                         | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `revisar_automatizacion_conciliacion_cliente`     | GET `/clientes/conciliacion-automatica/revisar`                 | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `preparar_automatizacion_conciliacion_cliente`    | POST `/clientes/conciliacion-automatica/preparar`               | L        | OAuth `lectura`                               | Igual que proveedor, para cobranza                                                                               |
| `automatizar_conciliacion_cliente`                | POST `/clientes/conciliacion-automatica/activar`                | E destr. | OAuth `clientes.automatizar_conciliacion`     | —                                                                                                                |
| `preparar_desactivacion_conciliacion_cliente`     | POST `/clientes/conciliacion-automatica/desactivar/preparar`    | L        | OAuth `lectura`                               | —                                                                                                                |
| `desactivar_conciliacion_cliente`                 | POST `/clientes/conciliacion-automatica/desactivar/aplicar`     | E destr. | OAuth `clientes.desactivar_conciliacion`      | Limpia deuda y borra solo conciliaciones automáticas; conserva manuales                                          |
| `revisar_automatizacion_clasificacion_cliente`    | GET `/clientes/clasificacion-automatica/revisar`                | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `buscar_glosas_cliente`                           | GET `/clientes/clasificacion-automatica/glosas/buscar`          | L        | API Key u OAuth `lectura`                     | —                                                                                                                |
| `preparar_glosa_cliente`                          | POST `/clientes/clasificacion-automatica/glosas/preparar`       | L        | OAuth `lectura`                               | —                                                                                                                |
| `agregar_glosa_cliente`                           | POST `/clientes/clasificacion-automatica/glosas/agregar`        | E destr. | OAuth `clientes.automatizar_clasificacion`    | —                                                                                                                |
| `preparar_automatizacion_clasificacion_cliente`   | POST `/clientes/clasificacion-automatica/preparar`              | L        | OAuth `lectura`                               | —                                                                                                                |
| `automatizar_clasificacion_cliente`               | POST `/clientes/clasificacion-automatica/activar`               | E destr. | OAuth `clientes.automatizar_clasificacion`    | —                                                                                                                |

### Plan de cuentas (subcuentas y categorías) — 4 operaciones (F14)

| Operación                      | Método y ruta                             | L/E | Autenticación                        | Semántica financiera (paráfrasis)                                                                                   |
| ------------------------------ | ----------------------------------------- | --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `proponer_clasificacion_gasto` | POST `/clasificaciones/gastos/proponer`   | L   | OAuth `lectura`                      | Destinos: remuneraciones, arriendo, gastos operacionales/administrativos, inversión, financiamiento, costo de venta |
| `crear_clasificacion_gasto`    | POST `/clasificaciones/gastos/crear`      | E   | OAuth `gastos.crear_clasificacion`   | —                                                                                                                   |
| `proponer_subcuenta_ingreso`   | POST `/clasificaciones/ingresos/proponer` | L   | OAuth `lectura`                      | Destinos: ingresos por venta o financiamiento                                                                       |
| `crear_subcuenta_ingreso`      | POST `/clasificaciones/ingresos/crear`    | E   | OAuth `ingresos.crear_clasificacion` | —                                                                                                                   |

### Trabajadores — 13 operaciones (F13, F14)

| Operación                                          | Método y ruta                                               | L/E      | Autenticación                      | Semántica financiera (paráfrasis)                             |
| -------------------------------------------------- | ----------------------------------------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------- |
| `preparar_creacion_trabajador`                     | POST `/trabajadores/crear/preparar`                         | L        | OAuth `lectura`                    | —                                                             |
| `crear_trabajador`                                 | POST `/trabajadores/crear/aplicar`                          | E        | OAuth `trabajadores.crear`         | —                                                             |
| `revisar_automatizacion_trabajador`                | GET `/trabajadores/automatizacion/revisar`                  | L        | API Key u OAuth `lectura`          | —                                                             |
| `buscar_textos_reconocimiento_trabajador`          | GET `/trabajadores/automatizacion/textos/buscar`            | L        | API Key u OAuth `lectura`          | —                                                             |
| `preparar_texto_reconocimiento_trabajador`         | POST `/trabajadores/automatizacion/textos/agregar/preparar` | L        | OAuth `lectura`                    | —                                                             |
| `agregar_texto_reconocimiento_trabajador`          | POST `/trabajadores/automatizacion/textos/agregar/aplicar`  | E destr. | OAuth `trabajadores.automatizar`   | —                                                             |
| `preparar_automatizacion_trabajador`               | POST `/trabajadores/automatizacion/preparar`                | L        | OAuth `lectura`                    | —                                                             |
| `automatizar_trabajador`                           | POST `/trabajadores/automatizacion/aplicar`                 | E destr. | OAuth `trabajadores.automatizar`   | Clasificación automática solo en subcuentas de Remuneraciones |
| `preparar_desactivacion_automatizacion_trabajador` | POST `/trabajadores/automatizacion/desactivar/preparar`     | L        | OAuth `lectura`                    | —                                                             |
| `desactivar_automatizacion_trabajador`             | POST `/trabajadores/automatizacion/desactivar/aplicar`      | E destr. | OAuth `trabajadores.automatizar`   | —                                                             |
| `buscar_trabajadores_para_quitar_textos`           | GET `/trabajadores/textos/buscar`                           | L        | API Key u OAuth `lectura`          | —                                                             |
| `preparar_eliminacion_textos_trabajador`           | POST `/trabajadores/textos/quitar/preparar`                 | L        | OAuth `lectura`                    | —                                                             |
| `quitar_textos_reconocimiento_trabajador`          | POST `/trabajadores/textos/quitar/aplicar`                  | E destr. | OAuth `trabajadores.quitar_textos` | —                                                             |

### Entidades (clientes y proveedores) — 4 operaciones (F14)

| Operación                     | Método y ruta                      | L/E | Autenticación             | Semántica financiera (paráfrasis)                                                |
| ----------------------------- | ---------------------------------- | --- | ------------------------- | -------------------------------------------------------------------------------- |
| `preparar_creacion_proveedor` | POST `/proveedores/crear/preparar` | L   | OAuth `lectura`           | Revisa duplicados y coincidencias de nombre; permite entidades ficticias sin RUT |
| `crear_proveedor`             | POST `/proveedores/crear/aplicar`  | E   | OAuth `proveedores.crear` | —                                                                                |
| `preparar_creacion_cliente`   | POST `/clientes/crear/preparar`    | L   | OAuth `lectura`           | Revisa duplicados y coincidencias de nombre; permite entidades ficticias sin RUT |
| `crear_cliente`               | POST `/clientes/crear/aplicar`     | E   | OAuth `clientes.crear`    | —                                                                                |

## 4. Semántica de dominio documentada (B4)

Todo lo de esta sección es DOCUMENTADO (catálogo/OpenAPI) salvo donde se marca otra
etiqueta. Describe la API de itSave; no es nuestro diseño ni la implementación interna
de itSave.

- **Movimiento bancario, documento y compromiso son tres cosas distintas.** El
  movimiento es bancario y se clasifica (`consultar_movimientos` lista solo los
  clasificados; `consultar_movimientos_sin_clasificar` los pendientes). El documento es
  la factura o boleta tributaria (`list_facturas_venta`, `list_facturas_compra`). El
  compromiso es un pago o cobro manual sin documento, único o en cuotas
  (`preparar_creacion_compromisos_calendario`). HIPÓTESIS: un documento SII no genera por
  sí mismo un movimiento; ninguna descripción lo dice y todas las escrituras sobre
  movimientos parten de un movimiento bancario.
- **Dos espacios de ID de movimiento**: `movimiento_semanal_id` para el movimiento sin
  clasificar (`revisar_movimiento_para_clasificar`) e `ingreso_id` / `movimiento_id` para
  el clasificado (`revisar_clasificacion_movimiento`, `get_movimiento_conciliacion`).
- **Asignación parcial**: la conciliación se hace siempre desde el movimiento hacia un
  documento con `monto_asignado` (monto total que queda asignado; 0 la elimina)
  (`preparar_conciliacion_movimiento`). El movimiento expone saldo disponible y todas sus
  asignaciones (`get_movimiento_conciliacion`); la factura expone monto conciliado, saldo
  y los movimientos y notas de crédito usados (`list_facturas_venta`, `get_factura`). El
  estado de pago (pagada / pendiente / vencida / parcialmente pagada) se calcula con las
  conciliaciones y el vencimiento.
- **Tipos de fecha**: bancaria (flujo normal) e imputada (flujo personalizado)
  (`resumen_flujo_caja.tipo_flujo`); emisión y vencimiento de documento
  (`list_facturas_*`, `preparar_factura_*`); vencimiento editado o de compromiso activo,
  que prevalece sobre el original (`get_cuentas_por_cobrar`, `leer_calendario_financiero`);
  fecha de referencia `al` para calcular atraso.
- **Estructura del flujo de caja**: ingresos por venta (por canal, cliente o tipo), costo
  de venta y proveedores, margen bruto, gastos por subcuenta, flujo operacional, flujo del
  período y saldos (`resumen_flujo_caja`). Los destinos de clasificación agregan
  remuneraciones, arriendo, gastos operacionales y administrativos, actividades de
  inversión y de financiamiento (`proponer_clasificacion_gasto`,
  `proponer_subcuenta_ingreso`). Las cifras las calcula el backend y no deben recalcularse.
- **Fuentes, comparaciones y pendientes**: selección de cuentas o fuentes
  (`fuentes_flujo`), comparación con período anterior, mismo período del año anterior o
  promedio mensual del año (`comparar_con`), movimientos de tarjeta de crédito no
  divididos (`con_movimientos_tc`); lo sin clasificar, lo posiblemente no operacional y
  las imputaciones desde otro mes se informan aparte.
- **Saldos ocultos sin cuadre**: si los saldos no están cuadrados, el flujo y el saldo
  proyectado del calendario se omiten y se explica cómo cuadrarlos
  (`resumen_flujo_caja`, `leer_calendario_financiero`).
- **Calendario**: separa documentos automáticos de compromisos creados por usuarios;
  incluye solo documentos de entidades con conciliación automatizada; ordena en vencidos,
  hoy y próximos; advierte fechas con saldo proyectado negativo
  (`leer_calendario_financiero`). Editar un vencimiento solo aplica a documentos
  vinculados, no a compromisos manuales, y se rechaza si la fecha o el pendiente cambiaron
  desde la preparación (`editar_vencimiento_calendario`). Antes de crear un compromiso se
  buscan documentos del mismo tipo y monto para evitar doble registro
  (`buscar_documentos_para_compromiso`, `preparar_creacion_compromisos_calendario`).
- **Proyectos**: un movimiento clasificado se distribuye entre uno o varios proyectos; se
  envía la distribución final completa y la suma no puede exceder el monto del movimiento;
  aplicación atómica (`preparar_asignacion_movimiento_proyectos`,
  `asignar_movimiento_proyectos`).
- **Automatizaciones (F13)**: el disparador es la glosa bancaria que reconoce a una
  entidad (`agregar_glosa_*`, `agregar_texto_reconocimiento_trabajador`). Clasificación
  automática por entidad → cuenta/subcuenta (`automatizar_clasificacion_*`,
  `automatizar_trabajador`, este último solo en Remuneraciones). Conciliación automática
  por cliente o proveedor exige declarar la deuda vigente (monto o facturas), el plazo, y
  confirmar que no faltan pagos ni documentos posteriores
  (`preparar_automatizacion_conciliacion_*`). Desactivarla limpia la deuda y borra solo
  las conciliaciones automáticas, conservando las manuales (`desactivar_conciliacion_*`).
  Modificar una clasificación pregunta si aplica solo al movimiento o a toda la entidad
  (`preparar_modificacion_clasificacion_movimiento.alcance`).
- **Reglas de clasificación por cuenta**: Remuneraciones exige trabajador, Costo de Venta
  exige proveedor y categoría de costo, otros egresos admiten proveedor opcional, ingresos
  admiten cliente opcional (`revisar_movimiento_para_clasificar`). Una reclasificación
  conserva proyectos y conciliaciones, pero no cambia la entidad si hay documentos
  conciliados (`preparar_modificacion_clasificacion_movimiento`).
- **Emisión de factura asíncrona**: `emitir_factura` inicia una emisión real e
  irreversible y devuelve un lote en proceso; el resultado (procesando / emitida / error,
  folio, motivo) se consulta con `consultar_estado_emision_factura`. Control de reintentos:
  token de preparación más `idempotentHint=true`; el texto de la emisión no menciona
  duplicados explícitamente (sí lo hacen compromisos, proyectos y entidades).
- **Ventas según SII**: suma mensual de documentos de venta menos notas de crédito
  (`get_ventas_sii`).
- **Multiempresa (F17)**: PUBLICADO un plan Multiempresa y, en capturas, «Cambiar
  empresa» y una vista de flujo «Multi-Empresas» (S12, S13, S21). DOCUMENTADO: ninguna
  operación recibe empresa; S17: la API Key está vinculada a una empresa. HIPÓTESIS: la
  API opera una empresa por credencial y no expone consolidación.
- **Estado de resultados y contabilidad (F18)**: PUBLICADO solo como elementos del menú
  en capturas (S12, S13). NO OBSERVADO en contratos: ninguna de las 98 operaciones los
  expone. S13 distingue explícitamente flujo de caja de estado de resultados.

### Reglas R01–R12

| Regla                                                                          | Estado al 2026-11-23                                                                                                                                                | Operación de referencia                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| R01 Flujo normal = fecha bancaria; personalizado = fecha imputada              | Vigente (DOCUMENTADO)                                                                                                                                               | `resumen_flujo_caja.tipo_flujo`                                                     |
| R02 Cálculos del servidor; no recalcular                                       | Vigente                                                                                                                                                             | `resumen_flujo_caja`                                                                |
| R03 Saldos ocultos sin cuadre                                                  | Vigente; se extiende al saldo proyectado del calendario                                                                                                             | `resumen_flujo_caja`, `leer_calendario_financiero`                                  |
| R04 Pendientes, fuentes y comparaciones                                        | Vigente; precisa tres comparaciones y tarjetas de crédito no divididas                                                                                              | `resumen_flujo_caja.fuentes_flujo`, `.comparar_con`, `.con_movimientos_tc`          |
| R05 Calendario separa automáticos de manuales                                  | Vigente                                                                                                                                                             | `leer_calendario_financiero`                                                        |
| R06 Inclusión automática depende de la conciliación automatizada de la entidad | Vigente                                                                                                                                                             | `leer_calendario_financiero`, `buscar_documentos_para_compromiso`                   |
| R07 Cambio de vencimiento rechazado si cambió algo relevante                   | Vigente; precisa «fecha o monto pendiente» y excluye compromisos manuales                                                                                           | `preparar_edicion_vencimiento_calendario`, `editar_vencimiento_calendario`          |
| R08 Asignación total o parcial                                                 | Vigente                                                                                                                                                             | `preparar_conciliacion_movimiento.monto_asignado`, `conciliar_movimiento_documento` |
| R09 Reclasificar conserva proyectos y conciliaciones                           | Vigente con matiz: no permite cambiar la entidad si hay documentos conciliados                                                                                      | `preparar_modificacion_clasificacion_movimiento`                                    |
| R10 Reparto entre proyectos limitado al monto                                  | Vigente                                                                                                                                                             | `preparar_asignacion_movimiento_proyectos`                                          |
| R11 Vencimiento: prevalece el del calendario; factura como alternativa         | Vigente                                                                                                                                                             | `get_cuentas_por_cobrar`, `leer_calendario_financiero`                              |
| R12 Emisión asíncrona con consulta de estado y control de duplicados           | Cambiado / no encontrado en parte: asincronía y consulta de estado vigentes; el control de duplicados de la emisión solo se infiere del token y de `idempotentHint` | `emitir_factura`, `consultar_estado_emision_factura`                                |

## 5. Explicabilidad en los contratos (B5, D-003a)

- **El agregado no se descompone por contrato.** `resumen_flujo_caja` devuelve el flujo
  calculado y su configuración (`configuracion.fuentes_disponibles`), y separa lo sin
  clasificar, lo no operacional y las imputaciones de otro mes, pero ninguna operación
  devuelve los movimientos o documentos que forman una celda (DOCUMENTADO por ausencia).
  Sin esquemas de respuesta, la forma exacta del resultado no está documentada.
- **Reconstrucción aproximada**: `consultar_movimientos` filtra por rango de fechas y
  nombre de categoría, lo que permitiría acercarse a una celda categoría × período en el
  flujo normal; no filtra por fecha imputada ni por fuente y devuelve como máximo 100
  filas (HIPÓTESIS sobre su utilidad para explicar una cifra).
- **La trazabilidad que sí está documentada es a nivel de documento y movimiento**:
  factura → movimientos y notas de crédito que la conciliaron (`get_factura`);
  movimiento → saldo disponible y todas sus asignaciones (`get_movimiento_conciliacion`)
  y sus proyectos (`get_movimiento_proyectos`); facturas con monto conciliado, saldo y
  estado calculado (`list_facturas_*`).
- **Explicación de ausencias**: cuando no hay cuadre, flujo y calendario explican por qué
  ocultan los saldos y cómo cuadrarlos (R03).
- **Fuente única de cálculo**: las cifras vienen del backend y no deben recalcularse
  (R02); las comparaciones también las calcula el backend con la misma configuración.

## 6. Matriz de preguntas para FR-003 (B6)

Para el recorrido de solo lectura del director con la sesión de Patricio. Ordenadas por
impacto en el plan; **★ = top 10**. «Observación que responde» describe qué mirar en
pantalla o en la red del navegador, sin ejecutar acciones.

| #   | ★   | F        | Pantalla / flujo                             | Pregunta                                                                                                                                                | Observación que responde                                      |
| --- | --- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | ★   | F06, F07 | Flujo de caja                                | ¿Qué filas, subtotales y secciones tiene el flujo y en qué orden (ventas, costo, margen bruto, gastos, operacional, inversión, financiamiento, saldos)? | Captura de la estructura completa de un mes con datos         |
| 2   | ★   | F06      | Flujo de caja → celda                        | ¿Una celda abre los movimientos que la componen? ¿Con qué filtros y fechas?                                                                             | Clic en una celda y petición de red resultante                |
| 3   | ★   | F04      | Conciliación desde un movimiento             | ¿Cómo se ve una asignación parcial y el saldo disponible del movimiento y del documento?                                                                | Un movimiento con asignaciones parciales y su detalle         |
| 4   | ★   | F09      | Cuentas por cobrar                           | ¿Cómo se calcula y presenta el pendiente por documento y por cliente, y la antigüedad?                                                                  | Lista de CxC con un documento parcialmente pagado             |
| 5   | ★   | F03, F05 | Movimientos sin clasificar → clasificar      | ¿Qué datos exige cada cuenta (entidad, subcuenta, categoría de costo) y cómo se ve el reconocimiento por glosa?                                         | Panel de clasificación de un movimiento pendiente             |
| 6   | ★   | F08      | Calendario financiero                        | ¿Cómo se distinguen documentos automáticos, compromisos manuales y saldo proyectado? ¿Qué pasa si no hay cuadre?                                        | Vista de calendario con vencidos y próximos                   |
| 7   | ★   | F01      | Conexión bancaria / fuentes                  | ¿Qué cuentas y fuentes aparecen, con qué estado de sincronización y fecha de última actualización?                                                      | Pantalla de cuentas/fuentes y su indicador temporal           |
| 8   | ★   | F06      | Flujo de caja → tipo de flujo                | ¿Dónde se elige normal / personalizado y qué cambia al imputar un movimiento a otro mes?                                                                | Mismo mes en ambos modos; un movimiento imputado              |
| 9   | ★   | F13      | Automatización de conciliación de un cliente | ¿Qué pide al activar (deuda inicial, plazo, confirmaciones) y qué muestra después?                                                                      | Pantalla de activación (sin confirmar)                        |
| 10  | ★   | F02      | Documentos SII                               | ¿Qué documentos llegan (tipos, notas de crédito, boletas) y cómo se ve una NC aplicada a una factura?                                                   | Lista de facturas con una NC y detalle de la factura          |
| 11  |     | F06      | Saldos / cuadre                              | ¿Qué significa «cuadre» en pantalla y cómo se cuadra?                                                                                                   | Mensaje y flujo de cuadre                                     |
| 12  |     | F10      | Cuentas por pagar                            | ¿Es simétrica a CxC? ¿Cómo entran las boletas de honorarios?                                                                                            | Lista de CxP                                                  |
| 13  |     | F14      | Configuración del plan de cuentas            | ¿Qué cuentas madre son fijas y cuáles subcuentas crea el usuario?                                                                                       | Pantalla de cuentas y subcuentas                              |
| 14  |     | F07      | Flujo personalizable                         | ¿Qué se puede cambiar de la estructura y quién puede?                                                                                                   | Opciones de configuración del flujo                           |
| 15  |     | F18      | Estado de resultados                         | ¿Existe en la cuenta? ¿De qué datos sale (documentos o movimientos) y con qué fecha?                                                                    | Pantalla «Estado de resultados»                               |
| 16  |     | F18      | Contabilidad                                 | ¿Qué contiene: asientos, plan de cuentas contable, exportación?                                                                                         | Pantalla «Contabilidad»                                       |
| 17  |     | F17      | Cambiar empresa / Multi-Empresas             | ¿Hay vista consolidada? ¿Cómo trata transferencias entre empresas?                                                                                      | Selector de empresa y vista consolidada                       |
| 18  |     | F12      | Proyectos                                    | ¿Qué reporte de resultado por proyecto existe y cómo se ve un reparto?                                                                                  | Vista de un proyecto con movimientos repartidos               |
| 19  |     | F08      | Compromiso manual                            | ¿Cómo se ven las cuotas y el aviso de documento coincidente?                                                                                            | Formulario de compromiso (sin guardar)                        |
| 20  |     | F08      | Editar vencimiento                           | ¿Dónde se edita y cómo se muestra el impacto en el saldo proyectado?                                                                                    | Diálogo de edición (sin guardar)                              |
| 21  |     | F11      | Cotización → factura                         | ¿Qué estados tiene la cotización y qué campos pasan a la factura?                                                                                       | Cotización aceptada y su vista previa de factura (sin emitir) |
| 22  |     | F11      | Emisión                                      | ¿Cómo se ve una emisión en proceso o con error?                                                                                                         | Historial de emisiones                                        |
| 23  |     | F05      | Reclasificar                                 | ¿Cómo se pregunta el alcance (solo este movimiento o toda la entidad)?                                                                                  | Diálogo de reclasificación (sin guardar)                      |
| 24  |     | F03      | Movimientos                                  | ¿Qué columnas, filtros y orden tiene la lista? ¿Hay detalle de movimiento?                                                                              | Lista y detalle                                               |
| 25  |     | F01      | Tarjetas de crédito y pagos masivos          | ¿Cómo se dividen movimientos de tarjeta y pagos masivos?                                                                                                | Un movimiento de TC o pago masivo                             |
| 26  |     | F06      | Comparaciones                                | ¿Cómo se presentan período anterior, año anterior y promedio?                                                                                           | Flujo con comparación activa                                  |
| 27  |     | F13      | Glosas                                       | ¿Cómo se ven las glosas que reconocen a una entidad y su efecto en movimientos futuros vs pasados?                                                      | Ficha de un proveedor automatizado                            |
| 28  |     | F14      | Trabajadores                                 | ¿Cómo se vinculan trabajadores y remuneraciones (Previred)?                                                                                             | Ficha de trabajador y movimiento de remuneración              |
| 29  |     | F09      | Avisos                                       | ¿Qué avisos de vencimiento existen en la app (no WhatsApp) y con qué anticipación?                                                                      | Centro de notificaciones                                      |
| 30  |     | F15      | ItSave AI                                    | ¿Qué responde el asistente sobre una cifra y si cita su composición?                                                                                    | Una pregunta de solo lectura en la app                        |
| 31  |     | F16      | Integraciones → API                          | ¿Qué permisos y alcances se ofrecen al crear una credencial?                                                                                            | Pantalla de configuración (sin crear)                         |
| 32  |     | F17      | Usuarios y roles                             | ¿Qué roles hay y qué restringe cada uno?                                                                                                                | Configuración de usuarios                                     |
| 33  |     | F06      | Exportación                                  | ¿Qué exporta «Descargar» y con qué criterio de fecha?                                                                                                   | Opciones de descarga (sin descargar datos sensibles al repo)  |
| 34  |     | F04      | Conciliación automática                      | ¿Cómo se distingue una conciliación automática de una manual en pantalla?                                                                               | Detalle de una factura conciliada                             |
| 35  |     | F02      | Sincronización SII                           | ¿Se ve la fecha de última sincronización y errores?                                                                                                     | Indicador de sincronización                                   |

## 7. Herramientas (B7, D-012)

No hace falta Craft Anything ni REA. Los contratos se describen a sí mismos (descripción,
entradas, anotaciones y alcances de cada operación) y bastó leerlos. Lo que falta —forma de
las respuestas, composición de una cifra en pantalla, comportamiento de la UI— se responde
en FR-003 con la UI y la inspección de red del navegador, que es justo lo que D-012 deja
como primer recurso.

## 8. Trazabilidad F01–F18 (criterio de aceptación de FR-002)

| F                                       | Evidencia vigente                                                                                                                         | Etiqueta                | Límite                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| F01 Conexión bancaria                   | S12, S21 (Fintoc, 8 bancos, solo lectura); `resumen_flujo_caja.fuentes_flujo`                                                             | PUBLICADO / DOCUMENTADO | Ninguna operación de conexión o estado de sincronización |
| F02 Documentos SII                      | `list_facturas_venta`, `list_facturas_compra`, `get_factura`, `get_ventas_sii`; S12                                                       | DOCUMENTADO             | Sin operación de sincronización ni de su estado          |
| F03 Movimientos                         | `consultar_movimientos`, `consultar_movimientos_sin_clasificar`                                                                           | DOCUMENTADO             | Sin esquema de respuesta                                 |
| F04 Conciliación                        | 4 operaciones de `conciliaciones/*`; S14                                                                                                  | DOCUMENTADO             | —                                                        |
| F05 Clasificación                       | `revisar_movimiento_para_clasificar`, `preparar_clasificacion_movimiento`, `preparar_modificacion_clasificacion_movimiento` y sus aplicar | DOCUMENTADO             | —                                                        |
| F06 Flujo de caja                       | `resumen_flujo_caja`; S13                                                                                                                 | DOCUMENTADO             | Sin descomposición por celda (§5)                        |
| F07 Personalización                     | `tipo_flujo` configurado/personalizado; S13, S21 (desde Business)                                                                         | DOCUMENTADO / PUBLICADO | Ninguna operación para editar la estructura              |
| F08 Calendario                          | 10 operaciones de `calendario-financiero/*`                                                                                               | DOCUMENTADO             | —                                                        |
| F09 Cuentas por cobrar                  | `get_cuentas_por_cobrar`; S19                                                                                                             | DOCUMENTADO             | —                                                        |
| F10 Cuentas por pagar                   | `get_cuentas_por_pagar`                                                                                                                   | DOCUMENTADO             | —                                                        |
| F11 Cotizaciones y facturación          | 15 operaciones; S20                                                                                                                       | DOCUMENTADO             | Emisión real: no invocar                                 |
| F12 Proyectos                           | 8 operaciones de `proyectos*`                                                                                                             | DOCUMENTADO             | Sin reporte de resultado por proyecto en contratos       |
| F13 Automatizaciones                    | 24 de proveedores/clientes + trabajadores                                                                                                 | DOCUMENTADO             | —                                                        |
| F14 Catálogos y entidades               | plan de cuentas (4), entidades (4), trabajadores                                                                                          | DOCUMENTADO             | —                                                        |
| F15 IA y WhatsApp                       | S16 (ItSave AI en app y WhatsApp, avisos)                                                                                                 | PUBLICADO               | Sin contrato del canal                                   |
| F16 MCP y API                           | 98 operaciones; S16, S17 (límites)                                                                                                        | DOCUMENTADO / PUBLICADO | Catálogo variable: recursos pausados no aparecen         |
| F17 Multiempresa                        | S12, S21, captura de S13                                                                                                                  | PUBLICADO / HIPÓTESIS   | API por empresa; consolidación NO OBSERVADO              |
| F18 Estado de resultados y contabilidad | Menú en capturas de S12/S13                                                                                                               | PUBLICADO (visual)      | NO OBSERVADO en contratos                                |

Ninguna de estas capacidades se presenta como disponible para la cuenta de Patricio: eso
lo establece FR-003.

## 9. Lo que contrasta con los supuestos de los recon (FR-001-A / FR-001-B)

- **Caja desde el banco, no desde el SII.** En itSave el movimiento es bancario y el
  documento SII se le asigna (DOCUMENTADO); en Excelsia el sync SII crea movimientos
  CONFIRMED con fecha de emisión (FR-001-A §4.4). Coherente con la propuesta D-015.
- **Saldo pendiente = documento − asignaciones**, con estado de pago calculado
  (DOCUMENTADO): también coherente con D-015 y ausente en Excelsia (FR-001-A §4.6).
- **La conciliación automática exige un corte inicial por entidad** (deuda vigente,
  plazo, confirmación de que no faltan pagos ni documentos). Ningún recon contempló un
  corte de saldos por entidad; afecta la transición (D-010, FR-007, FR-033).
- **El calendario solo trae documentos de entidades con conciliación automatizada**: el
  calendario depende de la automatización, no solo de los documentos (R06).
- **Plan de cuentas con secciones de flujo** (costo de venta → margen bruto, operacional,
  inversión, financiamiento) y entidad obligatoria por cuenta (trabajador en
  Remuneraciones): las categorías de Excelsia son planas INCOME/EXPENSE con un nivel de
  padre (FR-001-B §2.15). Toca D-005 (trabajadores de RRHH) y F14.
- **La conciliación parte siempre del movimiento hacia un documento**; Excelsia concilia
  en tres vías incluido el movimiento interno (FR-001-A §4.6).
- **Los conteos de las páginas comerciales no coinciden con el catálogo** (S16, S17
  agrupan por bloques); el número de operaciones sale solo del catálogo.

## 10. Verificaciones

| Comprobación                | Método                                                                                                                                                  | Resultado                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Operaciones citadas existen | Script: todo identificador entre comillas invertidas de este documento que coincide con un `name` u `operationId`, contra `tools.json` y `openapi.json` | Sin ausencias (detalle en §11) |
| Catálogo ↔ OpenAPI         | 98 `name` contra 98 `operationId`                                                                                                                       | 98/98 coinciden                |
| Formato                     | `npx prettier --write` sobre este archivo                                                                                                               | Aplicado                       |

## 11. Registro de la verificación de citas

Comprobado por script el 2026-11-23 contra `tools.json` (SHA-256 `03137fc4…`) y `openapi.json` (SHA-256 `aa54f4eb…`): 98 operaciones distintas citadas en este documento (incluida la tabla de §3); 98 presentes en el catálogo y en el OpenAPI; ausentes: 0. Alcances OAuth citados: 24, todos presentes en `securitySchemes`. Identificadores en comillas invertidas que no son operación, alcance ni campo de entrada del catálogo: 0.

Última actualización: 2026-11-23 (FR-002, CC)
