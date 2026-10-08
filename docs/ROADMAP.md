# Z-FLOW — Roadmap

## Fase 1
- [x] Estructura Docker local
- [x] MariaDB y esquema inicial
- [x] API base
- [x] Dashboard restringido de filial
- [x] Login y sesiones
- [x] RBAC por rol y aislamiento de filial en backend
- [x] Nueva operación real
- [x] Apertura y cierre de caja
- [x] Ticket interno imprimible (PDF/58-80 mm pendiente de ajuste final)

## Fase 2
- [x] Dashboard propietario
- [x] Gestión de filiales
- [x] Usuarios y roles
- [x] Configuración de comisiones
- [x] Comisión completa para el encargado de filial
- [x] Reportes y exportaciones PDF/Excel
- [x] Auditoría administrativa inicial

## Fase 3
- [x] Reportes por rango de fechas
- [x] Exportación PDF
- [x] Exportación Excel
- [x] Ganancia histórica del encargado calculada por sus operaciones
- [x] Cierre diario con comisión del encargado y conciliación
- [x] Comprobante interno correlativo y PDF 80 mm
- [x] Backup local y restauración
- [x] Backup local automático diario
- [x] Base local lista para consolidación en Proxmox


## Fase 2.1
- [x] Ficha detallada por filial
- [x] Edición de datos y estado de filial
- [x] Configuración de límite y comisión desde la ficha
- [x] Administración y edición de usuarios
- [x] Restablecimiento de contraseña de usuarios
- [x] Historial de operaciones por filial
- [x] Historial de cierres por filial
- [x] Filtros por filial y rango de fechas


## Fase 4 — Producción local en Proxmox
- [x] Configuración general del negocio
- [x] Logo, datos comerciales y pie de ticket
- [x] Moneda y zona horaria local
- [x] Prefijo configurable de comprobantes internos
- [x] Reglas centrales y aplicación masiva a filiales
- [x] Referencia obligatoria configurable para Efectivo → Yape
- [x] Anulación de operaciones durante turno abierto con motivo
- [x] Reverso de propietario para correcciones posteriores
- [x] Bloqueo de edición de operaciones cerradas
- [x] Un solo Cajero / Encargado activo por filial
- [x] Detalle del encargado con ganancias y actividad
- [x] Eliminación del módulo de socios del flujo operativo
- [x] Permisos configurables por rol con validación en backend
- [x] Gestión y cierre remoto de sesiones
- [x] Auditoría de login fallido, logout, IP y agente de usuario
- [x] Health checks MariaDB/API/Web
- [x] Reinicio automático de contenedores
- [x] Rotación de logs Docker
- [x] Zona horaria America/Lima en contenedores
- [x] Diagnóstico local del LXC
- [x] Actualizador local seguro con backup previo
- [x] Verificación de restauración en base temporal
- [x] Endurecimiento de permisos de .env
- [ ] Pruebas paso a paso en el LXC real con las filiales

## Fase 5 — Pruebas reales
- [x] Flujo completo Miraflores: apertura → operaciones → cierre
- [x] Flujo completo PNC Playa: apertura → operaciones → cierre
- [x] Separación de datos y ganancias entre filiales
- [x] Anulación con motivo y registro en auditoría
- [x] Aislamiento propietario / Cajero-Encargado por filial
- [ ] Reverso de propietario sobre una operación ya cerrada
- [ ] Prueba multiusuario simultánea entre filiales
- [x] Prueba no destructiva de backup y restauración
- [x] Prueba de reinicio del LXC y arranque automático
- [ ] Validación con las 5 filiales reales

## Fase final — Nube
- [ ] Backup externo fuera del LXC
- [ ] Despliegue en nube
- [ ] Dominio y HTTPS
- [ ] Integración tributaria/electrónica SUNAT una vez definida contablemente
