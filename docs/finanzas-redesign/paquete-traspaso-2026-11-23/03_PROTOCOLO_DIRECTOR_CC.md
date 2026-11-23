# Protocolo de dirección y ejecución

## Responsabilidades

| Participante | Responsabilidad | Evidencia que recibe o produce |
|---|---|---|
| Claude en claude.ai | Dirigir, definir requisitos, ordenar tickets, preparar prompts y revisar resultados | Contexto del proyecto, informes y evidencias compartidas por Patricio |
| Claude Code | Inspeccionar, implementar, comprobar y mantener archivos del repositorio | Código y entorno reales; informe de cada encargo |
| Patricio | Decidir sobre producto y llevar prompts y resultados entre ambos entornos | Prompt listo para ejecutar y cierre comprensible |

La conversación directora no tiene acceso automático al repositorio. CC no recibe automáticamente los archivos o decisiones de claude.ai. Cada encargo lleva el contexto necesario o una referencia que CC pueda abrir.

## Respuesta habitual del director

1. Resultado de la revisión o situación actual, en pocas frases.
2. Decisión: aceptar, corregir, investigar o solicitar una decisión de producto.
3. Próximo objetivo y razón de su prioridad.
4. Un prompt listo para copiar en CC, siguiendo `plantillas/PROMPT_PARA_CC.md`.
5. Qué debe devolver Patricio para evaluar el resultado.

No redactar un informe extenso por cada ajuste pequeño. Mantener el detalle que ayude a ejecutar y verificar.

## Informe obligatorio de CC

El prompt debe pedir una respuesta autocontenida para el director: ticket, objetivo, resultado, cambios relevantes, criterios de aceptación, comandos o procedimientos ejecutados, resultados, limitaciones, decisiones necesarias y siguiente acción recomendada.

Incluir referencias de archivos y fragmentos o resultados pertinentes cuando el director no pueda abrir las rutas. No volcar secretos, bases completas ni datos personales innecesarios. Distinguir evidencia de Git, evidencia de ejecución y afirmaciones aún no comprobadas.

CC debe actualizar los documentos acordados dentro del repositorio y señalar sus rutas. Si el director necesita leer un documento completo, indicará cuál debe compartir Patricio; no debe asumir que una ruta local le permite leerlo.

## Revisión y cierre

CC entrega un cierre propuesto. El director compara resultados con criterios y dependencias, comprueba la coherencia de la evidencia y toma una decisión:

- **Aceptar:** criterios satisfechos; siguiente ticket listo.
- **Corregir:** defecto o criterio incumplido; prompt acotado de corrección.
- **Pedir evidencia:** afirmación importante sin soporte; solicitar la comprobación concreta que falta.
- **Resolver una decisión:** presentar alternativas y recomendación cuando corresponde a Patricio.

No equiparar falta de acceso del director con fallo del desarrollo, ni aceptar una afirmación sin evidencia por conveniencia. Usar comprobaciones proporcionales al riesgo y al cambio.

El registro del repositorio refleja la revisión aceptada. El director puede incluir su dictamen y la actualización de estado en el siguiente prompt a CC, evitando un encargo adicional solo para cambiar una casilla. Hasta entonces, no afirmar que ese archivo ya fue actualizado.

## Inicio y prioridades

FIN-000 recibe el contexto y establece continuidad. FIN-001 diagnostica el ERP; FIN-002 revalida la investigación pública. FIN-003 documenta la cuenta autorizada de itSave. Los siguientes tickets convierten la evidencia en requisitos, UX, arquitectura y plan.

Si ya hay trabajo verificado, reutilizarlo. El backlog se adapta al estado actual del proyecto; no es necesario ejecutar de nuevo un diagnóstico completo para cumplir una numeración.

El objetivo inicial es el plan completo. Después se implementa el alcance acordado por tickets. Las decisiones técnicas reversibles dentro de un encargo deben avanzar sin preguntas repetidas. Las decisiones de producto y los efectos reales de mayor alcance se resuelven con el contexto y las autorizaciones vigentes.

## Retomar otra conversación

Solicitar o adjuntar el estado actual y los documentos relevantes del repositorio, junto con el último informe y dictamen. Revisar qué cambió desde la última sesión y emitir el siguiente encargo concreto. Este paquete es el contexto inicial, no un registro que se actualice automáticamente durante el desarrollo.
