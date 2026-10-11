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

El backup usa `mariadb-dump --single-transaction` y se comprime con gzip. Las copias automáticas conservan por defecto 14 días; el propietario puede configurar la retención desde el panel.

## Backup automático diario

```bash
cd /opt/z-flow
bash scripts/install-backup-cron.sh
```

Esto instala el programador de copias. El valor predeterminado es una copia diaria a las 03:00, hora de Lima, con 14 días de conservación. Desde **Backup → Programación automática**, el propietario puede cambiar la hora y la retención (de 1 a 3650 días). El cambio se guarda en el volumen persistente y se aplica automáticamente, sin reinstalar cron ni reiniciar los servicios.

Cron revisa la hora configurada cada minuto y crea como máximo una copia al día. Al superar el plazo configurado, se eliminan las copias locales con nombre `zflow_*.sql.gz`. Las copias subidas con prefijo `uploaded_` no se eliminan por esta rotación.

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
4. Configurar la hora diaria y los días de conservación de las copias automáticas.

La restauración requiere escribir `RESTAURAR`, bloquea la operación mientras haya cajas abiertas y crea una copia previa automática. Guarda la descarga en otro equipo antes de migrar a un servidor nuevo.

## Etapa nube

Al migrar a nube se añadirá una segunda copia fuera del servidor local (object storage o almacenamiento externo). Un backup guardado únicamente en el mismo LXC no sustituye un backup externo.
