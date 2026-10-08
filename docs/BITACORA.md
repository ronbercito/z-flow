# Z-FLOW — Bitácora de desarrollo

**Última actualización:** 07/10/2026  
**Repositorio:** `ronbercito/z-flow`  
**Rama activa:** `develop`  
**Estado:** producción local en Proxmox, pruebas reales en curso.

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
