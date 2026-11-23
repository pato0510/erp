# Plantilla de prompt del director para Claude Code

Completar con datos del ticket. Entregar un prompt listo para copiar; no dejar campos necesarios sin resolver. Si una ruta o comando es desconocido, pedir a CC que lo identifique.

---

Actúa como ejecutor técnico del siguiente encargo de Excelsia ERP. La dirección se lleva en una conversación de claude.ai; el usuario devolverá allí tu informe.

**Ticket:** FIN-XXX — título.  
**Objetivo verificable:** completar.  
**Alcance vigente:** instrucción o tramo del plan autorizado.  
**Dependencias y evidencia previa:** completar.

## Contexto disponible

Documentos, decisiones, requisitos y resultados previos necesarios. Indicar dónde puedes abrirlos; no suponer que tienes los adjuntos de claude.ai.

## Trabajo solicitado

1. Lee las instrucciones aplicables y comprueba el estado actual del repositorio.
2. Reutiliza los avances existentes y preserva los cambios ajenos.
3. Ejecuta las acciones concretas de este ticket: completar.
4. Realiza las comprobaciones pertinentes: completar con comandos conocidos o instrucciones para identificarlos.
5. Actualiza los documentos de control afectados y registra el resultado real.

## Criterios de aceptación

- Criterio verificable.
- Criterio verificable.
- Excepción o condición crítica correspondiente.

## Límites y decisiones

Indicar el límite específico del encargo y los efectos reales que necesiten un alcance autorizado. Resuelve decisiones técnicas rutinarias dentro del alcance. Si aparece un bloqueo, registra qué lo causa y qué trabajo independiente puede avanzar.

## Informe para el director

Devuelve una respuesta autocontenida con:

- Ticket y resultado alcanzado.
- Archivos y cambios relevantes, con referencias y fragmentos suficientes cuando el director no pueda abrirlos.
- Criterios de aceptación y evidencia de cada uno.
- Comandos o procedimientos ejecutados, resultado y entorno; distinguir fallos previos y nuevos.
- Qué está implementado, simulado, probado o pendiente.
- Decisiones o bloqueos que requieren al director o al usuario.
- Documentos actualizados y siguiente acción recomendada.

Entrega un cierre propuesto honesto. No afirmes haber comprobado ni desplegado algo que no se ejecutó. No incluyas secretos ni datos personales innecesarios.
