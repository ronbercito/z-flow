# Z-FLOW — Producción local en Proxmox

Z-FLOW se mantiene en el LXC local hasta terminar las pruebas reales de las filiales.

## Primera instalación en un contenedor limpio

Requisitos del contenedor: Debian o Ubuntu, acceso como `root`, conexión a internet y soporte de Docker. En un LXC de Proxmox se debe habilitar `nesting=1` y `keyctl=1` antes de ejecutar el instalador.

Ejecuta una sola vez:

```bash
curl -fsSL https://raw.githubusercontent.com/ronbercito/z-flow/main/scripts/install-local.sh | bash
```

El instalador instala Docker si hace falta, descarga `main`, genera secretos aleatorios, construye la aplicación, espera la API y la web, configura backups diarios con rotación y crea el primer backup. Las contraseñas temporales del propietario y de la filial inicial se imprimen en los logs de la API; guárdalas y cámbialas al ingresar. No reutilices el archivo `.env` entre instalaciones.

El puerto web predeterminado es `8080`. Para elegir otros puertos, defínelos al ejecutar el comando:

```bash
WEB_PORT=8090 API_PORT=3010 curl -fsSL https://raw.githubusercontent.com/ronbercito/z-flow/main/scripts/install-local.sh | bash
```

La segunda forma no exporta las variables al proceso que descarga el script en todas las shells. Para asegurar la configuración, usa:

```bash
curl -fsSL https://raw.githubusercontent.com/ronbercito/z-flow/main/scripts/install-local.sh -o /tmp/zflow-install.sh
WEB_PORT=8090 API_PORT=3010 bash /tmp/zflow-install.sh
```

## Activar endurecimiento local

```bash
cd /opt/z-flow
bash scripts/install-local-production.sh
```

Esto deja:

- Docker con reinicio automático `unless-stopped`.
- Health checks para MariaDB, API y Web.
- Backup diario a las 03:00.
- Retención local de 14 días.
- Rotación del log de backup.
- Script de diagnóstico.
- Script de actualización segura con backup previo.

## Diagnóstico

```bash
cd /opt/z-flow
bash scripts/diagnose.sh
```

## Actualizar desde GitHub

```bash
cd /opt/z-flow
bash scripts/update-local.sh
```

El actualizador crea primero un backup. Si la API no vuelve a estar saludable, se detiene y muestra el commit anterior; no revierte automáticamente la base de datos.

## Operación segura

Una operación completada no se edita. Durante un turno abierto puede anularse con motivo si la política lo permite. Después del cierre del turno, cualquier corrección requiere reverso de propietario y queda auditada.

## Nube

La migración a nube queda deliberadamente fuera de esta etapa. Se hará después de las pruebas locales con todas las filiales.


## Probar restauración sin tocar producción

```bash
cd /opt/z-flow
bash scripts/test-restore.sh
```

Crea una base temporal, importa el último backup, comprueba tablas principales y elimina la base temporal al finalizar.

## Arranque automático del LXC

Dentro del LXC, Docker queda habilitado por `install-local-production.sh` y los contenedores usan `restart: unless-stopped`.

En el host Proxmox también debe activarse **Start at boot** para el CT de Z-FLOW. Desde la interfaz de Proxmox se puede habilitar en las opciones del contenedor. La prueba final de reinicio forma parte de la Fase 5.


## Validación final antes de uso real

Ejecutar dentro del LXC:

```bash
cd /opt/z-flow
bash scripts/verify-local-production.sh
```

Esta prueba es no destructiva. Verifica:

- permisos de `.env`;
- Docker y políticas de reinicio;
- salud de MariaDB/API/Web;
- creación de un backup nuevo;
- restauración del backup en una base temporal;
- igualdad de conteos de filiales, usuarios, operaciones, cierres y comprobantes;
- backup automático diario.

Debe terminar con:

```text
Z-FLOW LOCAL: VALIDACIÓN COMPLETA OK
```

## Prueba final de reinicio del LXC

Primero habilitar **Start at boot** para el CT de Z-FLOW desde Proxmox.

Reiniciar el contenedor desde el host Proxmox. Cuando vuelva a iniciar, entrar al LXC y ejecutar:

```bash
cd /opt/z-flow
bash scripts/verify-after-reboot.sh
```

Debe terminar con:

```text
REINICIO DEL LXC: PRUEBA APROBADA
```

No es necesario ejecutar `docker compose up` manualmente después del reinicio: Docker debe iniciar con el sistema y los servicios de Z-FLOW usan `restart: unless-stopped`.
