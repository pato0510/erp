# INSTRUCTIVO DE ARRANQUE — Excelsia ERP

## Cómo continuar el proyecto en una nueva sesión (nuevo director + nuevo Claude Code ejecutor), desde tu máquina de siempre

> Este documento es TU guía operativa (Pato). Está en español porque es para ti.
> Los otros dos documentos del paquete están en inglés porque son artefactos
> técnicos que leen los agentes.

---

## 0. EL PAQUETE — 3 documentos

1. **EXCELSIA-TECHNICAL-HANDOFF.md** (inglés) — La historia completa del
   desarrollo, arquitectura, invariantes, los ~30 tickets de Finanzas, los 37
   de Operaciones, la saga SII (mock → LibreDTE descartado → BaseAPI),
   incidentes de producción, trabajo revertido (FIN-001), backlog V2 y roadmap.
   Lo leen el director Y Claude Code.

2. **REPO-VERIFICATION-PROMPT.md** (inglés) — El protocolo de 8 fases, read-only,
   que Claude Code ejecuta como PRIMERA tarea para tomar posesión técnica del
   repo y producir un TECHNICAL-OWNERSHIP-REPORT.md cotejando el código real
   contra el handoff. Trae al final los prompts de seguimiento (fix FASE 0,
   arranque RRHH, mejoras Operaciones).

3. **INSTRUCTIVO-ARRANQUE.md** (este archivo) — La guía de arranque y el prompt
   del director.

Los tres viven en el repo (carpeta `docs/`), así Claude Code puede leerlos
durante la verificación.

---

## 1. CONTEXTO DE PARTIDA

- Sigues trabajando en tu máquina de siempre. Todo ya está configurado:
  Claude Code instalado, repo clonado en `~/Desktop/excelsia-erp/erp`,
  `.env` en su lugar, dependencias compiladas, DB local con datos.
- Producción sale del repo: cada push a `develop` despliega a
  app.excelsia.cl tras CI verde. No hay staging; tu local es staging.
- Modelo de trabajo de dos niveles:
  - DIRECTOR = una conversación de Claude.ai (navegador). Planifica, escribe
    los prompts para Claude Code, revisa sus reportes. No toca código.
  - CLAUDE CODE (CC) = el ejecutor en la terminal. Implementa de forma
    autónoma. Un "nuevo ejecutor" es simplemente una sesión fresca de `claude`.
  - TÚ apruebas planes, validas en local y commiteas.

---

## 2. PASO A PASO

### ETAPA 0 — Sanity check (2 min)

Confirma que partes desde el estado real de producción.

```bash
cd ~/Desktop/excelsia-erp/erp
git fetch origin
git status                       # ¿working tree limpio? ¿up to date con origin/develop?
git log --oneline -5
git stash list
```

- Si está limpio y al día → perfecto, partes desde producción.
- Si tienes trabajo en progreso sin commitear: decide si lo commiteas (a un
  ticket real), lo guardas en stash, o lo descartas. No arranques la
  verificación sobre un árbol sucio sin saber qué hay.

### ETAPA 1 — Colocar los documentos en el repo y commitear

Guarda los tres `.md` en `docs/` y súbelos.

```bash
mkdir -p docs
# copia los 3 archivos a docs/ (desde donde los descargaste)
git add docs/EXCELSIA-TECHNICAL-HANDOFF.md \
        docs/REPO-VERIFICATION-PROMPT.md \
        docs/INSTRUCTIVO-ARRANQUE.md
git commit -m "docs: add technical handoff, verification protocol and startup guide"
git push origin develop
```

Nota: este push dispara un deploy a producción, pero es solo documentación
(no hay cambio de código), así que es inofensivo.

### ETAPA 2 — Abrir la conversación del nuevo director

Abre una conversación nueva en Claude.ai (desde el navegador). Pega el prompt
de arranque (sección 3 de este documento) y **adjunta** estos dos archivos:
`EXCELSIA-TECHNICAL-HANDOFF.md` y `REPO-VERIFICATION-PROMPT.md`.

Su primera respuesta debe ser un resumen de máximo 15 líneas con los 3 riesgos
principales. Si entre esos riesgos NO aparece el tema SII/mock-sii, no leyó
bien — reinícialo.

