# Briochett · Sistema comercial

MVP responsive con Vue 3, TypeScript, Vite, Vue Router y Pinia en Cloudflare Pages; API Hono y Better Auth en Workers; persistencia exclusiva del backend en D1. La web pública de `briochett-web` es independiente.

## Arquitectura por capas

| Capa            | Backend (`apps/api/src`)                                                                                               | Frontend (`apps/web/src`)                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Presentación    | `presentation/http`: controladores, validación de solicitudes, autenticación HTTP, permisos y respuestas               | `presentation`: vistas, componentes, navegación y estilos                                          |
| Aplicación      | `application/services`: casos de uso; `application/ports.ts`: interfaces de persistencia y servicios externos          | `application/composables`: estado y flujos de formularios; `application/stores`: sesión y permisos |
| Dominio         | `domain`: precios decimales, disponibilidad de visitas, errores y primitivas independientes de Hono/D1                 | Tipos, validaciones y reglas compartidas de `@briochett/contracts`                                 |
| Infraestructura | `infrastructure/repositories`: consultas D1, mapeos y transacciones; `auth`: Better Auth; `integrations`: adaptador a2 | `infrastructure`: cliente HTTP, autenticación, borradores, GPS y exportación de archivos           |

El punto de entrada del Worker es `apps/api/src/index.ts`. `composition.ts` construye los adaptadores e inyecta los repositorios mediante interfaces en los servicios. Los controladores reciben los servicios de la solicitud; no ejecutan SQL. Los servicios contienen las reglas de alcance, completitud, estados y reintentos; no reciben un contexto Hono ni una base D1. Los repositorios conservan las operaciones atómicas y las restricciones de las migraciones. No se modificó el esquema de datos en esta reorganización.

Las vistas y los componentes de formularios Vue delegan su lógica en composables. La presentación no importa adaptadores de infraestructura. Las reglas de `eslint.config.js` impiden esas dependencias y prohíben consultas D1 en dominio, aplicación y controladores. Los adaptadores dependen de los puertos y contratos; no de los servicios ni de las vistas.

## Uso local

Requiere Node.js 24 y npm. Ejecutar desde esta carpeta:

```sh
npm ci
npm run setup:dev
npm run db:migrate
npm run dev
```

Frontend: <http://localhost:5173>. API: <http://localhost:8787>. Usar estas direcciones exactas para que coincidan el origen y las cookies.

Con la API encendida, elegir una inicialización:

- `npm run bootstrap`: crea un administrador y exige cambiar su contraseña en el primer acceso. Las credenciales quedan en `.credentials/administrador-local.json`.
- `npm run seed:dev`: carga datos ficticios y cuentas de los cuatro roles únicamente en una base local vacía. Las credenciales quedan en `.credentials/desarrollo.json`. Las tasas y los precios de este conjunto son ejemplos.

Los secretos locales se generan en `apps/api/.dev.vars`. `.credentials/`, `.dev.vars` y los datos locales de Wrangler están excluidos del control de versiones. No compartir estos archivos ni incorporarlos al frontend.

## Permisos

| Rol            | Acceso                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Administración | Usuarios y asignaciones, clientes, catálogo, tasas, pedidos, validación/anulación, rutas, visitas, comandas, reportes e historial |
| Vendedor       | Clientes y rutas asignados, completar fichas y ubicación, visitas, pedidos propios                                                |
| Preparación    | Comandas validadas; avanzar de pendiente a en preparación y listo                                                                 |
| Supervisión    | Consulta de clientes, rutas, visitas, pedidos, comandas y reportes                                                                |

El servidor vuelve a comprobar el rol, la cuenta activa y las asignaciones en cada petición. Desactivar o cambiar de rol a un usuario revoca sus sesiones. No existe registro público. Las cuentas nuevas y los restablecimientos administrativos exigen cambio de contraseña.

## Operación

- El selector de clientes busca por nombre, código o RIF y pagina de 20 en 20 mediante FTS5.
- El vendedor completa nombre, RIF, contacto, teléfono, dirección y ubicación antes de registrar un pedido. El GPS se solicita al pulsar el botón, muestra precisión y requiere confirmar. Los errores permiten reintentar conservando el formulario.
- Cada negocio define días, franjas horarias y recurrencia semanal, quincenal o mensual desde una fecha de referencia. Las rutas conservan el orden de las paradas. Una ruta con visitas realizadas no se reemplaza.
- Una visita sin pedido puede dejar programada la siguiente. Un pedido asociado a una visita la completa una sola vez.
- Los pedidos usan cantidades enteras positivas y un resumen calculado por el servidor. Administración valida el pedido para generar una única comanda. Se puede anular antes de iniciar la preparación.
- Los precios base son USD. COP y VES necesitan tasas manuales. Se redondea el precio unitario convertido a dos decimales antes de multiplicar por la cantidad. Cada pedido conserva sus precios y tasa. Los reportes separan monedas y consolidan el importe base USD histórico.
- Los borradores se guardan por usuario en el navegador. Ante una respuesta de envío incierta, el mismo pedido se reintenta con su clave original para evitar duplicados. Se necesita conexión; no hay sincronización offline.
- Zona horaria: `America/Caracas`.

## API y datos

