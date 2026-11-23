# Backlog inicial — Finanzas del ERP

**Fecha:** 23 de noviembre de 2026. **Naturaleza:** punto de partida para refinar sobre el proyecto real.

Incluye **9 tickets de arranque y 29 semillas de implementación, integración y entrega**. No hay tickets ejecutados por esta actividad. FIN-009 se reserva sin asignación; la numeración posterior comienza en FIN-010 para distinguir el trabajo propuesto de implementación.

El orden y las dependencias son una propuesta. El director debe contrastarlos con los informes y evidencias de CC, el trabajo previo y el alcance acordado con Patricio. CC verifica el código real. Una capacidad ya resuelta puede verificarse y reutilizarse. Una semilla grande se divide antes de implementarse; no equivale a una sesión ni a una estimación de esfuerzo.

## Arranque y planificación

| ID | Ticket | Estado inicial | Dependencias |
|---|---|---|---|
| [FIN-000](tickets/FIN-000.md) | Recibir el traspaso y establecer continuidad | LISTO | Ninguna |
| [FIN-001](tickets/FIN-001.md) | Diagnosticar Finanzas y sus dependencias en el ERP real | PROPUESTO | FIN-000 |
| [FIN-002](tickets/FIN-002.md) | Revalidar documentación pública y contratos de itSave | PROPUESTO | FIN-000 |
| [FIN-003](tickets/FIN-003.md) | Levantar recorridos y comportamiento observable de la cuenta de itSave | PROPUESTO | FIN-002 |
| [FIN-004](tickets/FIN-004.md) | Definir requisitos y matriz de brechas del módulo objetivo | PROPUESTO | FIN-001, FIN-002 |
| [FIN-005](tickets/FIN-005.md) | Definir navegación, flujos y propuesta de experiencia de uso | PROPUESTO | FIN-004 |
| [FIN-006](tickets/FIN-006.md) | Diseñar arquitectura integrada, modelo y contratos | PROPUESTO | FIN-001, FIN-004 |
| [FIN-007](tickets/FIN-007.md) | Planificar integraciones y transición de datos | PROPUESTO | FIN-006 |
| [FIN-008](tickets/FIN-008.md) | Consolidar el plan completo y preparar la ejecución | PROPUESTO | FIN-004, FIN-005, FIN-006, FIN-007 |

FIN-003 necesita la sesión autorizada de itSave. Su evidencia alimenta requisitos y UX, pero la falta de sesión no bloquea el diagnóstico del ERP ni toda la planificación. Cada área afectada debe conservar su incertidumbre. No puede declararse validada la equivalencia con una cuenta que no se observó.

FIN-008 concreta el plan completo con evidencia del proyecto. Debe transformar las semillas en trabajo trazable y dejar el primer ticket de implementación listo cuando su alcance esté acordado. Si un segmento tiene dependencias externas pendientes, mantenerlas visibles y preparar los segmentos independientes.

## Semillas posteriores

**Estado inicial de todas: POR_REFINAR.** Sus criterios son orientativos y no bastan por sí solos para comenzar a cambiar código. Deben precisarse con rutas reales, decisiones, datos, contratos, impacto y pruebas.

Todas las semillas dependen del plan de FIN-008 por transitividad. Las dependencias de la tabla representan el plan de cobertura completa; durante el refinamiento pueden dividirse por entregas y capacidades. Un canal o conector pendiente no debe bloquear innecesariamente la entrega de otra función independiente, pero tampoco desaparecer del alcance sin una decisión explícita.

