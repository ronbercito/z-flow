# Z-FLOW — Bitácora de desarrollo

**Última actualización:** 11/10/2026
**Repositorio:** `ronbercito/z-flow`
**Rama publicada:** `main`
**Estado:** emisión electrónica, tope mensual por filial y reintento automático al cambiar de mes integrados en `main` mediante PR #12. CI aprobó los builds de API, web y Docker. Las instalaciones crean copias diarias de la base de datos a las 03:00 de Lima y conservan 14 días.

## 11/10/2026 — Tope mensual de emisión por filial

- Integraciones del propietario permite fijar un tope mensual opcional en soles para cada filial y muestra el acumulado del mes en curso.
- La configuración del tope se separó en recuadros para datos del emisor, límites y consumo mensual, y acceso a ApiSunat; el consumo ahora destaca el monto y el avance con una barra.
- La API valida el tope antes de cada envío, tanto automático como manual o reintento. La reserva se serializa por filial en la base de datos para cubrir solicitudes simultáneas.
- El acumulado toma boletas aceptadas, en validación o con resultado incierto, porque ya pudieron ser recibidas por ApiSunat. Errores confirmados y rechazos no consumen el tope.
- Al no caber una boleta completa en el saldo mensual, queda pendiente y no se envía. Al cambiar al siguiente mes calendario de Lima, la API la reintenta automáticamente; el tope se calcula de nuevo con los envíos del mes vigente.
- El límite queda desactivado por defecto en instalaciones existentes y nuevas hasta que el propietario configure un importe. La migración agrega el límite y la fecha de envío sin borrar datos.
- PR #10 quedó integrado en `main`; la filial confirmó en prueba que el tope bloquea nuevas emisiones cuando se alcanza. La suma mensual usa límites de fechas del calendario de Lima, por lo que empieza un nuevo periodo sin borrar el historial; la verificación práctica del cambio de mes corresponde al 1 de noviembre.

## 11/10/2026 — reintento automático mensual y copias diarias

- Las boletas que quedaron `QUEUED` específicamente por alcanzar el tope mensual se vuelven a intentar automáticamente al cambiar el mes calendario de Lima. El proceso corre al iniciar la API y luego cada minuto; el tope se comprueba de nuevo antes de enviar.
- El documento guarda una nota como “Pendiente del mes 2026-10; reintento automático iniciado en 2026-11”, visible en el historial de la filial y en la consulta del propietario. La nota no marca la boleta como aceptada: el estado solo cambia cuando ApiSunat confirma el resultado.
- Se agregó una reserva condicional de estado en base de datos para evitar que dos instancias envíen a la vez la misma boleta durante los reintentos.
- PR #12 quedó integrado en `main`; GitHub Actions aprobó los builds de API, web y Docker.

## 10/10/2026 — Revisión general integrada a main

- Se revisaron caja, permisos por filial, validaciones financieras, autenticación y manejo de backups/restauración.
- La instalación nueva ya no carga operaciones ficticias, no abre una caja por defecto y tampoco precarga filiales ni usuarios operativos. Solo crea el propietario `admin`.
- El instalador de Debian/Ubuntu está publicado en `scripts/install-local.sh`; obtiene la versión de `main`, configura Docker, genera secretos aleatorios, activa backups diarios de la base de datos y guarda una copia inicial.
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
- No se actualizó el panel desplegado. La compilación no pudo ejecutarse en este entorno porque no hay
pm` y las dependencias locales no están instaladas; `git diff --check` no reportó problemas de formato.
- Próximo paso: validar el build en CI y probar con dos usuarios de filiales distintas que reportes, identidad, historial, detalle y PDF respeten el aislamiento antes de actualizar el LXC.

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
- No se actualizó el panel desplegado. La compilación no pudo ejecutarse en este entorno porque no hay
pm` y las dependencias locales no están instaladas; `git diff --check` no reportó problemas de formato.
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
CI e integración a main
        ↓
Actualización desde main
        ↓
Prueba real
        ↓
Corrección en repositorio si hace falta
```

## Pendiente actual

- Verificar CI, actualizar el entorno objetivo desde `main` y probar la emisión electrónica, los reintentos de filial y la consulta administrativa.
- Validar las 5 filiales reales.
- Cerrar formalmente la fase de pruebas locales cuando esas 5 filiales queden aprobadas.
- Preparar instalador limpio para otro servidor.
- Más adelante:
  - backup externo;
  - despliegue en nube;
  - dominio y HTTPS;
  - integración tributaria/electrónica cuando el contador confirme el tratamiento tributario.

## Referencias

- `docs/ROADMAP.md`
- `docs/LOCAL_PRODUCTION.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKUPS.md`
- `docs/CONTINUIDAD.md`

## 10/10/2026 — emisión de boletas por filial con ApiSunat

- Se añadió configuración de ApiSunat por filial: emisión desactivada por defecto, serie B001 configurable y modo de una boleta por cierre o una por operación.
- El token se cifra con AES-256-GCM usando `ZFLOW_CREDENTIAL_KEY`; el panel solo permite tokens del ambiente de Desarrollo (`DEV_`). No se habilitó producción.
- Al emitir, la boleta usa la comisión como importe y describe la fecha del cierre o de la operación. Si no hay datos del comprador, se identifica como `CLIENTES VARIOS` sin enviar DNI.
- El formulario solicita nombre, tipo y número de documento solo cuando el total de esa boleta supera S/ 700.00. En S/ 700.00 o menos permite consumidor final sin DNI. El servidor aplica la misma validación.
- Los registros guardan estado, serie, correlativo y respuesta de ApiSunat. Al ser aceptadas, se archivan PDF, XML y CDR bajo `backups/boletas-electronicas/filial-<id>/cierre-<id>` o `operacion-<id>`.
- Se conserva la lectura de documentos históricos de Factiliza. `scripts/update-local.sh` crea y vuelve a cargar la clave de cifrado si no existe en `.env`.
- Verificado por revisión del código y consultas a la documentación de ApiSunat y SUNAT. La compilación no pudo ejecutarse en este entorno: falta
pm`, y el `pnpm` incluido no pudo resolver el directorio del workspace (EPERM). No se hicieron llamadas reales a ApiSunat porque el token del usuario está redactado; para probar se debe guardar el token `DEV_` de la filial en Integraciones.