### ETAPA 3 — El director dirige la verificación con un Claude Code fresco

El director te entrega el mensaje exacto para CC (es el contenido de
REPO-VERIFICATION-PROMPT.md, que ya tiene revisado). Abre una sesión nueva de
Claude Code en el repo y pégalo:

```bash
cd ~/Desktop/excelsia-erp/erp
claude
# (opcional) elige el modelo ejecutor con: /model
# pega el contenido de REPO-VERIFICATION-PROMPT.md
```

CC explora en modo read-only (no toca nada, no corre git de escritura) y
produce `docs/TECHNICAL-OWNERSHIP-REPORT.md`. Tú lo commiteas:

```bash
git add docs/TECHNICAL-OWNERSHIP-REPORT.md
git commit -m "docs: add technical ownership report"
git push origin develop
```

Luego le llevas los hallazgos al director.

### ETAPA 4 — Revisar el reporte → FASE 0 (fix SII/BaseAPI)

El director revisa el reporte, en especial el veredicto de BaseAPI, y define
los tickets FIX-001+ de FASE 0. Tú apruebas el plan, CC implementa, tú validas
en local y commiteas. NADA de módulos nuevos hasta cerrar esto. El prompt para
aplicar el fix ya está al final de REPO-VERIFICATION-PROMPT.md.

### ETAPA 5 — Entregar el nuevo plan de trabajo

Recién aquí le pasas al director tu plan con los desafíos que vienen:

- Tu lista de **mejoras a Operaciones** → tickets OPS-038+ (cotejando contra
  el backlog V2 del handoff §11 para no duplicar alcance).
- El plan de **RRHH** (luego HSEC, Comercial) → HR-001…HR-NNN con la misma
  metodología.

---

## 3. PROMPT DE ARRANQUE DEL DIRECTOR

Pega esto como primer mensaje en la conversación nueva del director, con los
dos documentos adjuntos.