| ID | Trabajo propuesto | Dependencias propuestas |
|---|---|---|
| FIN-010 | Fundamentos de dinero, fechas y contratos financieros | FIN-008 |
| FIN-011 | Entidades compartidas, empresa y permisos de base | FIN-010 |
| FIN-012 | Cuentas bancarias e incorporación de movimientos | FIN-011 |
| FIN-013 | Incorporación de documentos tributarios o comerciales | FIN-011 |
| FIN-014 | Movimientos, búsqueda y clasificación manual | FIN-011, FIN-012 |
| FIN-015 | Conciliación de documentos y movimientos | FIN-013, FIN-014 |
| FIN-016 | Cuentas por cobrar y por pagar | FIN-015 |
| FIN-017 | Flujo de caja y estructura personalizable | FIN-014, FIN-015, FIN-016 |
| FIN-018 | Calendario de vencimientos y compromisos | FIN-016, FIN-017 |
| FIN-019 | Proyección y escenarios de caja | FIN-017, FIN-018 |
| FIN-020 | Proyectos, centros de costo y distribución | FIN-011, FIN-014 |
| FIN-021 | Cotizaciones y transición comercial | FIN-011 |
| FIN-022 | Emisión de documentos y estados asíncronos | FIN-013, FIN-021 |
| FIN-023 | Reglas de clasificación y conciliación automática | FIN-014, FIN-015 |
| FIN-024 | Asistencia financiera por IA | FIN-016, FIN-017, FIN-018 |
| FIN-025 | API y MCP del ERP | FIN-011, FIN-016, FIN-017 |
| FIN-026 | Canal WhatsApp y notificaciones acordadas | FIN-024, FIN-025 |
| FIN-027 | Experiencia multiempresa y consolidación | FIN-011, FIN-017 |
| FIN-028 | Reportes y exportaciones de gestión | FIN-016, FIN-017, FIN-019, FIN-020 |
| FIN-029 | Experiencia integrada y tablero financiero | FIN-017, FIN-018, FIN-020, FIN-028 |
| FIN-030 | Validación integrada de procesos financieros | FIN-015, FIN-016, FIN-017, FIN-018, FIN-022, FIN-023, FIN-025, FIN-026, FIN-027, FIN-028, FIN-029 |
| FIN-031 | Regresión de módulos consumidores del ERP | FIN-020, FIN-022, FIN-028, FIN-029 |
| FIN-032 | Revisión transversal de permisos y operación | FIN-023, FIN-024, FIN-025, FIN-026, FIN-027 |
| FIN-033 | Ensayo de transición y preservación de datos | FIN-030, FIN-031, FIN-032 |
| FIN-034 | Aceptación de uso y guía operativa | FIN-030, FIN-031, FIN-032 |
| FIN-035 | Preparación de entrega en staging | FIN-033, FIN-034 |
| FIN-036 | Activación autorizada y verificación en operación | FIN-035 |
| FIN-037 | Retirada acordada de Finanzas anterior | FIN-036 |
| FIN-038 | Revisión posterior y cierre de cobertura | FIN-036 |

La UX, los permisos, la validación financiera, el manejo de errores y la documentación necesaria acompañan cada entrega funcional. Los tickets transversales posteriores revisan su integración; no autorizan posponer estos requisitos hasta el final.

## Detalle para refinar cada semilla

Los vínculos F/R/T indican cobertura de investigación. Las soluciones y criterios siguientes son propuestas para el ERP propio, no afirmaciones nuevas sobre la implementación privada de itSave. El alcance de escenarios, consolidación, canales, reportes y emisión debe acordarse según evidencia y necesidad real.

### FIN-010 — Fundamentos de dinero, fechas y contratos financieros

**Cobertura:** Transversal; R01–R04; T07, T14, T20.  
**Resultado propuesto:** Aplicar las convenciones acordadas para importes, moneda, precisión, fechas, estados y errores en las funciones que lo requieran.

**Antes de ejecutar:** Localizar utilidades actuales y consumidores; delimitar la compatibilidad y evitar una refactorización global sin necesidad.

**Verificación mínima propuesta:** Casos de redondeo, límites temporales y saldos relevantes; contratos compatibles con módulos consumidores.

### FIN-011 — Entidades compartidas, empresa y permisos de base

**Cobertura:** F14, F17; T19.  
**Resultado propuesto:** Reutilizar o completar maestros y contexto de empresa para Finanzas, con responsabilidades de escritura y acceso.

