# Traspaso maestro — Excelsia ERP: Claude director y Claude Code ejecutor

**Fecha de corte:** 23 de noviembre de 2026, Chile.  
**Solicitante:** Patricio Bonilla.  
**Destino:** la conversación dentro del proyecto Excelsia ERP en claude.ai.  
**Ejecución técnica:** Claude Code, abierto en el repositorio real del ERP.  
**Versión:** 2; incorpora la distribución de roles solicitada después del primer paquete.  
**Objetivo inmediato:** consolidar el diagnóstico y el plan completo de desarrollo.  
**Objetivo posterior:** ejecutar y validar la transformación de Finanzas, ticket a ticket.

## 1. Instrucción vigente y distribución de roles

Patricio quiere continuar esta actividad en una conversación del proyecto Excelsia ERP en claude.ai. Esa conversación será el **director técnico y de producto**: analizará, planificará, preparará prompts para Claude Code y revisará sus resultados.

**Claude Code (CC)** inspeccionará el repositorio, implementará los encargos, ejecutará comprobaciones y mantendrá los registros dentro del proyecto. **Patricio** decidirá sobre el producto, ejecutará los prompts en CC y devolverá las respuestas y evidencias al director.

El objetivo es transformar el módulo financiero del ERP existente tomando itSave como referencia funcional y de experiencia de uso. El ERP ya tiene Finanzas, pero el usuario no está conforme con el resultado actual. La disponibilidad del ERP completo sirve para comprender e integrar dependencias; no amplía automáticamente el encargo a reescribir todo el ERP.

Esta distribución reemplaza las instrucciones anteriores que asignaban toda la dirección a Claude Code o que exigían regresar a ChatGPT. El director debe preparar encargos utilizables y evaluar resultados; no debe asumir que ve el repositorio o que comparte memoria, archivos o sesiones con CC.

El diagnóstico inicial es documental. La implementación posterior avanza mediante tickets definidos dentro del plan acordado con Patricio. Las instrucciones vigentes del usuario y las reglas aplicables del entorno mantienen su prioridad.

## 2. Contexto confirmado

- El producto de referencia es itSave: <https://www.itsave.cl/>.
- Es una plataforma web.
- Patricio tiene acceso como usuario y puede recorrer sus funciones.
- Busca comprender qué hace, cómo lo usa una empresa y qué reglas explican sus resultados.
- Considera itSave una referencia valiosa por su enfoque en necesidades empresariales; esta valoración no equivale a una auditoría independiente de sus resultados.
- El destino es Finanzas dentro de su ERP existente.
- Quiere un plan completo y una ejecución ordenada por tickets.
- Claude Code tiene el contexto y el código completo del ERP en su entorno de trabajo.

En antecedentes previos el ERP se identifica como **Excelsia**. Aparecen referencias históricas a Next.js/TypeScript, NestJS, PostgreSQL/Prisma y Nx. Son antecedentes para orientar la búsqueda, no evidencia del stack instalado hoy.

**Regla de trabajo:** el repositorio actual describe lo implementado; Patricio define lo que se quiere lograr. Si difieren, documentar la brecha. No tratar el código actual como una restricción que impida mejorar el producto ni tratar una propuesta antigua como tecnología ya implementada.

## 3. Lo que ya se hizo y lo que falta

### Investigación disponible

Se estudiaron ArtCraft/Craft Anything, REA, Playwright MCP, Chrome DevTools MCP, Ghidra y JADX. Se revisaron fuentes oficiales y documentación pública de itSave, incluyendo API REST, MCP, catálogo de operaciones y OpenAPI.

El reporte original, incluido completo en `referencias_historicas/ItSave_Reporte_Investigacion_Claude_Code.md`, contiene el detalle y 23 fuentes. Sus hallazgos son documentales, con preguntas para observación y pruebas.

### Límites de la evidencia a la fecha del traspaso

- No se ha inspeccionado aquí el repositorio actual del ERP.
- No se ha accedido a la cuenta privada de itSave del usuario.
- No se han comprobado las capacidades de su plan o rol.
- No se han ejecutado en su equipo las herramientas investigadas.
- No se ha validado equivalencia funcional entre el ERP e itSave.
- No se ha obtenido la arquitectura interna ni el código del servidor de itSave.
- No hay tickets de implementación cerrados como consecuencia de este trabajo.

