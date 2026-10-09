# Z-FLOW — Documento de continuidad

**Fecha de corte:** 09/10/2026
**Repositorio:** `ronbercito/z-flow`
**Rama de trabajo:** `develop`
**Checkpoint publicado:** `main` `16c6c82` (README breve); `develop` `69d5785` antes de esta actualización
**Estado general:** el repositorio está sincronizado con `origin/develop`. La emisión de comprobantes Factiliza se retiró; no se ha confirmado todavía la actualización del LXC con estos cambios. Las pruebas técnicas locales están aprobadas y falta validar las 5 filiales reales antes de cerrar la etapa.

## Estado del README y ramas al 09/10/2026

- La página principal de GitHub estaba en `main`, que antes solo mostraba el README inicial. La PR #2 se combinó para llevar el proyecto completo a `main`.
- El README se redujo a una presentación del producto, funciones y tecnología. El manual operativo detallado queda en `docs/LOCAL_PRODUCTION.md`.
- La PR #3 ya se combinó en `main`; `main` está en `16c6c82` y el README breve es visible en la portada.
- Las bitácoras de esta sesión se actualizan en `develop`; después deben promocionarse a `main` mediante una PR para conservar el flujo de ramas.

## Cambio más reciente: retiro de Factiliza

El propietario decidió retirar Factiliza para evitar emitir comprobantes por medio de un proveedor cuya autorización no estaba confirmada.

- No hay emisión nueva de boletas desde el panel ni endpoint de emisión en la API.
- Se conserva la consulta de registros/archivos electrónicos históricos de cada cierre, si existen.
- La base conserva la tabla histórica `factiliza_documents`; se eliminan las tablas de configuración y correlativos del proveedor.
- El actualizador `scripts/update-local.sh` elimina las variables antiguas `FACTILIZA_*` del archivo `.env` al actualizar.
- Hasta definir y verificar otro proveedor y el tratamiento tributario, los documentos generados por Z-FLOW son comprobantes internos de control, no comprobantes electrónicos SUNAT.
- Próximo paso de despliegue: ejecutar `bash scripts/update-local.sh` en `/opt/z-flow` y comprobar que Integraciones ya no muestre Factiliza, que el estado del sistema sea saludable y que los registros electrónicos históricos continúen consultables.

Los cambios de caja que figuraban como modificaciones locales antes de sincronizar el checkout ya están incluidos en `origin/develop`; el checkout local se alineó sobre esa versión y el commit de estilo de usuario ya estaba aplicado allí.

---

## 1. Regla principal para continuar el desarrollo

Toda corrección o función debe hacerse **primero en el repositorio**.

No aplicar soluciones permanentes solo en `/opt/z-flow`.

Secuencia obligatoria:

1. modificar `develop`;
2. dejar pasar CI;
3. actualizar el LXC desde Git;
4. probar;
5. si aparece un problema, corregir nuevamente en el repositorio.

Esto es importante porque después Z-FLOW debe instalarse limpio en otro servidor sin depender de arreglos manuales.

## 2. Entorno local actual

Ruta del proyecto:

```bash
/opt/z-flow
```

Servicios Docker:

- `z-flow-db-1` — MariaDB 11.
- `z-flow-api-1` — Fastify/TypeScript.
- `z-flow-web-1` — React/Vite servido por Nginx.

Puertos actuales:

- Web: `8080`.
- API: `127.0.0.1:3001`.
- MariaDB: solo red interna de Docker.

Comprobación:

```bash
cd /opt/z-flow
docker compose ps
curl -fsS http://127.0.0.1:3001/health
```

## 3. Actualización segura del LXC

Preferir:

```bash
cd /opt/z-flow
bash scripts/update-local.sh
```

Ese flujo crea backup antes de actualizar.

Para una actualización manual controlada:

```bash
cd /opt/z-flow
git checkout develop
git pull --ff-only origin develop
docker compose up -d --build
docker compose ps
```

### No hacer

No ejecutar:

```bash
docker compose down -v
```

porque elimina el volumen de la base de datos.

