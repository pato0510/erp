# Registro inicial de decisiones

El director consulta primero el contexto y la documentación del proyecto y pide a CC contrastar el repositorio cuando corresponda. Las preguntas siguientes no tienen respuesta registrada en este paquete; no es necesario repetirlas si Patricio ya las respondió en su proyecto.

## Decisiones de producto prioritarias

| ID | Decisión o pregunta | Por qué importa | Qué puede avanzar sin respuesta | Estado |
|---|---|---|---|---|
| D-001 | ¿Hay datos financieros reales que preservar o solo datos de prueba? | Determina transición, conciliación de saldos, compatibilidad y reversión | Diagnóstico de código, inventario y estrategia conservadora | PENDIENTE |
| D-002 | ¿El ERP operará solo para empresas propias o también para empresas clientes? | Define alcance de aislamiento, administración y posible consolidación | Documentar el modelo actual y mantener controles existentes | PENDIENTE |
| D-003 | ¿Qué desagrada del módulo actual y cuáles son los recorridos de itSave que quiere reproducir primero? | Define prioridades y criterios de aceptación de experiencia | Inventariar todo el alcance y detectar brechas comprobables | PENDIENTE |

Si siguen abiertas, formular una sola consulta breve y agrupada. No bloquear el reconocimiento del proyecto por estas preguntas.

## Decisiones que debe resolver el análisis

Son temas de diseño pendientes, no preguntas que Patricio deba responder todas de inmediato. El director debe investigar con las fuentes disponibles, encargar a CC la inspección técnica necesaria, formular una recomendación y consultar solo donde haga falta una decisión de producto, datos o contratación.

| ID | Tema | Evidencia necesaria | Momento |
|---|---|---|---|
| D-004 | Mantener, refactorizar o sustituir cada parte de Finanzas | Diagnóstico del código, uso real y brechas | FIN-004 / FIN-006 |
| D-005 | Responsabilidad de clientes, proveedores, trabajadores, proyectos, empresas y documentos | Módulos existentes, modelos y flujos actuales | FIN-001 / FIN-006 |
| D-006 | Proveedores y mecanismos de bancos, SII y emisión | Conectores existentes, contratos, sandbox, requisitos y costes reales | FIN-007 |
| D-007 | Monedas, fechas, precisión, redondeo y reglas de saldos | Código actual, casos de negocio y referencia observable | FIN-004 / FIN-006 |
| D-008 | Prioridades de paridad funcional y fidelidad de UX | Recorridos de itSave y validación del usuario | FIN-004 / FIN-005 / FIN-008 |
| D-009 | Alcance de IA, MCP y WhatsApp | Necesidad del usuario, infraestructura y permisos | FIN-004 / FIN-007 / FIN-008 |
| D-010 | Transición y retiro del módulo anterior | Datos reales, dependencias, reversión y operación | FIN-007 / FIN-008 |
| D-011 | Alcance de reportes contables y de gestión | Evidencia de la referencia, necesidades propias y datos disponibles | FIN-002 / FIN-003 / FIN-004 |
| D-012 | Herramientas de inspección que realmente hacen falta | Capacidades instaladas, acceso disponible y brechas concretas | FIN-000 / FIN-002 / FIN-003 |

## Formato para resolver o añadir una decisión

```text
ID:
Pregunta:
Hechos y fuentes:
Alternativas relevantes:
Recomendación de Claude y motivo:
Impacto en datos, módulos y tickets:
Quién decide y por qué:
Estado: PENDIENTE / PROPUESTA / ACORDADA / REEMPLAZADA
Decisión adoptada, fecha y evidencia de acuerdo:
Tickets afectados y acción siguiente:
```

No registrar como ACORDADA una recomendación sin aceptación cuando requiera una decisión del usuario. Las decisiones técnicas rutinarias dentro de un ticket autorizado pueden resolverse y documentarse sin una nueva ronda de aprobación.