Si el proyecto de Claude o CC ya contiene diagnósticos, pruebas, tickets o cambios, incorporarlos después de verificar su evidencia. El director consulta lo disponible en la conversación y pide a CC comprobar el repositorio. No comenzar desde cero por recibir este paquete.

## 4. Resultado esperado del proyecto

El objetivo completo incluye:

1. Inventario trazable de las capacidades relevantes de itSave y del estado del ERP.
2. Especificación de procesos financieros completos, sus excepciones y resultados.
3. Definición de la experiencia de uso y de su integración en el ERP.
4. Arquitectura, modelo de datos y contratos internos adecuados al proyecto existente.
5. Integraciones externas identificadas con sus requisitos reales.
6. Estrategia de preservación y transición de datos, cuando corresponda.
7. Backlog completo por dependencias, con tickets suficientemente concretos para implementarlos.
8. Implementación incremental y comprobaciones de cada resultado.
9. Validación funcional con Patricio y verificación de regresiones en otros módulos.
10. Preparación de entrega, activación y seguimiento del módulo según el alcance acordado.

La fidelidad a itSave se evaluará por procesos, información disponible, reglas observadas y facilidad de uso. La interfaz debe estudiarse en detalle; no reducir el encargo a una nueva página de indicadores. Las decisiones de identidad visual y reutilización de componentes se resolverán con el contexto actual del ERP.

Las prioridades ordenan el desarrollo. No suprimen del mapa funciones pendientes ni convierten automáticamente el alcance completo en un MVP reducido.

## 5. Uso de la investigación de itSave

### Herramientas: recomendación previa, pendiente de prueba práctica

La combinación inicialmente sugerida fue Claude Code con Playwright para explorar recorridos y DevTools cuando haga falta inspeccionar intercambios del navegador. REA puede ayudar a resolver dudas técnicas concretas. Craft Anything puede probarse en un módulo acotado. La comparación completa está en el reporte original.

No instalar todas las herramientas por rutina ni asumir que una reconstrucción visual prueba cálculos financieros. Usar primero lo que ya esté disponible y añadir una herramienta cuando resuelva una necesidad identificada. Verificar sus requisitos actuales en las fuentes oficiales antes de configurarla.

### Entradas documentales prioritarias

- Producto: <https://www.itsave.cl/>
- MCP: <https://www.itsave.cl/mcp>
- API REST: <https://www.itsave.cl/api-rest>
- Catálogo: <https://plataforma.itsave.cl/api/rest/v1/tools>
- OpenAPI: <https://plataforma.itsave.cl/api/rest/v1/openapi.json>

Estos recursos se consultaron durante la investigación. Revalidarlos al comenzar y registrar la fecha. El catálogo puede cambiar; no fijar un número de operaciones basándose en una página comercial.

### Estados de evidencia

| Estado | Uso |
|---|---|
| USUARIO | Información confirmada por Patricio |
| PUBLICADO | Declaración comercial pública |
| DOCUMENTADO | Descripción en documentación o contrato técnico |
| OBSERVADO | Comportamiento visto en una sesión autorizada |
| VALIDADO | Resultado comprobado mediante un caso repetible |
| HIPÓTESIS | Explicación por comprobar |
| PROPUESTA | Decisión de diseño para el ERP propio |
| NO OBSERVADO | No se pudo comprobar; no significa inexistente |

Cada regla y función debe conservar su procedencia. Una propuesta de base de datos propia no es el esquema recuperado de itSave. La salida de una API no demuestra el algoritmo que la produce.

## 6. Cobertura funcional de partida

Conservar los IDs F01–F18 del reporte para relacionar capacidades, evidencias y tickets. El detalle factual permanece en ese documento; esta tabla organiza el trabajo propuesto para el ERP.