**Antes de ejecutar:** Mapear clientes, proveedores, trabajadores, proyectos y usuarios reales; separar cambios de catálogo de cambios de autorización si conviene.

**Verificación mínima propuesta:** Referencias a maestros coherentes; lectura y escritura limitadas a empresa y rol; comprobación negativa de acceso cruzado.

### FIN-012 — Cuentas bancarias e incorporación de movimientos

**Cobertura:** F01; T12, T13, T17.  
**Resultado propuesto:** Incorporar movimientos mediante el mecanismo aprobado, conservando origen, identidad y estado de actualización.

**Antes de ejecutar:** Elegir conector existente, proveedor o importación; separar el adaptador de su validación real y definir normalización y actualización.

**Verificación mínima propuesta:** Reimportación sin duplicados; movimientos corregidos y errores visibles; última sincronización y datos antiguos identificados.

### FIN-013 — Incorporación de documentos tributarios o comerciales

**Cobertura:** F02; T06, T13, T17.  
**Resultado propuesto:** Representar documentos y ajustes con identidad estable y procedencia, conectados a las entidades del ERP.

**Antes de ejecutar:** Precisar tipos, estados, proveedor, importación y dueño de documentos; confirmar integración con los registros ya existentes.

**Verificación mínima propuesta:** Documento y ajuste no duplicados; actualización consistente; errores y documentos incompletos revisables.

### FIN-014 — Movimientos, búsqueda y clasificación manual

**Cobertura:** F03, F05, F14; R09; T10, T12.  
**Resultado propuesto:** Consultar y clasificar movimientos con filtros, pendientes, detalle y corrección integrada al ERP.

**Antes de ejecutar:** Definir categorías, transferencias, movimientos manuales si se requieren, permisos y efectos de reclasificar.

**Verificación mínima propuesta:** Listados y totales consistentes; corrección preserva relaciones ajenas; estados vacíos y de error resueltos.

### FIN-015 — Conciliación de documentos y movimientos

**Cobertura:** F04; R08–R09; T01–T06.  
**Resultado propuesto:** Asignar pagos total o parcialmente a documentos y corregir asociaciones con trazabilidad.

**Antes de ejecutar:** Definir uno a varios y varios a uno, disponibilidad, diferencias, ajustes, concurrencia y experiencia de revisión.

**Verificación mínima propuesta:** Factura 1.000.000 y abono 400.000 deja 600.000 bajo la regla acordada; completar, revertir y repartir conserva saldos y evita sobreasignación.

### FIN-016 — Cuentas por cobrar y por pagar

**Cobertura:** F09–F10; R11; T01, T02, T06, T08.  
**Resultado propuesto:** Consultar deuda, vencimientos, antigüedad, estados y vínculos con pagos y ajustes.

**Antes de ejecutar:** Precisar origen del vencimiento, signos, cortes temporales y documentos incluidos; dividir cobrar y pagar cuando convenga.

**Verificación mínima propuesta:** Saldos se explican por documento; abonos y ajustes afectan pendiente correctamente; filtros y antigüedad usan la fecha definida.

### FIN-017 — Flujo de caja y estructura personalizable

**Cobertura:** F06–F07; R01–R04; T07, T12, T14, T20.  
**Resultado propuesto:** Ofrecer flujo por períodos, fuentes y categorías con estructura y criterios de fecha configurados según requisitos.

**Antes de ejecutar:** Resolver vista bancaria o imputada, saldos iniciales, transferencias internas, pendientes, agrupación y permisos para personalizar.

**Verificación mínima propuesta:** Totales reproducibles; transferencia interna no duplica ingreso consolidado bajo la regla acordada; fechas y falta de cuadre se muestran de forma explícita.

### FIN-018 — Calendario de vencimientos y compromisos

**Cobertura:** F08; R05–R07, R11; T08–T09.  
**Resultado propuesto:** Presentar compromisos y documentos con origen, vencimiento y relación con cuentas pendientes y flujo.