Autenticación: `/api/auth`. Recursos: `/api/v1`. Especificación OpenAPI: `/api/v1/openapi.json`. Salud: `/health`.

La aplicación usa cookies HttpOnly, Secure en producción y sesiones persistentes de ocho horas. El frontend envía credenciales a la API; CORS y la comprobación del origen admiten únicamente el frontend configurado. Los intentos de login están limitados. Las consultas usan parámetros. Las migraciones de `apps/api/migrations` incluyen FTS5, auditoría y restricciones de concurrencia; los pedidos y sus partidas se guardan en un lote atómico.

`packages/contracts` comparte tipos y validaciones Zod entre ambas aplicaciones. El puerto `A2Gateway` en `apps/api/src/application/ports.ts` define la interfaz futura para importar/crear clientes, enviar pedidos y consultar estados de cuenta. Su adaptador deshabilitado está en `apps/api/src/infrastructure/integrations/a2-gateway.ts`. La conexión está deshabilitada hasta confirmar la versión y el mecanismo de conexión del equipo local. Las consultas de cuenta devuelven un error explícito de integración pendiente; no hay saldos simulados en producción.

## Verificación

```sh
npm run validate
```

Este comando ejecuta ESLint sin advertencias permitidas, comprueba el formato Prettier, valida los tipos, ejecuta las pruebas y compila el frontend. También se ejecuta en GitHub Actions para cada push a `main` y cada pull request mediante `.github/workflows/checks.yml`.

Comandos individuales: `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`, `npm run check`, `npm test` y `npm run build`. ESLint aplica las reglas recomendadas para JavaScript, TypeScript y Vue, imports de tipos y límites entre capas. El código productivo no admite `any` explícito; el cliente de pruebas de API tiene una excepción localizada para respuestas heterogéneas. Prettier y `.editorconfig` mantienen archivos legibles y un formato consistente.

Las pruebas cubren los cuatro roles, autenticación, 10.000 clientes con búsqueda y paginación por asignación, GPS y completitud, monedas y redondeos, precios históricos, reintentos concurrentes, validación/comanda, preparación, horarios, visitas y reportes. Las pruebas de servicios comprueban reglas de alcance y protección de la cuenta administrativa sin HTTP ni D1. Las pruebas de integración usan una D1 aislada mediante Miniflare y no modifican producción. La revisión visual se realiza a tamaños de computadora y teléfono; los modales difuminan el fondo y las tablas pasan a tarjetas en teléfono.

La dependencia de desarrollo `minimatch` se fija mediante `overrides` a una versión corregida para evitar la vulnerabilidad de amplificación de patrones que afecta a versiones anteriores a 11.0.1. Los linters se comprueban con esa resolución y el árbol de dependencias se conserva en `package-lock.json`.

## Publicación

Destino del frontend: <https://app.briochettvzla.com>. Destino de la API: <https://api.briochettvzla.com>. El estado efectivo del despliegue se registra en `DEPLOYMENT.json` una vez verificado.

1. Autorizar Wrangler en la cuenta configurada. Crear una D1 exclusiva del sistema y poner su identificador real en `apps/api/wrangler.jsonc`.
2. Aplicar las migraciones remotas desde `apps/api`: `npx wrangler d1 migrations apply DB --remote`.
3. Configurar en Workers `BETTER_AUTH_SECRET` y, solo para inicializar, `BOOTSTRAP_TOKEN` mediante los secretos de Wrangler. Generar valores aleatorios privados; no colocarlos en `vars` ni en variables Vite.
4. Ejecutar `npm run deploy:api`. La configuración de Wrangler asocia el dominio de la API.
5. Crear el proyecto Pages `briochett-app`, publicar con `npm run deploy:web` y asociar `app.briochettvzla.com`. Si Wrangler intenta delegar la creación inicial a Workers, crear desde `apps/web` con `npx wrangler pages project create briochett-app --production-branch main --force`. Los siguientes despliegues ya no necesitan ese indicador. El subdominio necesita un CNAME `app` → `briochett-app.pages.dev`, además de la asociación en Pages. Para integración Git en Pages, usar esta carpeta como raíz, `npm run build` y directorio de salida `apps/web/dist`. Si la raíz es `apps/web`, usar su compilación y salida `dist`, instalando antes los workspaces desde la raíz. Los despliegues directos usan `apps/web/wrangler.jsonc`, salida `dist` y rama de producción `main`.
6. Con la API HTTPS disponible, ejecutar `npm run bootstrap -- --production` proporcionando `BOOTSTRAP_TOKEN` por el entorno privado. La contraseña inicial aleatoria queda en `.credentials/produccion.json`. Cambiarla al acceder por primera vez. Después retirar el secreto `BOOTSTRAP_TOKEN` de Workers.
7. Comprobar HTTPS, cookies entre subdominios, origen permitido, acceso directo y recarga de rutas. No ejecutar la semilla de desarrollo en producción.

`apps/web/.env.production` fija el origen público de la API. Las reglas `_redirects` de Pages permiten recargar rutas de la SPA. Las cabeceras incluyen CSP y limitan el uso de geolocalización al propio sitio. Los despliegues conservan el dominio raíz de la web pública.

No incluye facturación fiscal, cobros, inventario, optimización de rutas ni la conexión real con a2.