| Referencia | Área a cubrir en el plan | Criterio de integración que deben resolver director y CC |
|---|---|---|
| F01 | Bancos y cuentas | Fuente, sincronización, errores e identidad de movimientos |
| F02 | Documentos del SII | Importación, identidad documental y relación con registros existentes |
| F03 | Movimientos | Listados, detalle, filtros y datos pendientes |
| F04 | Conciliación | Asociaciones, asignaciones parciales, correcciones y saldos |
| F05 | Clasificación | Catálogos, reglas, correcciones y consistencia |
| F06–F07 | Flujo de caja y personalización | Fechas, fuentes, estructura, totales y configuración |
| F08 | Calendario | Documentos, compromisos y vencimientos |
| F09–F10 | Cuentas por cobrar y pagar | Pendientes, antigüedad y vínculo con pagos |
| F11 | Cotización y facturación | Proceso comercial, estados y emisión |
| F12 | Proyectos | Distribución y consumo de datos por otros módulos |
| F13 | Automatizaciones | Condiciones, prioridad, ejecución y corrección |
| F14 | Categorías y entidades relacionadas | Responsabilidad de catálogos compartidos |
| F15 | Asistencia por IA y canales | Consultas, acciones y confirmaciones |
| F16 | API y MCP propios | Contratos y permisos del ERP, independientes del producto de referencia |
| F17 | Multiempresa | Alcance de acceso y consolidación autorizada |
| F18 | Resultados y contabilidad | Verificar la capacidad real antes de fijar requisitos |

Los escenarios T01–T20 del reporte son pruebas propuestas, no resultados ya comprobados. Las reglas R01–R12 son antecedentes documentados que requieren contraste cuando corresponda.

## 7. Diagnóstico del ERP: alcance mínimo

El director debe encargar a CC un diagnóstico que cubra:

- Identidad del repositorio, rama, commit y cambios existentes.
- Instrucciones locales, convenciones, documentación y trabajo previo de esta iniciativa.
- Stack y versiones comprobados en archivos actuales.
- Pantallas, rutas, servicios, esquemas, migraciones, jobs y pruebas de Finanzas.
- Diferencia entre lógica operativa, código sin comprobar, implementaciones parciales y datos de demostración.
- Autenticación, selección de empresa, roles y controles de acceso.
- Catálogos y datos compartidos con los módulos realmente presentes.
- Representación de importes, monedas, fechas, redondeos, saldos y estados.
- Integraciones existentes y estado comprobable de cada una.
- Datos a preservar y dependencias de una transición.
- Comandos y comprobaciones pertinentes; distinguir fallos previos de fallos introducidos.

Por cada dependencia entre módulos explicar quién es dueño del dato, quién lo modifica, cómo se intercambia y qué se afecta si cambia. No crear un segundo maestro de clientes, empresas o trabajadores sin una decisión explícita que lo justifique.

## 8. Decisiones todavía pendientes

Las tres preguntas planteadas al usuario anteriormente no tienen respuesta registrada en este traspaso:

1. ¿Finanzas tiene datos reales que se deben conservar o solo datos de prueba?
2. ¿El ERP se utilizará solo en sus empresas o también en empresas clientes?
3. ¿Qué parte del módulo actual le desagrada más: diseño, funciones, resultados o el conjunto?

El director debe revisar primero el contexto del proyecto y los informes disponibles; puede pedir a CC que contraste documentación local. Si las respuestas ya existen, registrarlas sin volver a preguntar. Si no, solicitarlas de forma breve mientras avanza el trabajo independiente.

Hasta aclarar el primer punto, preservar los datos y planificar sin suponer que se pueden reiniciar. No elegir un modelo de comercialización o aislamiento multiempresa basándose en silencio del usuario.

Otras decisiones aparecerán al analizar el ERP. Registrar cada una con su impacto, alternativas, recomendación y estado en `DECISIONES_PENDIENTES.md` o su equivalente existente.

## 9. Etapas y condiciones para avanzar

| Etapa | Resultado | Condición para pasar a la siguiente |
|---|---|---|
| A. Contexto y diagnóstico | Estado real del ERP y fuentes revalidadas | Evidencia suficiente para delimitar brechas |
| B. Requisitos y experiencia | Procesos, reglas, prototipo o flujos y matriz de cobertura | Dudas críticas identificadas y requisitos trazables |
| C. Diseño y plan | Arquitectura integrada, datos, integraciones, transición y backlog | Plan concreto acordado con Patricio y primer ticket de implementación listo |
| D. Implementación por tickets | Funciones verificadas de forma incremental | Criterios de aceptación y dependencias cumplidos |
| E. Validación y entrega | Regresión, validación de uso y preparación operativa | Condiciones del entorno y autorización aplicable a la entrega |
| F. Estabilización | Incidencias tratadas y cobertura revisada | Resultados observados y pendientes visibles |