**Antes de ejecutar:** Definir reglas automáticas y manuales, edición, concurrencia y prevención de doble registro; no copiar condiciones de referencia sin decidirlas.

**Verificación mínima propuesta:** Cambiar vencimiento actualiza las vistas correspondientes; conflicto de edición detectado; documento y compromiso relacionado no se cuentan dos veces.

### FIN-019 — Proyección y escenarios de caja

**Cobertura:** F06–F08; fuente S13; T09, T14, T20.  
**Resultado propuesto:** Proyectar caja separando datos reales, comprometidos y supuestos de planificación.

**Antes de ejecutar:** Definir horizonte, recurrencias y escenarios realmente requeridos; fórmulas propias propuestas y supuestos visibles.

**Verificación mínima propuesta:** Un cambio de supuesto solo afecta el escenario correspondiente; no altera registros reales ni duplica compromisos; resultado explicable.

### FIN-020 — Proyectos, centros de costo y distribución

**Cobertura:** F12; R09–R10; T10–T11.  
**Resultado propuesto:** Asignar importes a proyectos o centros existentes y consultar su efecto financiero.

**Antes de ejecutar:** Confirmar conceptos presentes en el ERP; definir disponibilidad, reparto, remanente, redondeo y dueño de la asignación.

**Verificación mínima propuesta:** Repartos respetan el importe disponible y sus redondeos; reclasificar mantiene asignaciones; vistas del proyecto y Finanzas coinciden.

### FIN-021 — Cotizaciones y transición comercial

**Cobertura:** F11; T16.  
**Resultado propuesto:** Reutilizar o completar el flujo de cotización, clientes y productos con transición financiera definida.

**Antes de ejecutar:** Revisar módulo comercial existente; definir estados, permisos, versionado y transferencia de datos sin crear otro catálogo.

**Verificación mínima propuesta:** Cotización y destino conservan identidad y campos aprobados; errores y cambios de estado tienen trazabilidad.

### FIN-022 — Emisión de documentos y estados asíncronos

**Cobertura:** F11; R12; T16–T17.  
**Resultado propuesto:** Integrar la emisión acordada con preparación, envío, consulta de resultado y vínculo a cobro o pago.

**Antes de ejecutar:** Confirmar proveedor y tipos documentales; separar desarrollo, sandbox y activación real, con alcance autorizado para esta última.

**Verificación mínima propuesta:** Reintentos no emiten duplicados; estados y errores son verificables; resultado enlaza el documento correcto sin simular éxito.

### FIN-023 — Reglas de clasificación y conciliación automática

**Cobertura:** F13; R06, R09; T10, T15.  
**Resultado propuesto:** Configurar y ejecutar reglas con prioridad, alcance, trazabilidad y corrección definida.

**Antes de ejecutar:** Separar sugerencia de aplicación automática; definir conflictos, registros existentes, cambios manuales y activación o desactivación.

**Verificación mínima propuesta:** Ejecución repetida no duplica efectos; una regla no borra decisiones manuales fuera de alcance; efectos históricos y futuros son comprensibles.

### FIN-024 — Asistencia financiera por IA

**Cobertura:** F15; T18–T19.  
**Resultado propuesto:** Responder consultas financieras con datos verificables y, si se acuerda, preparar acciones autorizables.

**Antes de ejecutar:** Elegir capacidades y modelo usando infraestructura actual; definir fuentes, límites, permisos, confirmación y separación de consultas y escrituras.

**Verificación mínima propuesta:** Cifras provienen de servicios financieros comprobables; preguntas ambiguas y falta de datos se manejan explícitamente; no actúa fuera de permisos.

### FIN-025 — API y MCP del ERP

**Cobertura:** F16; T18–T19.  
**Resultado propuesto:** Exponer capacidades propias mediante contratos y permisos coherentes con la aplicación.

**Antes de ejecutar:** Definir consumidores y operaciones del alcance; reutilizar lógica de dominio y acordar autenticación, empresa, auditoría y acciones.

