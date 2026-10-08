# Z-FLOW — Backups

## Backup manual

Desde el contenedor LXC de Z-FLOW:

```bash
cd /opt/z-flow
bash scripts/backup.sh
```

Los archivos se guardan en:

```text
/opt/z-flow/backups/
```

El backup usa `mariadb-dump --single-transaction`, se comprime con gzip y conserva por defecto 14 días.

## Backup automático diario

```bash
cd /opt/z-flow
bash scripts/install-backup-cron.sh
```

Esto instala una tarea diaria a las 03:00.

Verificar:

```bash
cat /etc/cron.d/zflow-backup
tail -f /var/log/zflow-backup.log
```

## Restaurar

Antes de restaurar, guarda un backup del estado actual.

```bash
cd /opt/z-flow
bash scripts/restore.sh /opt/z-flow/backups/zflow_YYYYMMDD_HHMMSS.sql.gz
```

El script exige escribir `RESTAURAR` para evitar restauraciones accidentales.

## Backup desde el panel

Entra como propietario y abre **Backup** para:

1. Crear una copia comprimida de la base de datos.
2. Descargar cualquier copia guardada como archivo `.sql.gz`.
3. Subir una copia `.sql.gz` generada por Z-FLOW y restaurarla.

La restauración requiere escribir `RESTAURAR`, bloquea la operación mientras haya cajas abiertas y crea una copia previa automática. Guarda la descarga en otro equipo antes de migrar a un servidor nuevo.

## Etapa nube

Al migrar a nube se añadirá una segunda copia fuera del servidor local (object storage o almacenamiento externo). Un backup guardado únicamente en el mismo LXC no sustituye un backup externo.