No es necesario conocer cada detalle de todos los módulos para avanzar en un segmento independiente bien definido. Mantener visible qué partes del plan son firmes y cuáles requieren más investigación. Un bloqueo en la sesión de itSave no impide diagnosticar el ERP; tampoco permite declarar validado lo que falta observar.

El acuerdo del plan fija dirección y alcance. No establece una aprobación adicional para cada archivo o cambio rutinario dentro de un ticket autorizado.

## 10. Autoridad de ejecución y límites prácticos

### Trabajo que debe avanzar sin consultas repetitivas

Lectura de código y fuentes, diagnóstico, organización de documentación, refinamiento de tickets y decisiones técnicas reversibles dentro del alcance. Cuando el usuario autoriza implementar un ticket o una secuencia, realizar los cambios locales necesarios y sus comprobaciones sin volver a pedir permiso por cada paso.

Respetar los límites del ticket y las instrucciones del repositorio. Preferir cambios verificables y compatibles con el resto del ERP. Reutilizar módulos sólidos y justificar los reemplazos necesarios.

### Decisiones que necesitan contexto o autorización concreta

Un cambio relevante de alcance, una integración pagada, envío a terceros, emisión tributaria real, manipulación irreversible de datos o activación en producción no se deducen de la autorización para investigar. Si ya hay autorización explícita y vigente para una acción, conservarla; no pedirla de nuevo. Antes de plantear una decisión, preparar el resultado y su impacto para que el usuario pueda evaluarlo.

La exploración de itSave comienza en modo lectura con la sesión del usuario. Los ensayos que cambien información se realizan en un entorno de prueba adecuado o con un caso expresamente autorizado. No utilizar la investigación como motivo para emitir documentos o enviar notificaciones reales.

### Trabajo de implementación, Git y entornos

- Conservar cambios previos del usuario y respetar la estrategia de ramas actual.
- Registrar el estado real de Git y los cambios del ticket; no atribuirse cambios ajenos.
- Separar implementación local, commit, merge y despliegue en el reporte de cierre.
- No afirmar que algo está desplegado porque compila o porque se creó un commit.
- Probar migraciones con datos controlados y resolver preservación antes de aplicarlas sobre datos reales.
- Mantener secretos y datos personales innecesarios fuera de reportes, tickets y repositorios.

## 11. Operación entre director, usuario y Claude Code

El método detallado está en `METODO_TICKETS.md` y el intercambio en `03_PROTOCOLO_DIRECTOR_CC.md`.

1. El director elige el siguiente ticket por dependencias y evidencia, define el resultado y entrega un prompt autocontenido para CC.
2. Patricio ejecuta ese prompt en CC, abierto en el repositorio real.
3. CC inspecciona o implementa el alcance, realiza las comprobaciones y entrega un cierre propuesto con evidencia. Mantiene los documentos del proyecto.
4. Patricio devuelve al director la respuesta y los archivos o evidencias relevantes.
5. El director contrasta el resultado con los criterios, pide una corrección concreta si hace falta o acepta el cierre y prepara el siguiente encargo.

El modo inicial es un encargo por vez. Si Patricio autoriza una secuencia, respetar ese alcance sin inventar consultas por cada cambio rutinario. El director no debe emitir varios prompts incompatibles mientras un ticket siga activo.

Cada prompt debe incluir ticket, objetivo, contexto accesible, alcance, dependencias, criterios de aceptación, verificaciones, documentación que actualizar e informe de salida. No inventar rutas ni comandos: si no se conocen, CC debe identificarlos.

El diagnóstico debe resolver incertidumbres y producir decisiones. FIN-008 consolida el plan y deja el primer ticket de implementación listo. Las 29 semillas posteriores requieren refinamiento con el código real; pueden dividirse, reutilizarse o sustituirse con trazabilidad.