**Verificación mínima propuesta:** Misma consulta y configuración coincide con UI; accesos cruzados fallan; acciones y reintentos respetan reglas del dominio.

### FIN-026 — Canal WhatsApp y notificaciones acordadas

**Cobertura:** F15; T17–T19.  
**Resultado propuesto:** Habilitar los recorridos de canal que se acuerden con identidad y alcance de empresa comprobables.

**Antes de ejecutar:** Confirmar necesidad, proveedor, plantillas y datos a enviar; preparar sandbox y definir autorización para mensajes reales.

**Verificación mínima propuesta:** Identidad y permisos correctos; reintentos no duplican envíos; errores visibles y contenido vinculado a información comprobable.

### FIN-027 — Experiencia multiempresa y consolidación

**Cobertura:** F17; T12, T19.  
**Resultado propuesto:** Completar selección y consultas por empresa y consolidación solo donde la necesidad y permisos lo justifiquen.

**Antes de ejecutar:** Resolver D-002 y qué entidades se consolidan; mantener aislamiento desde cada función anterior, sin postergarlo a este ticket.

**Verificación mínima propuesta:** Cambiar de empresa no conserva datos ajenos; consolidación incluye solo empresas permitidas y aplica la regla de transferencias acordada.

### FIN-028 — Reportes y exportaciones de gestión

**Cobertura:** F06–F12, F18; T07, T11, T18, T20.  
**Resultado propuesto:** Producir reportes del alcance definido y exportaciones consistentes con los servicios financieros.

**Antes de ejecutar:** Precisar cuáles reportes son de caja, gestión o contabilidad; no prometer estados contables completos a partir de datos insuficientes.

**Verificación mínima propuesta:** Filtros, fechas, moneda y fuente se mantienen en exportación; cifras reproducibles; permisos y datos faltantes explícitos.

### FIN-029 — Experiencia integrada y tablero financiero

**Cobertura:** Experiencia transversal; F03, F06–F12, F18.  
**Resultado propuesto:** Conectar los recorridos implementados y presentar indicadores con acceso a su explicación y detalle.

**Antes de ejecutar:** Revisar coherencia de navegación, indicadores, componentes y estados. La UX de cada función debe estar entregada antes; aquí se integra.

**Verificación mínima propuesta:** Cada indicador conduce al detalle que explica su cálculo; filtros y empresa se mantienen coherentes; recorridos prioritarios completos.

### FIN-030 — Validación integrada de procesos financieros

**Cobertura:** T01–T20 aplicables al alcance.  
**Resultado propuesto:** Comprobar procesos completos y consistencia entre superficies usando datos controlados.

**Antes de ejecutar:** Adaptar dependencias al bloque de entrega acordado; conservar casos de áreas posteriores como pendientes. Reutilizar pruebas por función.

**Verificación mínima propuesta:** Matriz de casos con resultados reales; saldos y correcciones coherentes; fallos críticos resueltos y límites documentados.

### FIN-031 — Regresión de módulos consumidores del ERP

**Cobertura:** Dependencias reales del ERP.  
**Resultado propuesto:** Verificar que el cambio financiero preserve los contratos y recorridos de los módulos afectados.

**Antes de ejecutar:** Elegir casos desde el mapa de dependencias, no desde nombres hipotéticos de módulos; diferenciar fallos previos y nuevos.

**Verificación mínima propuesta:** Consumidores prioritarios funcionan con datos y estados nuevos; no hay duplicación de maestros ni regresiones críticas introducidas.

### FIN-032 — Revisión transversal de permisos y operación

**Cobertura:** Acceso, auditoría, errores y operación.  
**Resultado propuesto:** Revisar de extremo a extremo permisos, trazabilidad, fallos y observabilidad del módulo y sus interfaces.

**Antes de ejecutar:** Adaptar a integraciones realmente incluidas; seguridad y operación básicas se construyen por función, aquí se comprueba el conjunto.

