# CuerPro — Contexto para Claude

## Qué es
App de gym para grupos de amigos que entrenan juntos en el mismo gimnasio. Desarrollador: Leandro Alegre.
- Stack: Expo SDK 52 (React Native, expo-router) + Express/Node (pm2, puerto 3031) + MySQL en la cuenta `sistemacbahost` de sistemascloud.ar (DataWeb Hosting, panel DirectAdmin).
- Copia la forma de `leandroalegre/timbreweb-app`, que corre en la misma cuenta (TimbreWeb usa el puerto 3030).
- Documento de diseño: https://claude.ai/artifact/PfqV7m5bWo6e3CTcQ1iTCm

## Arquitectura de producción
```
App Expo → https://cuerpro.sistemascloud.ar/api.php
         → Apache (.htaccess de web/) → Express :3031/api → MySQL (pool)
```
- `server/index.js`: un único handler `app.all('/api')` que despacha por `action` al objeto `acciones`.
- Respuesta: `{ ok: true, ...datos }` o `{ ok: false, error }` con el status HTTP que corresponda.
- Auth: `login`/`registro` devuelven `token` (60 días, tabla `cuerpro_sesiones`). Se manda como `Authorization: Bearer <token>`.
- Tablas con prefijo `cuerpro_`, definidas en `server/schema.sql`; se crean solas al arrancar. Catálogo base en `server/ejercicios-base.js`.
- Nombres de campos en español, en servidor y app (no repetir el desajuste inglés/español de TimbreWeb).

## Reglas del dominio
- Roles por grupo: `coach` y `miembro`. Si el grupo tiene `quien_edita = 'todos'`, todos entran como coach.
- Alternativa elegida por cualquiera vale para todo el grupo en ese encuentro (`cuerpro_cambios_encuentro`).
- Asistencia: "voy/no voy" lo marca cada uno; `asistio` solo lo marca un coach y suma 10 puntos.
- Récord: superar tu propio peso máximo en un ejercicio (la primera vez no cuenta), 15 puntos, una vez por ejercicio por día.
- Niveles por mes (temporada `YYYY-MM`): Bronce 0, Plata 100, Oro 200, Platino 300, Diamante 380; nivel = máx(nivel por puntos del mes, nivel del mes anterior − 1). Nivel general, suma todos los grupos.
- Aviso de músculo abandonado: 5 días por defecto, configurable por grupo.
- Si decís "no voy", la API devuelve `objetivo`: cuántas asistencias te faltan para el próximo nivel y cuántos entrenamientos quedan en el mes.
- Encuentros: se generan del horario fijo (`cuerpro_horarios`) al pedir `encuentro_proximo`; el día del plan rota en orden. Hora en `TZ=America/Argentina/Cordoba`.

## Pruebas
- `cd server && CUERPRO_TEST_DB=1 DB_NAME=... npm test`: flujo completo contra MySQL (borra las tablas `cuerpro_*`).
- `npx tsc --noEmit` en la raíz para la app.