Una respuesta de CC que diga «terminado» no basta para aceptar un ticket. El director revisa evidencia y distingue código, simulación, prueba con proveedor y operación real. Tampoco exige repetir verificaciones sin una razón concreta.

Si el proyecto ya tiene un sistema de tickets, reutilizarlo y conservar correspondencia con estos IDs. No crear dos registros con estados independientes.

## 12. Calidad financiera y criterios de aceptación

Para cada función relevante seleccionar los invariantes y casos que correspondan. Estos son objetivos de validación del ERP propio, no afirmaciones adicionales sobre itSave:

- Un mismo hecho económico no debe contarse dos veces por importación, reintento o cambio de canal.
- Los saldos deben explicar sus componentes y sus ajustes.
- Los importes aplicados a documentos y proyectos deben respetar las reglas aprobadas de disponibilidad y redondeo.
- Las fechas bancaria, documental, de vencimiento y de imputación deben tener semántica explícita.
- Cambiar una categoría no debe borrar asociaciones ajenas a ese cambio.
- Una corrección debe tener trazabilidad y efectos definidos en consultas y reportes.
- Los resultados deben ser consistentes entre vistas cuando se usan el mismo alcance y configuración.
- Cada usuario solo debe acceder y actuar dentro de sus empresas y permisos.
- Los procesos asíncronos deben distinguir inicio, resultado, error y reintento.
- Una respuesta narrativa de IA debe poder contrastarse con el resultado del sistema.

Validar con casos que puedan fallar por errores reales. Elegir pruebas proporcionales al cambio y ejecutar las comprobaciones obligatorias del repositorio. No agregar pruebas que solo repitan la implementación ni marcar un ticket como terminado con un criterio crítico pendiente.

## 13. Continuidad entre sesiones y entre entornos

El repositorio mantiene una única fuente de verdad para plan, tickets, decisiones, cobertura y estado. CC la actualiza mediante los encargos del director. Si no existe una convención, se propone `docs/finanzas-redesign/`.

El director conserva una síntesis de gestión en la conversación y solicita los documentos o informes pertinentes cuando necesite verificar el estado. No afirma haber actualizado el repositorio desde el chat si no dispone de ese acceso.

Al cerrar un encargo o una sesión registrar:

- Ticket y estado real; resultado, pendientes y bloqueo concreto.
- Archivos relevantes, rama y commit cuando estén comprobados.
- Comprobaciones ejecutadas, resultados y límites.
- Decisiones y autorizaciones vigentes con su alcance.
- Dictamen del director y correcciones solicitadas, si corresponde.
- Siguiente acción concreta y contexto necesario para ejecutarla.

Al retomar, el director revisa el último informe y CC contrasta los registros con el estado real del repositorio. Una decisión de revisión puede persistirse junto con el siguiente encargo; no inventar una actualización de archivos que aún no ocurrió.

Puede mantenerse una referencia breve desde el `CLAUDE.md` existente si su convención lo permite, conservando su contenido previo. La conversación directora y CC no comparten memoria ni archivos automáticamente.

## 14. Inicio en el proyecto de claude.ai

Patricio puede adjuntar `Excelsia_ERP_Contexto_Completo_Para_Claude.md` como contexto del proyecto y pegar `01_PROMPT_INICIO_DIRECTOR.md` en la conversación. El documento consolidado incluye los documentos vigentes, tickets, plantillas y la investigación original. Las instrucciones históricas reemplazadas quedan en archivos separados dentro del ZIP.

El director lee el contexto disponible, resume el objetivo y la evidencia faltante y entrega el primer prompt para CC. FIN-000 permite reconocer el proyecto, aprovechar avances y establecer continuidad; FIN-001 desarrolla el diagnóstico. Si un resultado ya está verificado, reutilizarlo y avanzar al siguiente trabajo necesario.

El primer encargo no modifica lógica de negocio ni aplica migraciones sobre datos reales. Cuando exista una instrucción previa más amplia y vigente del usuario, conservarla y registrar su alcance.

El director debe producir un prompt ejecutable, no limitarse a proponer que se empiece. El plan completo se concreta mediante diagnóstico, requisitos y decisiones del proyecto real; importar el backlog no lo convierte en un plan ya validado.

