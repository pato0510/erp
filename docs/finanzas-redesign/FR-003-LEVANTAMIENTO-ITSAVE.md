# FR-003 — Levantamiento observable de itSave (pasadas 1 y 2)

**Ticket:** FR-003 (= FIN-003 del paquete). **Responsable:** director (Claude), con la sesión de Patricio abierta en el navegador integrado de la app de escritorio.
**Fecha:** 2026-11-23. **Modo:** solo lectura; vista de escritorio 1440×900.
**Autorización:** Patricio confirmó (2026-11-23) que se puede recorrer EMPRESA-A en esta cuenta. La cuenta muestra además datos de otra empresa en el asistente; no se recorrió.
**Empresa observada:** EMPRESA-A (la empresa que usa Excelsia).
**Estado de evidencia:** todo lo de este documento es OBSERVADO (estructura y textos de pantalla), no VALIDADO (no se ejecutaron casos).
**Sin datos sensibles:** sin nombres de personas, RUT ni montos.

Acciones realizadas en la cuenta:

- cambiar el mes de un filtro;
- expandir una fila del flujo;
- abrir la pestaña Ventas;
- abrir y cerrar la ventana de conciliación de una factura (cerrando el aviso de deuda con «Seguir conciliando»).

No se seleccionó, guardó ni confirmó nada.

## Límites de esta cuenta

- La cuenta bancaria de EMPRESA-A está desconectada en itSave (la integración figura «Requiere atención»). Los movimientos bancarios llegan hasta marzo de 2026.
- No hay compromisos en el calendario ni reglas de clasificación. La clasificación de movimientos es parcial.
- Consecuencia: caja, conciliación y cuentas por cobrar/pagar se observan en estructura, no en comportamiento (NO OBSERVADO). Los datos del SII sí están al día.

## Mapa de navegación

- **Dashboard:** asistente financiero AI, contador AI, facturador AI.
- **Flujo de caja.**
- **Estado de resultados** (Beta).
- **Movimientos.**
- **Calendario financiero:** calendario; pagos y cobros.
- **Pagos masivos:** generar; configuración.
- **Facturación:** emitir documento, documentos emitidos, emisión masiva, cotizaciones, configurar cotizaciones, gastos del exterior, clientes, productos y servicios, configurar facturador.
- **Contabilidad:** impuestos mensuales; libros de ventas, compras, honorarios y remuneraciones; RRHH; documentos.
- **Proyectos:** resumen, matriz, flujo por proyecto.
- **Integraciones.**
- **Contactos:** clientes, proveedores, trabajadores.
- **Configurar mi asistente:** matrices de ingresos, costos y gastos; reglas de clasificación.
- **Ajustes:** general; plan.
- **Encabezado:** interruptor global «Fecha imputada», «Actualizar», notificaciones.

## Dashboard

- **Indicadores:** saldo en cuenta (con hora de actualización), por cobrar vencido, por pagar vencido, gastos sin clasificar del mes. Cada uno con una línea de estado («Nada atrasado», «Todo clasificado»).
- **Gráfico anual** por mes o acumulado. Cada serie tiene su explicación de una línea:
  - Ventas del SII = lo facturado ante el SII.
  - Ingresos por venta = lo que efectivamente entró por ventas.
  - Flujo operacional = resultado después de costos, gastos e impuestos.
  - Flujo de caja = variación del efectivo, incluido financiamiento e inversión.
  - El estado de resultados aparece como «Próximamente» en el dashboard.
- **Mes actual vs mes anterior:** el mes en curso se dibuja achurado.
- **Cuentas por cobrar y pagar por antigüedad**, tomadas del calendario: vencido, hoy, 7 días, 8–15, 16–30, 31–60, más de 60. Se separan por tipo de documento: facturas, honorarios, boletas de terceros, otros.
- **Saldo proyectado** de hoy a +60 días, condicionado a «cuadrar saldos».
- **Cascada del mes:** ingresos − costos = margen bruto − gastos = flujo operacional, con la meta «100% clasificado».
- **Documentos SII descargables:** carpeta tributaria, F22.
- **Asistente AI** conectado a WhatsApp, que envía mensajes periódicos con indicadores.
- Hay un selector «Nueva versión / Versión anterior».

## Movimientos (bancarios)

**Escalera de automatización que se le muestra al usuario:** Clasifica → se clasifica solo; Concilia → setea la deuda → se concilia solo.

**Cómo se navega:** por mes, con filtros General / Ingresos / Egresos y por tipo de entidad (sin clasificar, trabajadores, clientes, proveedores, agentes retenedores).

**Columnas:**