```
Vas a asumir el rol de DIRECTOR TÉCNICO Y ARQUITECTO del proyecto Excelsia ERP,
tomando la posta de un director anterior que dejó documentación de traspaso
completa. Trabajarás conmigo (Pato, dueño del proyecto y único humano del equipo)
bajo una metodología de orquestación de dos niveles:

- TÚ (este chat): arquitecto, planificador de sprints/tickets, redactor de prompts
  para Claude Code, revisor de sus reportes, guardián de las convenciones.
- CLAUDE CODE (CC): implementador. Trabaja de forma cada vez más autónoma
  (modo agente / Ultracode). Yo ya no quiero ser puente entre ustedes más que
  para aprobar planes, validar entregas y commitear.

═══════════════════════════════════════════
ARCHIVOS QUE DEBES LEER ANTES DE RESPONDER
═══════════════════════════════════════════
Te adjunto en este mensaje:

1. EXCELSIA-TECHNICAL-HANDOFF.md — Historia completa del desarrollo
   (abril-junio 2026): stack, arquitectura, invariantes de seguridad
   multi-tenant, los ~30 tickets del módulo Finanzas, los 37 del módulo
   Operaciones, la historia de la integración SII (mock → LibreDTE
   descartado → BaseAPI), incidentes de producción con sus lecciones,
   trabajo revertido (FIN-001), backlog V2 (~70 items) y roadmap acordado.

2. REPO-VERIFICATION-PROMPT.md — Protocolo de 8 fases que CC debe ejecutar
   como PRIMERA tarea (read-only) para tomar posesión técnica del repo y
   producir un TECHNICAL-OWNERSHIP-REPORT.md cotejando el código real
   contra el handoff. Incluye los prompts de seguimiento ya redactados.

Léelos COMPLETOS antes de proponerme nada. El repo es la verdad; CLAUDE.md
en la raíz del repo es el estado operativo vivo; el handoff es el contexto
histórico. Ante conflicto: repo > CLAUDE.md > handoff, pero toda
discrepancia se reporta.

═══════════════════════════════════════════
CONTEXTO OPERATIVO MÍNIMO
═══════════════════════════════════════════
- Producción: https://app.excelsia.cl / https://api.excelsia.cl (Railway,
  Hobby Plan). Cada push a develop DESPLIEGA A PRODUCCIÓN automáticamente
  tras CI verde. No hay staging: local es staging.
- Repo: github.com/pato0510/erp, rama develop. Local: ~/Desktop/excelsia-erp/erp
- Estado: Finanzas V1 ✅ y Operaciones V1 ✅ (37/37). Estrategia acordada:
  completar TODOS los módulos en V1 (RRHH → HSEC → Comercial) antes de
  cualquier V2. Única excepción: fixes críticos se atienden YA.
- Fix crítico pendiente (FASE 0): verificar que la integración SII corre
  con BaseAPI real y no con mock-sii en producción (detalle en handoff §8).
- Tengo los planes de desarrollo de los módulos restantes (RRHH, HSEC,
  Comercial) en archivos aparte que te iré entregando. También tengo una
  lista de mejoras a módulos existentes que estructuraremos como tickets.

═══════════════════════════════════════════
CONVENCIONES INQUEBRANTABLES
═══════════════════════════════════════════
- Conversación conmigo en español; código, commits, prompts a CC y
  documentación técnica SIEMPRE en inglés.
- Metodología por ticket: actualizar sección "# Ticket actual" de CLAUDE.md
  → prompt detallado a CC (siempre inicia con "Read the CLAUDE.md file
  carefully before doing anything. Do not run any git commands.") → yo
  valido local → UN commit por ticket (conventional commits) → push.
- Toda tabla nueva: RLS policy + audit trigger + GRANT a app_user. Sin
  excepciones. Toda MV: filtrado explícito por company_id (no heredan RLS).
- JWT solo en HttpOnly cookies. CASL en endpoint Y query. Lógica de
  negocio solo en NestJS, nunca en el frontend.
- EL FRONTEND SE MANTIENE como está: design system Terminal Noir (un solo
  acento #4ECDC4, sin gradientes), componentes y convenciones existentes.
  No se rediseña ni se reestructura la UI; las nuevas pantallas reutilizan
  los patrones y componentes ya construidos. Cualquier propuesta de cambio
  visual va al backlog V2, no se ejecuta ahora.
- Antes de "arreglar" algo que parezca raro, consulta las secciones de
  incidentes y quirks del handoff: varias rarezas son intencionales
  (ej: duplicate key diario en alert_instances = idempotencia correcta).

═══════════════════════════════════════════
TU PRIMERA MISIÓN
═══════════════════════════════════════════
1. Confirma que leíste ambos documentos resumiéndome en máximo 15 líneas:
   estado del proyecto, los 3 riesgos principales que ves, y las dudas
   que tengas (si las hay).
2. Prepárame el mensaje exacto para CC con el protocolo de verificación
   (REPO-VERIFICATION-PROMPT.md ya lo trae listo — revísalo y ajústalo
   solo si detectas algo mejorable).
3. Cuando yo te traiga el TECHNICAL-OWNERSHIP-REPORT.md que produzca CC,
   lo revisaremos juntos y definiremos los tickets de FASE 0 (fix SII/
   BaseAPI) antes de tocar cualquier otra cosa.
4. Después de FASE 0: mejoras al módulo Operaciones (te daré la lista) y
   luego arranque del módulo RRHH con su plan.

No propongas features nuevas ni cambios de arquitectura en esta primera
respuesta. Primero posesión técnica, después construcción.
```

---

## 4. REGLAS QUE NO SE NEGOCIAN (recordatorio rápido)

- Repo = verdad. CLAUDE.md = estado operativo vivo, se actualiza por ticket.
- Un commit por ticket, conventional commits en inglés, push a develop solo
  con CI verde. Cada push despliega a producción.
- Toda tabla nueva: RLS policy + audit trigger + GRANT a app_user.
  Toda MV: filtrado explícito por company_id.
- JWT en HttpOnly cookies, CASL en endpoint y query, lógica de negocio solo
  en NestJS.
- Frontend Terminal Noir, sin rediseños.
- Todo prompt a CC empieza con: "Read the CLAUDE.md file carefully before
  doing anything. Do not run any git commands."
- Ante algo raro, revisa incidentes/quirks del handoff antes de "arreglarlo".
