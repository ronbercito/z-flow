# Z-FLOW — Bitácora de desarrollo

**Última actualización:** 09/10/2026
**Repositorio:** `ronbercito/z-flow`  
**Rama activa:** `develop`  
**Estado:** producción local en Proxmox, pruebas reales en curso.

## 10/10/2026 — Revisión general integrada a main

- Se revisaron caja, permisos por filial, validaciones financieras, autenticación y manejo de backups/restauración.
- La instalación nueva ya no carga operaciones ficticias ni abre una caja por defecto.
- El instalador de Debian/Ubuntu está publicado en `scripts/install-local.sh`; obtiene la versión de `main`, configura Docker, genera secretos aleatorios, activa backups programados y guarda una copia inicial.
- La revisión se integró en `main` mediante PR #4. CI aprobó API, web y Docker; Docker pasó al reintentar una descarga afectada por el límite temporal de Docker Hub.
- Instalación: `curl -fsSL https://raw.githubusercontent.com/ronbercito/z-flow/main/scripts/install-local.sh | bash`.
- La primera instalación en un contenedor limpio aún está pendiente; CI valida compilación y configuración, no sustituye esa prueba de despliegue.


## 09/10/2026 — Límite de carga de logos en Mi Negocio

- El formulario permite logos de hasta 2 MB (base64 hasta 3 MB), por lo que el límite predeterminado de 1 MB en Nginx/Fastify podía responder con una página HTML 413 al guardar.
- Se aumentó el límite del proxy web y de Fastify a 4 MB y el formulario ahora maneja respuestas no JSON con un mensaje HTTP legible.
- Pendiente: CI y volver a guardar el logo en el panel actualizado.

## 09/10/2026 — Espacio independiente por filial

- Se agregó el modelo de identidad comercial por filial: nombre, razón social, RUC, teléfono, logo, dirección, prefijo y pie del comprobante.
- Se agregaron las rutas de lectura/edición de identidad con autorización de filial y registro en auditoría. Las filiales existentes se inicializan desde sus datos de sucursal.
- El panel de encargado incorpora «Mi Negocio», con edición de la identidad de su propia filial.
- Los reportes de filial permiten elegir día, semana, mes o rango manual y muestran el registro de operaciones del periodo.
- La pantalla de cierres de filial conserva el resumen del turno abierto y agrega el historial de esa filial, detalle de operaciones y PDF.
- Las rutas de listado y detalle de cierres continúan comprobando acceso a la filial en la API. El nombre comercial y los datos de documentos internos ahora pueden salir de la identidad de la filial.
- No se actualizó el panel desplegado. La compilación no pudo ejecutarse en este entorno porque no hay `npm` y las dependencias locales no están instaladas; `git diff --check` no reportó problemas de formato.
- Próximo paso: validar el build en CI y probar con dos usuarios de filiales distintas que reportes, identidad, historial, detalle y PDF respeten el aislamiento antes de actualizar el LXC.

---

## Objetivo del sistema

Z-FLOW es un sistema independiente para administrar operaciones entre efectivo y billetera digital por filial, con control de caja, comisiones, cierres, comprobantes, reportes, usuarios y auditoría.

El sistema se mantiene separado de Z-HUB e IPZTREAM.

## Modelo operativo vigente

El modelo fue simplificado y queda definido así:

- El propietario administra todo el sistema.
- Cada filial tiene **un solo Cajero / Encargado activo**.
- No existe módulo operativo de socios.
- La comisión completa de cada operación pertenece al encargado que la registra.
- Cada encargado ve y opera únicamente su filial.
- El propietario puede ver todas las filiales.
- Una operación cerrada no se edita ni se elimina.
- Una corrección posterior se hace mediante **reverso del propietario**, conservando historial y auditoría.

## Arquitectura consolidada

- Web: React + Vite.
- API: Fastify + TypeScript.
- Base de datos: MariaDB 11.
- Acceso a datos: mysql2.
- Web/proxy: Nginx.
- Despliegue: Docker Compose.
- Sesiones: servidor + cookie HttpOnly.
- Contraseñas: bcrypt.
- Zona horaria local: `America/Lima`.
- Docker: `restart: unless-stopped`.
- Backups locales automáticos: diario a las 03:00, retención predeterminada de 14 días.

## Hitos completados

### Base y autenticación
- Docker local y esquema MariaDB.
- Login y logout.
- Sesiones del lado del servidor.
- Restricción real por rol y filial en backend.
- Bloqueo de intentos fallidos.
- Cambio y restablecimiento de contraseña.
- Auditoría con IP y agente de usuario.

