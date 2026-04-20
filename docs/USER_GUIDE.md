# Guía de usuario — Excelsia ERP

Guía para el usuario final de la plataforma. Si eres el administrador
financiero de la empresa, esto es para ti.

---

## Primeros pasos

### 1. Cómo hacer login

1. Abre la URL que te entregaron (ej: `https://app.tuempresa.cl`).
2. Ingresa tu email y contraseña.
3. La primera vez, el sistema te pedirá cambiar la contraseña por seguridad.

**Problemas comunes:**

- _"Credenciales inválidas"_: después de 5 intentos fallidos en un minuto, el
  sistema te bloquea por precaución. Espera 1 minuto y vuelve a intentar.
- _Olvidé mi contraseña_: avisa al administrador del sistema — por ahora el
  reseteo se hace manualmente (se planea agregar auto-servicio).

### 2. Cómo configurar la empresa

Al entrar por primera vez, ve a **Configuración** (sidebar inferior) y
completa:

- **Datos generales**: razón social, RUT, dirección, moneda principal (CLP
  por defecto).
- **Umbrales de alertas**: nivel mínimo de caja, días de anticipación para
  compromisos próximos a vencer.
- **Zona horaria**: `America/Santiago` por defecto.

Los datos se guardan automáticamente al salir de cada campo.

### 3. Cómo crear categorías

Las categorías clasifican tus ingresos y egresos para que los reportes
tengan sentido.

1. Ve a **Categorías** en el sidebar.
2. Click **Nueva categoría**.
3. Elige tipo (Ingreso o Egreso), nombre, color e ícono.
4. Click **Guardar**.

Ya vienen precargadas 9 categorías estándar chilenas (Ventas, Servicios,
Arriendo, Sueldos, Impuestos, etc.). Agrega sólo las que tu empresa necesita
adicionalmente.

### 4. Cómo registrar el primer movimiento

1. Ve a **Movimientos** → **Nuevo movimiento** (botón arriba a la derecha).
2. Llena: tipo, monto, fecha, categoría, descripción. Opcionalmente:
   contraparte, centro de costo, referencia.
3. Click **Guardar**. El movimiento queda en estado **Borrador (DRAFT)**.
4. Cuando estés seguro de que la información es correcta, click
   **Confirmar**. El movimiento pasa a estado **Confirmado (CONFIRMED)** y
   se refleja en el dashboard y los reportes.

**Regla de oro**: los movimientos en DRAFT son editables; los CONFIRMED son
inmutables. Si descubres un error en un CONFIRMED, debes **cancelarlo**
(deja un rastro de auditoría) y crear uno nuevo.

---

## Flujo mensual recomendado

Esta es la secuencia que te recomendamos seguir cada mes para mantener los
números al día y poder cerrar el período sin estrés el último día.

### 1. Inicio de mes — verificar el período abierto

- Ve a **Cierre**. Confirma que el período del mes en curso aparece como
  **Abierto**.
- Si no aparece, usa **Configuración → Generar períodos fiscales** para
  crear los 12 meses del año de una sola vez.

### 2. Durante el mes — registrar movimientos

Opciones para cargar movimientos:

- **Manual** (uno a uno): útil para pagos puntuales o correcciones.
  **Movimientos → Nuevo movimiento**.
- **Importación masiva** (CSV/Excel): ideal al inicio del mes. **Movimientos
  → Importar**. Descarga la plantilla, llénala y súbela. El sistema valida
  cada fila antes de guardar.
- **Compromisos futuros**: ingresa en **Caja → Nuevo compromiso** todo gasto
  o ingreso ya conocido pero aún no ejecutado (arriendos, sueldos). Así la
  proyección de caja refleja la realidad.

### 3. Importar cartola bancaria

La cartola es el extracto mensual que descargas del portal del banco.

1. Ve a **Banco**. Si aún no tienes una conexión, créala con el botón
   **Nueva Conexión** (selecciona cuenta bancaria y proveedor).
2. Si tu banco soporta sincronización automática, el sistema trae los
   movimientos solo. Si no, usa **Importar Cartola** (botón arriba a la
   derecha):
   - Elige el formato del banco (Banco de Chile/BCI, Santander/Itaú, o
     genérico).
   - Sube el archivo CSV o Excel.
   - Revisa la vista previa y click **Importar**.
3. Re-importar el mismo archivo es seguro: las filas duplicadas (misma
   fecha, descripción y monto) se saltean automáticamente.

### 4. Ejecutar conciliación

La conciliación cruza tus movimientos internos con la cartola bancaria y los
documentos tributarios (SII) para confirmar que todo cuadra.

1. Ve a **Conciliación**.
2. Click **Ejecutar Conciliación**.
3. El sistema genera dos tipos de cruces:
   - **Conciliados automáticamente**: coincidencia exacta (mismo monto,
     mismo día ±3). Quedan listos.
   - **Sugerencias pendientes**: coincidencia aproximada (monto difiere
     hasta 5%, fecha dentro de ±10 días). Revisa cada tarjeta y click
     **Confirmar** si es correcto, o **Rechazar** si no.
4. Para los que queden sin conciliar, usa **Conciliar manualmente** en la
   tabla inferior (pestañas _Movimientos bancarios_ / _Documentos
   tributarios_).

**Meta**: llegar al **80% conciliado** antes del cierre. Menos de 50%
bloquea el cierre del período.

### 5. Revisar alertas

Ve a **Alertas** y atiende las **críticas** (rojas) y **advertencias**
(amarillas) antes de cerrar:

- _Caja baja_: queda menos de tu umbral configurado.
- _Compromisos vencidos_: hay pagos pendientes con fecha pasada.
- _Movimientos en borrador_: quedaron sin confirmar.
- _Período por cerrar_: faltan pocos días para el fin de mes.

