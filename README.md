# CuerPro

App para entrenar con tu grupo de amigos del gym: rutinas por músculo, alternativas cuando la máquina está ocupada, quién va y quién falta, avisos de músculos abandonados y niveles por temporada (Bronce → Diamante).

Desarrollado por **Leandro Alegre**.

## Qué hay en el repo

| Carpeta | Qué es |
| --- | --- |
| `app/`, `components/`, `constants/`, `hooks/`, `lib/` | App de celular (Expo / React Native) para iPhone y Android |
| `server/` | API en Node.js (Express + MySQL), se levanta con pm2 |
| `web/` | Página de descarga y `.htaccess` que manda `/api.php` a la API |

Está armado igual que TimbreWeb: una sola ruta `/api` que recibe `action` y los parámetros, y responde `{ ok, ... }` o `{ ok: false, error }`.

## Correr en la compu

```bash
# API (necesita un MySQL con una base vacía)
cd server
cp .env.example .env      # completar DB_NAME, DB_USER, DB_PASS
npm install
npm run dev               # crea las tablas y carga los ejercicios la primera vez

# App
cd ..
npm install
EXPO_PUBLIC_API_URL=http://<IP-de-tu-compu>:3031/api npx expo start
```

Para la prueba de punta a punta de la API (borra las tablas `cuerpro_*` de la base que le pases, usá una de prueba):

```bash
cd server
CUERPRO_TEST_DB=1 DB_NAME=cuerpro_test DB_USER=... DB_PASS=... npm test
```

## Publicar en sistemascloud.ar

1. En el panel, crear la base `sistemacbahost_cuerpro` y el usuario `sistemacbahost_cuerpro_api` con todos los permisos sobre esa base.
2. Crear el subdominio `cuerpro.sistemascloud.ar`.
3. Subir la carpeta `server/` a `/home/sistemacbahost/cuerpro-api/`, crear el `.env` con los datos reales y correr `./deploy.sh` (instala dependencias y levanta `cuerpro-api` con pm2 en el puerto 3031).
4. Generar la app web con `npx expo export --platform web` (sale en `dist/`) y copiar el contenido de `dist/`, `web/descargar.html`, `web/logo.png`, `web/favicon.png` y `web/.htaccess` a la carpeta del subdominio. La raíz es la app web, `/descargar.html` es la página de descarga, y el `.htaccess` manda `https://cuerpro.sistemascloud.ar/api.php` a la API.
5. Probar: `https://cuerpro.sistemascloud.ar/api.php?action=ping` tiene que devolver `{"ok":true,...}`.

La app ya apunta a `https://cuerpro.sistemascloud.ar/api.php` (`constants/api.ts`).

## Generar la app

```bash
npx eas-cli login
npx eas-cli init                                     # agrega el projectId (hace falta para las notificaciones)
npx eas-cli build --profile preview --platform android   # .apk para bajar desde la web
npx eas-cli build --profile production --platform ios    # para TestFlight (cuenta de Apple Developer)
```

## Reglas de puntos

| Acción | Puntos |
| --- | --- |
| Asistencia confirmada por un coach | 10 |
| Récord personal en un ejercicio | 15 |
| Rutina completa del día | 5 (pendiente) |
| Semana completa | 20 (pendiente) |
| Semana sin avisos de músculo abandonado | 10 (pendiente) |

Niveles por mes: Bronce 0, Plata 100, Oro 200, Platino 300, Diamante 380. Al empezar el mes bajás un nivel, no volvés a Bronce.

## Qué falta

- Puntos semanales (semana completa, rutina completa, sin avisos) y recordatorio antes del encuentro: necesitan una tarea programada.
- Biblioteca de planes publicados entre grupos.
- Ranking entre grupos.
