# Método de ejecución por tickets

Este método permite al director en claude.ai organizar y revisar el trabajo que ejecuta Claude Code en el repositorio, con Patricio como responsable de producto y enlace entre ambos. Las instrucciones vigentes del usuario y las reglas aplicables del repositorio prevalecen. Adaptar los nombres y formatos al sistema existente sin perder trazabilidad.

Para preparar prompts y revisar resultados, aplicar también `03_PROTOCOLO_DIRECTOR_CC.md`. CC entrega el resultado y un cierre propuesto; el director decide si está completo o necesita corrección. El dictamen se persiste en el repositorio mediante CC, incluyendo esa actualización en el siguiente encargo cuando sea práctico.

## 1. Una fuente de verdad

Elegir una ubicación de control durante FIN-000. Usar la convención del repositorio; si no existe, se propone `docs/finanzas-redesign/`. Mantener allí el plan, las decisiones, el estado, el índice de tickets y sus cierres.

Si el proyecto usa un gestor de tareas, decidir cuál es el registro principal y enlazar los documentos. No mantener dos listas con estados independientes. El CSV entregado sirve para importar o consultar el backlog inicial; después de la importación es una fotografía histórica salvo que se establezca una sincronización explícita.

Los IDs F01–F18, R01–R12 y T01–T20 pertenecen al reporte original. Los IDs FIN identifican trabajo del ERP. Relacionarlos; no confundir funciones con tickets ni propuestas de prueba con pruebas ejecutadas.

## 2. Tipos y estados

| Tipo | Significado |
|---|---|
| Ticket | Encargo delimitado que puede prepararse y verificarse |
| Semilla | Área de trabajo propuesta; necesita diagnóstico y refinamiento antes de ejecutarse |

| Estado | Significado |
|---|---|
| POR_REFINAR | Semilla que aún no tiene alcance ejecutable |
| PROPUESTO | Ticket definido de manera inicial, con dependencias o decisiones pendientes |
| LISTO | Cumple condiciones de entrada y tiene alcance autorizado |
| EN_CURSO | Trabajo activo, con responsable y estado registrado |
| BLOQUEADO | Impedimento concreto que detiene su resultado; indicar causa y desbloqueo |
| EN_REVISION | Resultado preparado, pendiente de revisión requerida o de comprobación final |
| HECHO | Criterios cumplidos y evidencia de cierre registrada |
| DESCARTADO | Decisión explícita de no ejecutar, con motivo y efecto en la cobertura |

Una semilla no pasa directamente de POR_REFINAR a EN_CURSO. Primero se convierte en un ticket concreto o en un conjunto de tickets. Si se divide, conservar un ID padre y referencias a los hijos, por ejemplo `FIN-015-A`; ajustar las dependencias y evitar contar padre e hijos como entregas diferentes.

No se considera HECHO un ticket por haber escrito su plan, creado archivos vacíos, generado mocks o marcado una casilla. Una capacidad ya existente puede satisfacerlo si se verifica y queda registrada la evidencia.

## 3. Condiciones para que un ticket esté listo

Antes de comenzar una implementación comprobar:

- Problema y resultado esperado claros, vinculados a una necesidad o requisito.
- Alcance verificable en una unidad de trabajo razonable; dividir si es demasiado grande.
- Dependencias satisfechas o condición alternativa explícita.
- Archivos, servicios o módulos afectados identificados con el código actual.
- Reglas financieras, fuente de datos y permisos necesarios definidos para ese alcance.
- Criterios de aceptación medibles y forma de comprobarlos.
- Efecto en otros módulos y en datos existentes comprendido.
- Alcance autorizado por el usuario o por el plan de ejecución ya acordado.

La condición de entrada no exige resolver todo el producto. Una incertidumbre solo bloquea los tickets que dependan de ella. Registrar los supuestos reversibles y no convertir dudas menores en solicitudes repetidas de aprobación.

Los tickets de diagnóstico usan criterios documentales: evidencia local, referencias comprobables y pendientes honestos. No requieren ejecutar toda la batería de pruebas del ERP por crear documentación.

## 4. Ciclo de trabajo

Las operaciones sobre código y archivos corresponden a CC. La elección del encargo, su prompt y la revisión de la evidencia corresponden al director. Patricio lleva los prompts y devuelve resultados; no se supone memoria compartida.

### A. Retomar

Leer el estado y el ticket activo. Contrastar con Git, instrucciones y cambios externos. Identificar trabajo previo y autorizaciones vigentes. No reiniciar automáticamente el análisis ni asumir que el estado escrito refleja todo cambio posterior.

### B. Preparar

Seleccionar el siguiente ticket listo por dependencias. Si falta precisión, refinarlo antes de cambiar código. Explicar brevemente el resultado que se va a entregar y registrar EN_CURSO.

### C. Ejecutar

