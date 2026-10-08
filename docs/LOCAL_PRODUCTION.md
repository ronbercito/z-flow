# Z-FLOW — Producción local en Proxmox

Z-FLOW se mantiene en el LXC local hasta terminar las pruebas reales de las filiales.

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