| Columna              | Qué muestra                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| Estado               | Clasificado automáticamente / sin clasificar                                    |
| Movimiento           | Entidad reconocida desde la glosa o el RUT, más la glosa                        |
| Clasificación        | Categoría > subcategoría                                                        |
| Documento conciliado | Acción «Conciliar»; habilitada solo después de clasificar («Clasifica primero») |
| Fecha real           | Fecha bancaria                                                                  |
| Mes imputado         | Se asigna al clasificar; vacío si no está clasificado                           |
| Monto                | Con signo                                                                       |
| Cuenta               | Últimos dígitos                                                                 |
| Obs.                 | Observaciones                                                                   |
| Proyecto(s)          | Habilitado solo después de clasificar                                           |

**Pestañas hermanas:** Compras, Ventas, Honorarios, Boletas de terceros, Previred.

**Acciones:** agregar efectivo, subir estado de cuenta de tarjeta de crédito, revisar pagos con Mercado Pago, agregar regla de clasificación, accesos directos para conciliar compras, ventas y honorarios.

**Reparto:** hay un formulario para repartir un movimiento en varias líneas (monto, cuenta, subclasificación, entidad, descripción, proyecto).

### Pestaña Ventas (registro de ventas)

- Selector por mes, con todos los meses que tienen documentos desde 2022; filtro por cliente; descarga.
- **Columnas:**
  - estado;
  - cliente;
  - tipo y número de documento;
  - fecha de emisión y vencimiento («Sin vencimiento» si el cliente no tiene plazo configurado);
  - movimiento conciliado (acción «Conciliar»);
  - cuenta contable («Por definir» si no está asignada);
  - monto con IVA;
  - estado de la factura (Pendiente);
  - PDF del documento.
- **La conciliación también se puede iniciar desde el documento.** El API, en cambio, siempre la inicia desde el movimiento (FR-002).

### Ventana de conciliación (abierta sin seleccionar ni confirmar)

- **Encabezado:** factura, cliente, fecha y monto.
- **Pestañas:** Sin conciliar, Conciliados, Sin clasificar. Selector de mes y búsqueda por descripción o monto.
- **Columnas:** fecha, monto, descripción del banco, cliente, **monto restante** y **asignar sobrante**.
- **Pie:** «Monto total seleccionado». Se pueden elegir varios movimientos para una factura y repartir lo que sobra (asignación parcial).
- **Aviso al abrir** cuando el cliente no tiene deuda configurada: «Configura la deuda de [cliente] para mejorar la conciliación automática», con las opciones «Ir a Clientes» o «Seguir conciliando».

## Flujo de caja

- **Cascada:** (+) ingresos por ventas (por tipo) (−) costos de venta (=) margen bruto (%) (−) gastos (remuneraciones, arriendo, operacionales, impuestos) (=) flujo operacional (utilidad %) (±) financiamiento (=) flujo del período.
- **Columnas:** meses + total anual.
- **Vistas y opciones:** por tipo, canal o cliente; mostrar %; incluir movimientos de tarjeta de crédito; pestaña «Flujo de caja personalizado»; «Editar matrices»; «Modo en vivo»; descarga.
- **Saldos:** se muestran solo cuando termina de cargar el historial (R03 observado).
- **Detalle:** la fila se expande de categoría a subcategoría, con un tooltip «promedio mensual (n meses)».
- **No observado:** si la celda de un mes abre sus movimientos (en EMPRESA-A los meses recientes están vacíos).

## Matrices (estructura del flujo, F07/F14)

- **Matriz de gastos:** dos niveles. «Cuenta madre» (por ejemplo remuneraciones, arriendo, gastos administrativos, gastos de operaciones, otras actividades), marcada «conectado al flujo». Debajo, subclasificaciones con el número de movimientos de cada una.
- Se reordena arrastrando una subclasificación a otra categoría.
- «Otras actividades > Egresos excluidos» deja fuera del flujo operacional lo que no corresponde.
- Hay matrices separadas de costos e ingresos. Las matrices definen la estructura del flujo de caja.

## Reglas de clasificación

- Texto de la pantalla: cuando se reconoce una entidad en un movimiento bancario, se evalúan sus reglas en orden y la primera que coincide aplica la instrucción (responsable = «Regla»).
- Acción «Actualizar clasificaciones según reglas», que recategoriza lo existente.
- EMPRESA-A no tiene reglas configuradas.

## Calendario financiero y Pagos y cobros