### Operaciones y caja
- Yape → Efectivo.
- Efectivo → Yape.
- Comisión fija o porcentual.
- Referencia obligatoria configurable.
- Apertura de caja.
- Estado de efectivo y saldo Yape.
- Cierre diario con conciliación.
- Resultado de cierre: cuadra, faltante, sobrante o mixto.
- Observación obligatoria cuando existe diferencia.
- PDF de cierre.

### Encargados
- Un solo encargado activo por filial.
- Alta simplificada: nombre, cuenta, filial y contraseña.
- Rol fijo: Cajero / Encargado.
- Detalle con:
  - ganancia del día;
  - ganancia acumulada;
  - operaciones del día;
  - operaciones acumuladas;
  - filial;
  - último acceso;
  - estado de caja;
  - actividad reciente.
- Ganancias calculadas solo sobre operaciones válidas/completadas.
- Operaciones revertidas se conservan en historial, pero dejan de sumar.

### Propietario
- Dashboard global.
- Filiales.
- Operaciones globales.
- Caja y cierres.
- Usuarios / encargados.
- Comisiones.
- Reportes.
- Auditoría.
- Configuración general.
- Seguridad y sesiones.

### Reportes y comprobantes
- Filtros por fechas y filial.
- Exportación PDF.
- Exportación Excel.
- Comprobantes internos correlativos.
- PDF de comprobante.
- Los comprobantes internos no se presentan como comprobantes electrónicos SUNAT.

### Seguridad operativa
- Anulación durante turno abierto con motivo.
- Reverso del propietario.
- Registro de eventos y auditoría.
- Cierre remoto de sesiones.
- Permisos aplicados también en backend.
- Base de datos no expuesta públicamente.
- API local restringida al host y consumida por la Web.

## Cambio importante: eliminación del modelo de socios

Se eliminó del flujo visible y operativo:

- módulo Socios;
- reparto de comisión;
- asignaciones de socios;
- cambio de turno entre múltiples encargados;
- entrega de caja entre varios encargados.

Para compatibilidad histórica algunas columnas o estructuras antiguas pueden permanecer físicamente en una base existente. No deben reactivarse ni eliminarse de forma destructiva sin una migración específica.

En instalaciones limpias el esquema ya usa el modelo actual de un solo encargado por filial.

## Pruebas reales aprobadas

### Miraflores
- Apertura de caja.
- Operaciones reales de prueba.
- Ganancia del encargado.
- Cierre profesional.
- Cierre cuadrado.
- Cierre con diferencia.
- PDF de cierre.

### PNC Playa
- Creación de encargado.
- Apertura de caja.
- Yape → Efectivo.
- Efectivo → Yape.
- Ganancia correcta.
- Cierre de caja.
- Separación de información respecto a Miraflores.

### Separación entre filiales
Aprobada. Los movimientos, caja y ganancias de una filial no se mezclan con otra.

### Reverso del propietario
Aprobado.

Se comprobó que:

- la operación pasa a estado **Revertida**;
- deja de contabilizar como operación válida;
- deja de sumar comisión al encargado;
- se conserva en actividad reciente;
- queda registro de **Operación revertida** en Auditoría;
- el comprobante asociado queda invalidado;
- no puede revertirse de nuevo desde la interfaz.

### Trabajo simultáneo
Aprobado con dos filiales operando al mismo tiempo.

### Backup y restauración
Aprobado mediante restauración no destructiva a una base temporal.

Checkpoint de la prueba:

```text
branches         producción=2 restaurado=2  OK
users            producción=7 restaurado=7  OK
operations       producción=24 restaurado=24  OK
daily_closures   producción=4 restaurado=4  OK
receipts         producción=24 restaurado=24  OK
```

Resultado:

```text
Z-FLOW LOCAL: VALIDACIÓN COMPLETA OK
Backup verificado y restaurable.
Servicios preparados para reinicio del LXC.
```

### Reinicio del LXC
Aprobado.

Después de reiniciar el contenedor completo:

- Docker inició automáticamente.
- MariaDB inició y quedó saludable.
- API inició y quedó saludable.
- Web inició y quedó saludable.
- políticas `restart: unless-stopped` correctas;
- cron de backup activo.

Resultado:

```text
REINICIO DEL LXC: PRUEBA APROBADA
Z-FLOW arrancó automáticamente y está sano.
```

## Correcciones operativas recientes