**Verificación mínima propuesta:** Pruebas negativas de acceso relevantes; errores operables; auditoría útil sin exposición de secretos; reintentos controlados.

### FIN-033 — Ensayo de transición y preservación de datos

**Cobertura:** D-001, D-010 y plan de transición.  
**Resultado propuesto:** Demostrar que la transición acordada conserva los datos y relaciones necesarios y permite recuperación.

**Antes de ejecutar:** Definir conjunto representativo, comparación de saldos, fuentes de verdad, compatibilidad y reversión; adaptar si solo hay datos de prueba.

**Verificación mínima propuesta:** Ensayo reproducible con diferencias explicadas; relaciones y saldos verificados; recuperación ensayada sin actuar sobre producción.

### FIN-034 — Aceptación de uso y guía operativa

**Cobertura:** Procesos prioritarios y D-003, D-008.  
**Resultado propuesto:** Validar con Patricio los recorridos entregados y dejar una guía para su operación.

**Antes de ejecutar:** Preparar escenarios, datos de ensayo y criterios revisables; registrar qué aspectos de fidelidad funcional y de UX se aceptan.

**Verificación mínima propuesta:** Aceptación explícita del alcance revisado o hallazgos abiertos; procedimientos de uso y corrección comprensibles.

### FIN-035 — Preparación de entrega en staging

**Cobertura:** Plan de entrega y entorno real.  
**Resultado propuesto:** Preparar una versión revisable y las condiciones de activación del bloque acordado.

**Antes de ejecutar:** Comprobar entorno, configuración, migraciones, recuperación y conectores; mantener separados staging y producción.

**Verificación mínima propuesta:** Versión y comprobaciones identificadas; procedimiento de activación y reversión listo; bloqueos de producción explícitos.

### FIN-036 — Activación autorizada y verificación en operación

**Cobertura:** Entrega concreta acordada.  
**Resultado propuesto:** Activar el alcance autorizado en el entorno objetivo y comprobar su funcionamiento real.

**Antes de ejecutar:** Requiere alcance de producción vigente y concreto; revisar resultado de ensayo, ventana operativa y decisiones pendientes.

**Verificación mínima propuesta:** Acciones realizadas y versión registradas; comprobaciones de operación con resultado real; reversión disponible según el plan.

### FIN-037 — Retirada acordada de Finanzas anterior

**Cobertura:** D-010 y observaciones de operación.  
**Resultado propuesto:** Retirar accesos o componentes anteriores que ya no deban operar, preservando los datos y referencias necesarios.

**Antes de ejecutar:** Esperar la condición de estabilidad definida con evidencia; identificar consumidores restantes y acciones irreversibles que requieran alcance específico.

**Verificación mínima propuesta:** Sin dependencias activas inadvertidas; histórico accesible según requisitos; retirada documentada y verificable.

### FIN-038 — Revisión posterior y cierre de cobertura

**Cobertura:** Matriz completa y resultados de uso.  
**Resultado propuesto:** Revisar el resultado operativo, incidencias y cobertura alcanzada para mantener un backlog final honesto.

**Antes de ejecutar:** Definir cuándo revisar con datos de uso reales; no programar tareas o envíos automáticamente por existir esta semilla.

**Verificación mínima propuesta:** Incidencias y pendientes con responsable y prioridad; capacidades aceptadas y no entregadas distinguibles; siguiente etapa acordada.

## Mantenimiento

El archivo `BACKLOG_INICIAL.csv` contiene la misma fotografía de arranque para facilitar su importación. Una vez adoptado el sistema principal en FIN-000, no actualizar dos estados de forma independiente. Conservar el CSV como antecedente o regenerarlo desde la fuente principal.

Registrar divisiones, sustituciones y descartes con motivo y correspondencia de IDs. Mantener una matriz que permita responder qué se entregó, qué está validado, qué falta y qué depende del usuario o de un proveedor. El número inicial de tickets no fija el tamaño final del proyecto.