Tampoco hacer arreglos permanentes editando archivos del proyecto solo dentro del LXC.

## 4. Modelo de negocio vigente

No volver al modelo anterior de socios salvo una decisión explícita futura.

Modelo actual:

- OWNER: propietario.
- CASHIER: Cajero / Encargado.
- una filial = un encargado activo;
- la comisión completa pertenece al encargado;
- no existe reparto con socios;
- cada encargado queda restringido a su filial;
- el propietario ve el consolidado.

La creación de encargado pide solamente:

- nombre completo;
- nombre de cuenta;
- filial;
- contraseña.

El rol aparece fijo como **Cajero / Encargado**.

## 5. Semántica financiera actual

Operaciones:

### Yape → Efectivo
- entra Yape por el monto;
- sale efectivo por el neto;
- la diferencia corresponde a la comisión.

### Efectivo → Yape
- entra efectivo por el monto;
- sale Yape por el neto;
- la diferencia corresponde a la comisión.

La ganancia del encargado se calcula con la comisión de operaciones en estado `COMPLETED`.

Estados relevantes:

- `COMPLETED`: cuenta en operaciones y ganancia.
- `CANCELLED`: anulada.
- `REVERSED`: revertida por propietario; no cuenta como ganancia ni operación válida.

Las operaciones revertidas se mantienen visibles como historial.

## 6. Caja y cierre

Flujo:

1. encargado abre caja;
2. registra operaciones;
3. consulta efectivo/Yape actuales;
4. inicia cierre;
5. sistema calcula esperado;
6. encargado declara efectivo/Yape;
7. se calculan diferencias;
8. si hay diferencia, se exige observación;
9. se guarda cierre;
10. se puede generar PDF.

Resultados implementados:

- `BALANCED`;
- `SHORTAGE`;
- `SURPLUS`;
- `MIXED`.

## 7. Correcciones de operaciones

### Anulación
Se usa durante un turno abierto y exige motivo.

### Reverso de propietario
Se usa para una corrección administrativa posterior.

Endpoint:

```text
POST /api/admin/operations/:operationId/reverse
```

Al revertir:

- la operación pasa a `REVERSED`;
- el comprobante pasa a inválido/VOID;
- se registra `operation_events`;
- se registra auditoría `OPERATION_REVERSED`;
- la comisión deja de sumar a la ganancia del encargado.

Esta función fue probada y aprobada.

## 8. Usuarios / encargados

La pantalla actual debe permanecer simple.

Lista:

- nombre;
- cuenta;
- filial;
- último acceso;
- botón Detalles.

Detalle:

- Ganancia hoy.
- Ganancia acumulada.
- Operaciones hoy.
- Operaciones acumuladas.
- Usuario.
- Filial.
- Último acceso.
- Caja actual.
- Actividad reciente:
  - fecha;
  - tipo;
  - monto;
  - ganancia;
  - estado.

No agregar opciones innecesarias sin necesidad operativa.

## 9. Seguridad

Implementado:

- cookie HttpOnly;
- sesiones en servidor;
- SHA-256 del token de sesión;
- bcrypt para contraseñas;
- sesiones revocables;
- aislamiento por filial en backend;
- auditoría;
- IP real con proxy confiable;
- gestión de permisos;
- cierre remoto de sesiones;
- bloqueo de login fallido.

En UI de negocio mantener solo roles relevantes OWNER y CASHIER.

Pueden existir estructuras históricas/roles legacy en bases actualizadas. No borrarlos de forma destructiva sin estudiar las dependencias.

## 10. Backups

Backup manual:

```bash
cd /opt/z-flow
bash scripts/backup.sh
```

Backups:

```text
/opt/z-flow/backups/zflow_YYYYMMDD_HHMMSS.sql.gz
```

Backup automático:

- 03:00 todos los días;
- retención local predeterminada: 14 días;
- cron: `/etc/cron.d/zflow-backup`.

Prueba no destructiva:

```bash
cd /opt/z-flow
bash scripts/test-restore.sh
```

Validación completa:

```bash
bash scripts/verify-local-production.sh
```