Implementar o documentar el alcance. Preservar cambios ajenos. Reutilizar patrones del ERP y resolver elecciones reversibles. Incluir los estados de carga, vacío, error y permiso cuando sean parte de una función visible.

Las pruebas y la UX acompañan a cada función; los tickets finales de integración no sirven para posponerlas. Una conexión externa simulada debe identificarse como tal, con el trabajo real pendiente.

### D. Comprobar

Ejecutar las verificaciones relevantes y las obligatorias del repositorio. Para lógica financiera probar las reglas con casos que detecten fallos reales, no solo que ejecuten el código. Registrar comando, resultado, entorno y límites. No inventar resultados cuando una dependencia no está disponible.

Revisar el cambio completo por coherencia, permisos, efectos en otros módulos y criterios de aceptación. No afirmar que hubo una revisión independiente si no ocurrió.

### E. Cerrar y continuar

Usar `plantillas/CIERRE_TICKET.md`. Actualizar estado, decisiones, cobertura y dependencias. Indicar qué puede comprobar Patricio y el siguiente ticket listo. CC entrega el cierre propuesto para revisión del director. Si se autorizó una secuencia, puede completar el alcance indicado y presentar sus resultados juntos; no ampliar la secuencia por iniciativa propia.

“Continúa” autoriza el siguiente ticket listo conforme al plan. “Ejecuta FIN-XXX” autoriza su alcance definido. Una instrucción para diagnosticar no equivale a autorizar acciones reales sobre la cuenta de referencia o producción.

## 5. Criterio de terminado

Un ticket está HECHO cuando:

1. Entrega el resultado definido y satisface todos sus criterios críticos.
2. Sus comprobaciones tienen evidencia y sus límites están descritos.
3. No deja una regresión crítica introducida sin resolver.
4. Documenta los contratos, cambios de datos o procedimientos afectados que sea necesario mantener.
5. Registra el cierre y actualiza continuidad y dependencias.

La validación del usuario es necesaria cuando el ticket requiere una decisión de producto o aceptación de uso. No añadirla como bloqueo artificial a toda corrección interna. Si existe una limitación no crítica, registrarla con un ticket de seguimiento y explicar por qué no incumple el resultado acordado.

## 6. Bloqueos y cambios de alcance

Un bloqueo debe indicar qué falta, por qué impide el resultado, quién puede resolverlo y qué trabajo independiente puede avanzar. Ejemplos: sesión de referencia no disponible, credenciales de sandbox ausentes, regla crítica sin definición, dato real sin estrategia de preservación.

No suplir una integración real con mocks y cerrar el requisito original. Se puede acordar un ticket de adaptador o simulación con un criterio de cierre distinto y mantener pendiente el conector real.

Si se descubre trabajo nuevo, crear o refinar un ticket y actualizar el plan. No incluir un rediseño transversal inesperado dentro de una corrección pequeña. Si el requisito deja de ser necesario, registrar la decisión y su cobertura; no borrar su historial.

FIN-003 puede bloquearse por falta de acceso a itSave. FIN-001 y la investigación pública pueden avanzar. FIN-004 a FIN-008 pueden preparar partes independientes, pero deben señalar qué requisitos siguen provisionales; no pueden presentar equivalencia validada en áreas que no se observaron.

## 7. Datos, integraciones y activación

Mantener una diferencia visible entre diseño, implementación, prueba local, prueba con proveedor, migración de ensayo y operación real. Una prueba contra un simulador no valida un contrato del proveedor.

La investigación empieza en lectura. Los cambios reales de datos, emisión de documentos, envíos a terceros, contrataciones y producción requieren alcance concreto autorizado, salvo que ya exista una autorización vigente. Preparar el resultado revisable antes de pedir la decisión. No repetir una autorización ya otorgada.

No incorporar secretos ni capturas con datos innecesarios a tickets o repositorios. Conservar solo evidencia pertinente, sanitizada cuando corresponda, con ubicación y fecha.

## 8. Continuidad y mensajes útiles

Actualizar `ESTADO_ACTUAL.md` al terminar cada ticket y antes de finalizar una sesión interrumpida. Debe permitir retomar sin reconstruir el chat: ticket, estado, cambios, pruebas, decisiones, bloqueo y siguiente acción.

Mensajes que puede usar Patricio:

- `Continúa con el siguiente ticket listo.`
- `Ejecuta FIN-XXX y cierra con evidencia.`
- `Refina FIN-XXX con lo que ya sabemos; no implementes todavía.`
- `Ejecuta los siguientes N tickets listos del plan acordado y detente si aparece un bloqueo que requiera una decisión mía.`
- `Revisa el estado real del repositorio y retoma desde ESTADO_ACTUAL.md.`

No hace falta pegar este método en cada sesión si está registrado y enlazado desde las instrucciones del proyecto.
