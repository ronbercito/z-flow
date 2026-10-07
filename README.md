# Z-FLOW

Sistema independiente para gestionar filiales, operaciones de Yape/efectivo, cajas, comisiones, cierres, comprobantes, reportes, usuarios y roles.

## Entorno inicial

La primera etapa se ejecuta en un contenedor local y se accede por IP, sin dominio.

Arquitectura inicial:
- Web/PWA: Next.js
- API: Node.js + TypeScript
- Base de datos: MariaDB
- ORM: Prisma
- Despliegue local: Docker Compose

El proyecto se desarrollará primero en la rama `develop` y luego se promoverá a producción.