Click **Resolver** cuando termines de atender una alerta. Click **Descartar**
si aplicaba pero ya no es relevante (deja rastro en auditoría).

### 6. Cierre de mes — usar el checklist

1. Ve a **Cierre** y selecciona el período a cerrar.
2. Click **Iniciar revisión** para pasar el período a estado _En revisión_.
3. Revisa el **Checklist de cierre**:
   - ✅ **Verde (OK)**: el ítem está correcto.
   - ⚠️ **Amarillo (Atención)**: se puede cerrar pero se recomienda revisar.
   - ❌ **Rojo (Bloqueado)**: debe resolverse antes de cerrar. Los ítems
     BLOQUEADOS son: movimientos DRAFT pendientes y conciliación bancaria
     bajo 50%.
4. Cuando todos los bloqueos estén verdes, escribe una **nota de cierre**
   (opcional pero recomendada), click **Cerrar período** y confirma en el
   diálogo.
5. Una vez cerrado, los movimientos del período quedan **bloqueados**: no
   se pueden editar ni cancelar. Si surge un error que obliga a reabrir,
   sólo un usuario ADMIN puede hacerlo y debe dejar razón (queda en
   auditoría).

### 7. Exportar reporte ejecutivo

Después del cierre, ve a **Reportes** y descarga:

- **Libro de movimientos** (Excel): todos los movimientos del período.
- **Flujo de caja** (Excel): resumen por categoría y proyección.
- **Resumen ejecutivo** (Excel): KPIs consolidados del mes.

Estos archivos son ideales para enviar al contador o presentar al
directorio.

---

## Módulos principales

Descripción breve de cada sección del menú lateral.

### 📊 Dashboard

Pantalla principal. Muestra de un vistazo: caja total, caja libre, ingresos
y egresos del mes, compromisos próximos, top categorías de gasto, alertas
críticas. Se adapta al período que selecciones arriba a la derecha.

### 🔁 Movimientos

Registro de **toda** la actividad financiera de la empresa: ingresos y
egresos. Cada movimiento tiene categoría, contraparte (cliente o
proveedor), fecha, monto y estado (DRAFT → CONFIRMED → RECONCILED →
CANCELLED). Soporta importación masiva desde CSV/Excel.

### 💰 Caja

Vista de caja y tesorería. Muestra el flujo proyectado mes a mes, saldos de
apertura por cuenta bancaria, y los **compromisos** (ingresos o egresos ya
conocidos pero aún no ejecutados, como sueldos o arriendos próximos).

### 🏦 Banco

Gestión de cuentas bancarias y conexiones con proveedores de banking
(Fintoc, Unnax, etc. — por ahora con mock). Permite:

- Sincronizar saldos y movimientos automáticamente.
- Importar cartolas manualmente como respaldo cuando la sincronización
  falla.
- Ver el historial de sincronizaciones y errores.

### 🧾 Tributario

Integración con SII. Muestra los documentos electrónicos **emitidos**
(facturas que emitiste a clientes) y **recibidos** (facturas que te
emitieron proveedores). Incluye resumen de IVA débito/crédito y balance
tributario del período.

### 🔀 Conciliación

El corazón del ERP. Cruza movimientos bancarios + documentos SII +
movimientos internos para detectar cuadres. Motor de reglas exactas
(AUTO_MATCHED con confianza 1.0 / 0.95 / 0.9) y heurísticas (SUGGESTED con
confianza 0.5–0.8). Panel de sugerencias para revisión manual.

### ✅ Cierre

Formaliza el fin de cada período fiscal. Checklist de 5 reglas (movimientos
confirmados, conciliación bancaria, conciliación tributaria, compromisos
vencidos, alertas críticas). Al cerrar, los movimientos se bloquean y se
genera un snapshot imprimible.

### 🔔 Alertas

Sistema de notificaciones automáticas con 3 niveles de severidad (CRITICAL,
WARNING, INFO). Se generan por reglas configurables (umbral de caja, días
para compromisos, etc.). Cada alerta puede resolverse o descartarse.

### 📈 Reportes

Exportaciones a Excel de los reportes contables estándar: libro de
movimientos, flujo de caja, resumen ejecutivo. Filtrables por período
fiscal.

### 🏷️ Categorías / 👥 Contrapartes / ⚙️ Configuración

Catálogos maestros y configuración de la empresa. Edítalos con cuidado: un
cambio aquí afecta a toda la empresa.

---

## Preguntas frecuentes

**¿Puedo editar un movimiento ya confirmado?**
No. Los movimientos CONFIRMED quedan inmutables por auditoría. Si detectas
un error, cancélalo (queda el rastro) y crea uno nuevo con los datos
correctos.

**¿Qué pasa si un movimiento se concilió mal?**
Ve a **Conciliación**, encuentra el match en el panel de sugerencias o en
el histórico, y click **Rechazar**. Los dos lados vuelven a quedar "sin
conciliar" y puedes conciliarlos manualmente con las contrapartes
correctas.

**¿Cómo cambio el período que veo en el dashboard?**
Usa el selector de período arriba a la derecha. Afecta a Dashboard,
Tributario, Conciliación, Cierre y Reportes.

**¿Cerré un período por error. ¿Puedo deshacerlo?**
Sí, pero sólo un usuario ADMIN puede reabrir un período cerrado y debe
dejar una razón (mínimo 5 caracteres). Queda registrado en el log de
auditoría.

**¿Los datos de mi empresa son visibles para otras empresas del sistema?**
No. El sistema usa Row Level Security (RLS) de PostgreSQL, lo que significa
que el aislamiento por empresa se hace a nivel de base de datos, no de
aplicación. Es imposible (salvo bug crítico en PostgreSQL) ver datos de
otra empresa.
