# Z-FLOW

Sistema independiente para gestionar filiales, operaciones Yape/efectivo, cajas, comisiones, cierres, comprobantes, reportes, usuarios y roles.

## Etapa actual

Primera implementación para ejecutarse en un contenedor/servidor local y acceder por **IP**, sin dominio.

### Stack

- Web: React + Vite
- API: Fastify + TypeScript
- Base de datos: MariaDB 11
- Acceso a datos: mysql2
- Web/proxy: Nginx
- Despliegue: Docker Compose

Se eligió un stack liviano para el entorno local, pero preparado para migrar luego a la nube.

## Arranque local

```bash
git clone https://github.com/ronbercito/z-flow.git
cd z-flow
git checkout develop
cp .env.example .env
docker compose up -d --build
```

Abrir desde cualquier equipo de la misma red:

```text
http://IP_DEL_CONTENEDOR:8080
```

Comprobar API:

```text
http://IP_DEL_CONTENEDOR:3001/health
```

## Primera pantalla implementada

Panel restringido de filial con:

- Inicio
- Operaciones
- Caja
- Cierre diario
- Comprobantes
- Reportes
- Mi perfil
- Ayuda

También incluye el primer formulario funcional de **Nueva operación**, conectado a MariaDB mediante la API.

> La autenticación, sesiones y permisos por rol/filial ya están implementados y se validan también en backend.

## Ramas

- `main`: base estable.
- `develop`: implementación activa.


## Login y usuarios iniciales

Z-FLOW usa sesiones del lado del servidor mediante una cookie HttpOnly. Las contraseñas se almacenan con hash bcrypt.

En la primera ejecución después de habilitar autenticación, si la tabla de usuarios está vacía, la API crea dos cuentas con **contraseñas temporales aleatorias**:

- `admin`: propietario.
- `miraflores`: usuario restringido de la filial de prueba.

Para ver las credenciales generadas una sola vez:

```bash
docker compose logs api | grep -A 5 "CREDENCIALES TEMPORALES"
```

El usuario de filial queda restringido también en el backend: aunque cambie manualmente el ID de filial en una URL, recibirá HTTP 403.



## Etapa 3 local

Implementado en `develop`:

- Reportes por rango de fechas.
- Exportación PDF y Excel.
- Reparto de comisión encargado/socio guardado por operación.
- Cierre de caja con totales de comisión y reparto.
- Comprobantes internos correlativos.
- PDF de comprobante interno en formato aproximado de 80 mm.
- Backup y restauración de MariaDB.
- Backup automático diario opcional.

> Los comprobantes internos de Z-FLOW no son comprobantes de pago electrónicos SUNAT. La integración tributaria se hará por separado cuando se definan proveedor, credenciales y flujo contable.

### Activar backup automático local

Después de actualizar el LXC:

```bash
cd /opt/z-flow
bash scripts/backup.sh
bash scripts/install-backup-cron.sh
```

Los backups quedan en `/opt/z-flow/backups` con retención local predeterminada de 14 días.


## Etapa 4 — Proxmox local

La nube queda pospuesta hasta terminar las pruebas reales. La Etapa 4 consolida Z-FLOW para uso dentro del LXC de Proxmox.

Incluye:

- Configuración general del negocio, logo y datos de tickets.
- Reglas centrales de comisión, límites y reparto.
- Anulación controlada durante turno abierto y reverso de propietario.
- Cambio de encargado sobre una caja abierta.
- Asignación de socios por filial y distribución individual de su parte.
- Permisos configurables por rol con aplicación real en backend.
- Gestión de sesiones activas e IP en auditoría.
- Health checks de MariaDB, API y Web.
- Docker `restart: unless-stopped` y rotación de logs.
- Zona horaria `America/Lima`.
- Backup, restauración y prueba de restauración no destructiva.
- Diagnóstico y actualización segura desde GitHub.

### Preparar el LXC

Después de actualizar:

```bash
cd /opt/z-flow
bash scripts/install-local-production.sh
```

Diagnóstico:

```bash
bash scripts/diagnose.sh
```

Probar el último backup sin tocar la base productiva:

```bash
bash scripts/test-restore.sh
```

Actualizaciones posteriores:

```bash
bash scripts/update-local.sh
```

La siguiente fase es probar todo paso por paso en el entorno local antes de cualquier migración a nube.
