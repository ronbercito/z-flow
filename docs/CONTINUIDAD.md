# Z-FLOW — Documento de continuidad

**Fecha de corte:** 10/10/2026
**Repositorio:** `ronbercito/z-flow`
**Rama publicada:** `main`
**Checkpoint publicado:** `main` `c09fffeb`
**Estado general:** la revisión del código y la preparación para instalación limpia se integraron en `main`. CI aprobó API, web y Docker. Factiliza permanece retirado. El LXC no se actualizó y la primera instalación en un contenedor limpio todavía debe ejecutarse.

## Revisión general y preparación de instalación (10/10/2026)

La revisión del repositorio se integró en `main` mediante PR #4. GitHub Actions aprobó los builds de API, web y Docker. La compilación local no se ejecutó; la validación se realizó en CI.

La instalación limpia ya está versionada en `scripts/install-local.sh`. Descarga el código desde `main`, crea secretos aleatorios, inicia los servicios, configura backups diarios y rotación, y guarda una copia inicial. Las instalaciones nuevas empiezan sin operaciones de muestra y sin una caja abierta.

Comando publicado para Debian/Ubuntu:

```bash
curl -fsSL https://raw.githubusercontent.com/ronbercito/z-flow/main/scripts/install-local.sh | bash
```

Ejecutar como `root` en un contenedor limpio. En Proxmox LXC, Docker requiere `nesting=1` y `keyctl=1`. Se puede descargar el script antes y definir `WEB_PORT` y `API_PORT` si los puertos predeterminados están ocupados. El instalador muestra la IP, el puerto y las credenciales iniciales del propietario y encargado; guárdalas al terminar.

**Pendiente operativo:** probar este comando en el contenedor de destino y validar que API y web queden saludables. Esa instalación real no se ha ejecutado desde este entorno.

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

## Cambio en curso: espacios separados por filial (09/10/2026)

En `develop` se implementó una primera versión para que cada filial use su propia identidad comercial, reportes e historial de cierres:

- La API tiene una tabla de identidad independiente por filial y protege lectura/escritura mediante permisos y el ID de filial autenticado.
- La sección «Mi Negocio» permite mantener nombre comercial, razón social, RUC, dirección, teléfono, logo, prefijo de comprobante y pie de ticket.
- Los documentos internos y reportes generados por la API toman los datos comerciales de la filial.
- El reporte de filial incorpora rangos día, semana, mes y personalizado, además del detalle tabular de operaciones.
- Cierres de filial muestra el historial, PDF y detalle de las operaciones del turno cerrado.
- El propietario conserva las pantallas consolidadas existentes. No se actualizó el LXC.
- `git diff --check` quedó limpio. No fue posible compilar localmente: `npm` no está instalado y el intento con el pnpm incluido falló al resolver la ruta del workspace, que no tiene dependencias locales instaladas.

Antes de desplegar, revisar CI/build y probar aislamiento entre al menos dos filiales: usuario de filial A no puede consultar ni editar B; propietario puede consultar ambas. Verificar también que los datos y el logo correctos aparezcan en PDF de cierre y comprobante interno.

### Corrección de carga del logo (09/10/2026)

El primer uso de «Mi Negocio» mostró `Unexpected token '<'` al guardar una identidad con logo. El formulario acepta archivos de hasta 2 MB; Nginx y Fastify tenían un límite predeterminado cercano a 1 MB. Se elevaron ambos límites a 4 MB y se mejoró el manejo de respuestas HTML inesperadas. Esta corrección requiere CI y despliegue por `scripts/update-local.sh` antes de reintentar guardar.

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

### Primera instalación limpia

1. Ejecutar el instalador publicado en un contenedor Debian/Ubuntu vacío.
2. En Proxmox, habilitar `nesting=1` y `keyctl=1`.
3. Confirmar que Docker, API y Web queden saludables.
4. Guardar las credenciales iniciales mostradas por el instalador.
5. Abrir la primera caja y validar una operación de cada tipo, cierre y backup.

### Validación operativa pendiente

Después de la instalación, actualizar el LXC de pruebas desde el repositorio y comprobar:

- que Integraciones/Factiliza ya no aparezca;
- que el historial electrónico antiguo siga consultable;
- que cada filial vea solo su identidad, reporte y cierres;
- que el propietario pueda consultar la información consolidada;
- los flujos con las cinco filiales reales antes de cerrar esa etapa.

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

**Siguiente objetivo:** ejecutar la primera instalación limpia con el instalador publicado en `main` y validar la operación en el contenedor de destino.
