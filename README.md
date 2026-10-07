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

> La autenticación y el RBAC completo se implementarán en el siguiente bloque. La restricción definitiva siempre se hará también en backend, no solamente ocultando menús.

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