La prueba real ya fue aprobada comparando producción con una restauración en base temporal.

## 11. Reinicio y recuperación

Docker se habilita al arrancar el LXC.

Los servicios usan:

```text
restart: unless-stopped
```

Después de reiniciar el LXC:

```bash
cd /opt/z-flow
bash scripts/verify-after-reboot.sh
```

La prueba ya fue aprobada: DB, API, Web y cron regresaron automáticamente.

En Proxmox mantener activado **Start at boot** para el CT de Z-FLOW.

## 12. Pruebas aprobadas hasta el checkpoint

- Miraflores: flujo completo.
- PNC Playa: flujo completo.
- Separación de datos y ganancias.
- Anulación con auditoría.
- Aislamiento por filial.
- Reverso de propietario.
- Dos filiales trabajando simultáneamente.
- Backup y restauración no destructiva.
- Reinicio completo del LXC.
- Arranque automático de servicios.
- Cron de backup.

## 13. Pendiente inmediato

### Prioridad 1 — actualizar y comprobar el LXC

1. Actualizar `/opt/z-flow` usando `bash scripts/update-local.sh`.
2. Confirmar que Docker, API y Web queden saludables.
3. Confirmar que la opción Integraciones/Factiliza ya no aparezca.
4. Revisar un cierre con y sin registro electrónico histórico y verificar que los datos archivados sigan consultables.

### Prioridad 2 — 5 filiales reales

Para cada filial:

1. crear/configurar filial;
2. crear su único encargado;
3. iniciar sesión como encargado;
4. abrir caja;
5. registrar una Yape → Efectivo;
6. registrar una Efectivo → Yape;
7. revisar caja y ganancia;
8. cerrar caja;
9. revisar PDF;
10. entrar como propietario;
11. verificar que operaciones, cierre y ganancia pertenezcan solo a esa filial.

No marcar Fase 5 como terminada hasta completar las cinco.

### Prioridad 3 — cierre de etapa local

Cuando las 5 filiales pasen:

- marcar `Pruebas paso a paso en el LXC real con las filiales` como completado en ROADMAP;
- marcar `Validación con las 5 filiales reales` como completado;
- actualizar BITACORA y CONTINUIDAD;
- dejar un checkpoint/tag estable si se decide;
- no migrar todavía a nube sin cerrar este punto.

### Prioridad 4 — instalador

Después del cierre local, preparar un instalador reproducible para un servidor nuevo.

Debe contemplar como mínimo:

- requisitos del host;
- Docker;
- clonación del repositorio;
- selección de versión estable;
- generación/configuración de `.env`;
- contraseñas seguras;
- inicio de servicios;
- inicialización/migraciones;
- instalación de cron de backup;
- permisos;
- health checks;
- creación segura de OWNER;
- validación automática final;
- instrucciones de recuperación.

El instalador debe usar únicamente lo que esté versionado en el repositorio.

## 14. Fase final futura

No adelantar hasta terminar pruebas locales:

- backup externo fuera del LXC;
- despliegue en nube;
- dominio;
- HTTPS;
- integración electrónica/SUNAT una vez definido el flujo tributario.

## 15. Archivos importantes

```text
docker-compose.yml
.env.example
apps/api/
apps/web/
database/init/
scripts/backup.sh
scripts/restore.sh
scripts/test-restore.sh
scripts/install-backup-cron.sh
scripts/install-local-production.sh
scripts/update-local.sh
scripts/diagnose.sh
scripts/verify-local-production.sh
scripts/verify-after-reboot.sh
docs/ROADMAP.md
docs/LOCAL_PRODUCTION.md
docs/BITACORA.md
docs/CONTINUIDAD.md
```

## 16. Estado de continuidad

Si se abre un chat nuevo, empezar leyendo:

1. `docs/CONTINUIDAD.md`;
2. `docs/BITACORA.md`;
3. `docs/ROADMAP.md`.

El siguiente trabajo no es rediseñar usuarios ni volver a socios.

**Siguiente objetivo:** completar la validación operativa de las 5 filiales reales y, después, preparar el instalador reproducible para otro servidor.