- **Resumen por antigüedad:** a pagar, a cobrar, saldo proyectado y número de compromisos. «Toca un período para ver sus compromisos».
- **Saldo proyectado:** exige cuadrar con el saldo final de la cartola al cierre del mes anterior.
- **Compromisos:** pagos, cobros y recordatorios; vista calendario o lista; carga masiva; archivados.
- **Pagos y cobros:** estados pendiente / atrasado / pagado; tipo, monto, vencimiento, «vence en», número de documento; «preparar pago masivo».
- Sin datos en EMPRESA-A.

## Proveedores y Clientes (cuentas por pagar y cobrar por entidad)

- **Deuda pendiente por entidad:** «pagado (o cobrado) / total», %, número de facturas, saldo pendiente.
- **«Se clasifica en»:** categoría por defecto de la entidad.
- **Estado de automatización:** automatizado / listo para automatizar / sin automatizar.
- **Otros:** estado de cuenta por entidad; cuenta bancaria del proveedor para pagos masivos; carga bancaria masiva.
- **Transferencias entre cuentas propias** aparecen como una entidad con código interno clasificada en «Ingresos excluidos» (caso T12).
- En EMPRESA-A todo figura 0% pagado y 0% cobrado: sin conciliación no se descuenta deuda.

## Estado de resultados (Beta)

- **Base devengada:** documentos SII netos de IVA, por cuenta contable con código (plan de cuentas).
- **Columnas:** meses + acumulado + % sobre ingresos.
- **Explicabilidad:** «Haz clic en un monto para revisar los documentos de origen».
- **Checklist de cierre del mes:** documentos SII considerados; falta el libro de remuneraciones; compras sin cuenta asignada (acción «Asignar»); movimientos sin comprobante, con la nota de que no afectan el resultado.
- **Indicadores y exportación:** resultado estimado y resultado del mes; exporta a Excel y PDF.

## Proyectos

Resumen por proyecto: ingresos, egresos, flujo operacional y % sobre ingresos; ver flujo; configurar.

## Integraciones (F01, F15, F16)

- **Esenciales:**
  - SII (por RUT).
  - WhatsApp.
  - Cuenta bancaria: una incluida; cada cuenta extra tiene costo mensual adicional.
- **Otras:**
  - Previred.
  - Pagos: Mercado Pago, SumUp; Transbank («próximamente»).
  - Ventas: Shopify, Mercado Libre, Bsale, relBase.
  - Facturación: OpenFactura como facturador para emitir DTE.
  - Billeteras: Global66, Vita Wallet.
  - API REST (OAuth o clave de solo lectura).
  - MCP para ChatGPT y Claude.

## Conclusiones para el plan

1. itSave separa caja y devengado:
   - **Caja:** movimientos bancarios, por fecha real o imputada, en el flujo de caja.
   - **Devengado:** documentos SII netos de IVA, en el estado de resultados.

   Confirma la recomendación D-015.

2. **La clasificación es la puerta de entrada:** sin clasificar no hay mes imputado, ni conciliación, ni proyecto.
3. **Explicabilidad (D-003a):** cada serie tiene una explicación de una línea, hay cascadas con %, se puede ir a los documentos de origen desde el estado de resultados, y hay tooltips de promedio.
4. **Cuentas por cobrar y pagar viven en la entidad:** deuda = documentos − pagos conciliados. El calendario las agrupa por antigüedad.
5. **Los saldos dependen de cuadrar con la cartola (R03).**
6. **Sin banco conectado, caja, conciliación y cuentas por cobrar quedan en cero.** Es la misma dependencia que tiene Excelsia (D-006).
7. **La conciliación funciona en los dos sentidos en la interfaz:** desde el movimiento y desde el documento.
   - Muestra el monto restante y permite asignar el sobrante.
   - Empuja a configurar la deuda de la entidad, que es el corte inicial que exige la automatización.
8. **La entidad (cliente, proveedor o trabajador) es el eje de la automatización:**
   - reconocimiento desde la glosa del banco;
   - categoría por defecto;
   - reglas ordenadas;
   - deuda y plazo, de donde sale el vencimiento.

   Esto conecta con D-005: ¿cuál es el maestro de entidades en Excelsia?

9. **El flujo de caja se arma con matrices editables de dos niveles** y una salida para «excluidos»: es la personalización de F07.

## Cierre propuesto

HECHO con límite explícito. La estructura, la navegación y las reglas visibles están cubiertas. El comportamiento con banco conectado (conciliación real, saldos cuadrados, calendario con datos, celda mensual → movimientos) queda NO OBSERVADO.

Una pasada 3 opcional, si se reconecta el banco en itSave, cubriría:

- celda mensual → movimientos;
- flujo personalizado;
- cotizaciones y facturación (sin emitir);
- pagos masivos (solo ver);
- ficha y estado de cuenta de una entidad.