## 10/10/2026 — tope por boleta y archivo por filial

- Se añadió a la configuración administrativa un importe máximo por boleta para cada filial, con S/ 500.00 como valor inicial.
- Si una comisión supera ese tope, el servicio la parte en boletas cuyo importe suma exactamente el total del cierre u operación y ninguna excede el máximo configurado.
- Cuando una parte todavía no se puede enviar, se guarda como `QUEUED`; el usuario autorizado de la filial reintenta desde su panel. El propietario solo consulta estados, errores y archivos. No se solicita DNI por la suma del cierre si cada boleta queda bajo el umbral individual de SUNAT.
- Se amplió el esquema para guardar número de parte, cantidad de partes y documentos múltiples por cierre u operación, con migración aditiva para instalaciones existentes.
- El panel del propietario permite revisar boletas de la filial, estados, importes y abrir PDF/descargar XML archivados en el volumen local `backups/boletas-electronicas`.
- ApiSunat sigue restringido al ambiente de Desarrollo (`DEV_`); esto aún no habilita comprobantes con validez tributaria.
- Pendiente: validar contra una instalación MariaDB y credenciales de Desarrollo, revisar estados/respuestas reales del proveedor y probar recuperación de cola y descarga de PDF/XML.

## 10/10/2026 — integración de emisión electrónica en main

- Se integró a `main` el flujo de ApiSunat desarrollado en `develop`, junto con las mejoras de seguridad, instalación y operación que ya estaban publicadas en `main`.
- Cada operación completada puede emitir su boleta desde la filial. Los reintentos y la cola pendiente se gestionan desde el panel de la filial; el panel propietario solo consulta estados, errores y PDF/XML disponibles.
- Las respuestas de envío inciertas quedan en estado de confirmación y no se reenvían a ciegas. El proceso de recuperación consulta el estado de ApiSunat antes de actuar y evita duplicar comprobantes.
- Las boletas aceptadas se archivan localmente con PDF, XML y CDR. Los archivos y errores quedan visibles en la consulta administrativa de cada filial.
- El flujo sigue limitado al ambiente ApiSunat Desarrollo con token `DEV_`; no genera comprobantes con valor tributario. Falta confirmación contable del tratamiento del IGV antes de habilitar producción.
- La integración compiló y se desplegó previamente en `develop`; el despliegue de `main` debe verificarse por separado antes de considerar esta rama publicada en el panel.
## 10/10/2026 — corrección detectada por CI en main

- CI compiló correctamente la API y encontró dos definiciones duplicadas del historial de cierres en la interfaz de la filial, resultado del merge de ramas.
- Se eliminó la duplicación y se conserva la actualización automática de estados pendientes. La ejecución posterior aprobó las compilaciones de API, web y Docker.

## 10/10/2026 — puerto web predeterminado

- Las instalaciones nuevas publican el panel por el puerto 80; `WEB_PORT` puede cambiarse para usar otro puerto.


## 10/10/2026 — corrección de emisión sin documento del cliente

- La instalación nueva devolvió `Cannot read properties of undefined (reading 'cbc:ID')` al emitir una operación sin documento del comprador.
- ApiSunat requiere el nodo UBL `cac:PartyIdentification/cbc:ID` incluso para consumidor final. La integración ahora usa la representación sin documento del widget oficial: `schemeID: "-"` y `00000000`.
- El valor técnico `00000000` no se muestra como DNI capturado del cliente. La boleta conserva el estado pendiente/error hasta recibir confirmación del proveedor.
- Prueba manual reportada en la instalación nueva: la operación aparece como `Aceptada` en ApiSunat y el panel muestra `Ver PDF`. Esto confirma el flujo de emisión en Desarrollo.




## 11/10/2026 — horario y retención de backups configurables

- El propietario puede configurar desde Backup la hora diaria (hora de Lima) y cuánto tiempo conservar copias automáticas (1–3650 días). Los valores iniciales siguen siendo 03:00 y 14 días.
- La programación se guarda como archivo protegido dentro del volumen persistente `backups`, así se conserva tras reiniciar o actualizar el contenedor.
- Cron revisa la hora configurada cada minuto y el ejecutor garantiza como máximo una copia al día. La rotación solo elimina copias automáticas `zflow_*.sql.gz`; no elimina copias manuales ni las que se subieron.
- La API valida el horario y el período de retención y registra los cambios en auditoría. No se ejecutaron pruebas locales; la validación de compilación corresponde a CI antes de integrar en `main`.
