# Arquitectura inicial de Z-FLOW

## Etapa 1: contenedor local por IP

No se usa dominio en esta etapa.

- Web: React + Vite, servido por Nginx.
- API: Fastify + TypeScript.
- Base de datos: MariaDB.
- Proxy: Nginx reenvía `/api` al contenedor API.
- Acceso: `http://IP_DEL_CONTENEDOR:8080`.

La base de datos no se publica hacia la red; solo la API puede acceder a ella dentro de Docker.

## Permisos

El backend será la autoridad de permisos. Ocultar un menú en la web no será suficiente.

La vista de filial tendrá solamente:

- Inicio
- Operaciones
- Caja
- Cierre diario
- Comprobantes
- Reportes
- Mi perfil
- Ayuda

La filial nunca podrá consultar otras filiales mediante una URL manual.

## Crecimiento

La misma arquitectura puede moverse posteriormente a un VPS/nube. En ese momento se incorporarán dominio, HTTPS, backups externos y despliegue automatizado.