- Se normalizó la hora de último acceso del encargado.
- Se normalizaron horas de sesiones de seguridad.
- Se eliminó el scroll horizontal del detalle del encargado.
- Se cambió “Contraseña temporal” por “Contraseña”.
- Se reforzó `test-restore.sh`.
- Se corrigió el paso seguro del nombre de la base temporal a MariaDB.
- Los scripts de producción ya no cambian permisos de archivos rastreados por Git.
- El cron ejecuta el backup mediante `bash`.
- Se añadieron:
  - `scripts/verify-local-production.sh`
  - `scripts/verify-after-reboot.sh`

## Actualización del 09/10/2026 — README y ramas

- Se simplificó `README.md`: ahora presenta el sistema, sus funciones y tecnología, con enlaces a la documentación; el manual detallado ya no se muestra en la portada.
- La PR #3 se combinó en `main` el 09/10/2026. `main` contiene el proyecto completo; la portada breve ya está publicada allí.
- Estado de referencia: `main` en `16c6c82`; `develop` en `69d5785` al momento de esta actualización.
- No se actualizó el LXC en este cambio. Sigue pendiente desplegar desde el repositorio y comprobar el retiro de Factiliza en el panel.

## Actualización del 08/10/2026 — integración electrónica

- Se retiró Factiliza como proveedor de emisión desde el panel y la API. La emisión de boletas desde Z-FLOW queda deshabilitada hasta elegir un proveedor autorizado y validar el flujo tributario.
- Se conserva la consulta de registros y archivos electrónicos históricos asociados a cierres; los comprobantes internos siguen identificados como documentos de control y no como comprobantes SUNAT.
- El backend elimina las tablas de configuración y correlativos de Factiliza, pero conserva la tabla histórica de documentos para no perder referencias anteriores.
- `scripts/update-local.sh` limpia variables `FACTILIZA_*` del entorno `.env` durante la actualización.
- Se sincronizó el checkout local con `origin/develop`; los cambios de caja que estaban pendientes localmente ya estaban incluidos en la rama remota.
- El último cambio publicado al corte de esta bitácora es `eeabdf1` (`remove: purge retired Factiliza credentials on update`).
- No se confirma en esta actualización que el LXC de producción ya haya sido actualizado; hacerlo y comprobar el panel es el siguiente paso operativo.

## Actualización del 09/10/2026 — revisión general y primera instalación limpia

- La base de una instalación nueva ya no incluye operaciones ficticias ni una caja abierta; empieza lista para configurarse y abrir el primer turno real.
- Apertura y cierre de caja se serializan con las operaciones para evitar doble apertura y diferencias si un movimiento llega mientras se cierra el turno.
- Se validan montos finitos dentro del rango decimal de MariaDB; se retira CORS con credenciales abiertas porque el panel usa rutas del mismo origen.
- Se limita el almacenamiento de intentos de inicio de sesión y solo se permiten permisos de alcance filial para el rol de cajero.
- Los backups restringen permisos, evitan reemplazarse cuando coinciden en el segundo y la restauración de consola valida el gzip, crea copia previa e intenta recuperarla ante una importación fallida.
- El instalador limpio obtiene el código desde `main`, genera contraseñas aleatorias, configura Docker, backups diarios y rotación, y deja una copia inicial.
- `scripts/update-local.sh` actualiza desde `main`; la guía documenta la instalación en Debian/Ubuntu y los requisitos de LXC en Proxmox.
- No se ejecutaron pruebas locales; la compilación/configuración se comprobará mediante los checks automáticos del repositorio antes de promover a `main`.

## Regla de trabajo del proyecto

**Toda solución se implementa primero en el repositorio y después se actualiza el servidor.**

No se deben dejar arreglos manuales exclusivos del LXC que no existan en GitHub. Esto garantiza que una instalación nueva reproduzca exactamente el sistema validado.

Flujo normal:

```text
Repositorio develop
        ↓
CI
        ↓
Actualización del LXC
        ↓
Prueba real
        ↓
Corrección en repositorio si hace falta
```

## Pendiente actual

- Actualizar el LXC desde `develop` y verificar que Integraciones/Factiliza ya no aparezca y que las boletas históricas sigan consultables.
- Validar las 5 filiales reales.
- Cerrar formalmente la fase de pruebas locales cuando esas 5 filiales queden aprobadas.
- Preparar instalador limpio para otro servidor.
- Más adelante:
  - backup externo;
  - despliegue en nube;
  - dominio y HTTPS;
  - integración tributaria/electrónica cuando se defina el flujo contable.

## Referencias

- `docs/ROADMAP.md`
- `docs/LOCAL_PRODUCTION.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKUPS.md`
- `docs/CONTINUIDAD.md`
