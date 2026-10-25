'use strict';

// Prueba de punta a punta contra una base MySQL de prueba (¡se borran las tablas!).
// DB_NAME=cuerpro_test DB_USER=... DB_PASS=... npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const enabled = !!process.env.DB_NAME && process.env.CUERPRO_TEST_DB === '1';

let server, base, pool;

async function api(action, params = {}, token) {
  const res = await fetch(`${base}/api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

before(async () => {
  if (!enabled) return;
  const mod = require('../index');
  pool = mod.pool;
  const [tablas] = await pool.query("SHOW TABLES LIKE 'cuerpro_%'");
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tablas) await pool.query(`DROP TABLE \`${Object.values(t)[0]}\``);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await mod.initTables();
  await new Promise(resolve => { server = mod.app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  server.close();
  await pool.end();
});

test('flujo completo de un grupo', { skip: !enabled && 'Definí CUERPRO_TEST_DB=1 y DB_NAME' }, async () => {
  assert.equal((await api('ping')).ok, true);

  const coach = await api('registro', { nombre: 'Leandro', email: 'lea@test.ar', password: 'secreto1' });
  assert.equal(coach.ok, true, coach.error);
  const amigo = await api('registro', { nombre: 'Juan', email: 'juan@test.ar', password: 'secreto2' });
  assert.equal(amigo.ok, true, amigo.error);

  assert.equal((await api('login', { email: 'lea@test.ar', password: 'mal' })).ok, false);
  assert.equal((await api('login', { email: 'LEA@test.ar', password: 'secreto1' })).ok, true);
  assert.equal((await api('yo', {}, 'token-falso')).ok, false);

  const grupo = await api('grupo_crear', { nombre: 'Los del gym', gym: 'Gym Centro' }, coach.token);
  assert.equal(grupo.ok, true, grupo.error);
  const grupoId = grupo.grupo.id;
  assert.match(grupo.grupo.codigo_invitacion, /^[A-Z2-9]{6}$/);

  assert.equal((await api('grupo_unirse', { codigo: 'NOEXISTE' }, amigo.token)).ok, false);
  const union = await api('grupo_unirse', { codigo: grupo.grupo.codigo_invitacion.toLowerCase() }, amigo.token);
  assert.equal(union.ok, true, union.error);

  // Un miembro común no puede editar el plan
  assert.equal((await api('plan_guardar', { grupo_id: grupoId, plan: { dias: [{}] } }, amigo.token)).ok, false);

  const { ejercicios } = await api('ejercicios', { grupo_id: grupoId }, coach.token);
  assert.ok(ejercicios.length > 40);
  const id = nombre => ejercicios.find(e => e.nombre === nombre).id;

  const guardado = await api('plan_guardar', {
    grupo_id: grupoId,
    plan: {
      nombre: 'Plan octubre',
      dias: [
        { nombre: 'Pecho y tríceps', ejercicios: [
          { ejercicio_id: id('Press de banca plano'), series: 4, repeticiones: '8-10',
            alternativas: [id('Press de pecho en máquina'), id('Press de banca con mancuernas')] },
          { ejercicio_id: id('Extensión de tríceps en polea') },
        ] },
        { nombre: 'Pecho otra vez', ejercicios: [{ ejercicio_id: id('Pec deck') }] },
      ],
    },
  }, coach.token);
  assert.equal(guardado.ok, true, guardado.error);
  assert.ok(guardado.avisos.some(a => a.startsWith('pecho')), 'avisa que pecho se repite en días seguidos');

  // Horario: hoy, dentro de una hora
  const en1h = new Date(Date.now() + 60 * 60 * 1000);
  const hora = `${String(en1h.getHours()).padStart(2, '0')}:${String(en1h.getMinutes()).padStart(2, '0')}`;
  assert.equal((await api('horarios_guardar', { grupo_id: grupoId, horarios: [{ dia_semana: en1h.getDay(), hora }] }, amigo.token)).ok, false);
  assert.equal((await api('horarios_guardar', { grupo_id: grupoId, horarios: [{ dia_semana: en1h.getDay(), hora }] }, coach.token)).ok, true);

  const prox = await api('encuentro_proximo', { grupo_id: grupoId }, amigo.token);
  assert.equal(prox.ok, true, prox.error);
  const enc = prox.encuentro;
  assert.equal(enc.dia.nombre, 'Pecho y tríceps');
  assert.equal(enc.rutina.length, 2);
  assert.equal(enc.rutina[0].alternativas.length, 2);
  assert.equal(enc.confirmaciones.length, 2);

  // Pedirlo dos veces devuelve el mismo encuentro
  assert.equal((await api('encuentro_proximo', { grupo_id: grupoId }, coach.token)).encuentro.id, enc.id);

  assert.equal((await api('confirmar', { encuentro_id: enc.id, va: 1 }, amigo.token)).ok, true);

  // Si no vas, te dice cuántas veces más tenés que ir para llegar a Plata (100 pts = 10 asistencias)
  const noVoy = await api('confirmar', { encuentro_id: enc.id, va: 0 }, coach.token);
  assert.equal(noVoy.objetivo.objetivo, 'Plata');
  assert.equal(noVoy.objetivo.necesitas, 10);
  assert.ok(noVoy.objetivo.texto.length > 0);
  assert.equal((await api('encuentro_proximo', { grupo_id: grupoId }, coach.token)).objetivo.necesitas, 10);
  assert.equal((await api('encuentro_proximo', { grupo_id: grupoId }, amigo.token)).objetivo, null);

  // Máquina ocupada: el amigo elige la alternativa y cambia para todos
  const peId = enc.rutina[0].plan_ejercicio_id;
  assert.equal((await api('alternativa_elegir', { encuentro_id: enc.id, plan_ejercicio_id: peId, ejercicio_id: id('Pec deck') }, amigo.token)).ok, false);
  assert.equal((await api('alternativa_elegir', { encuentro_id: enc.id, plan_ejercicio_id: peId, ejercicio_id: id('Press de pecho en máquina') }, amigo.token)).ok, true);
  const visto = await api('encuentro_proximo', { grupo_id: grupoId }, coach.token);
  assert.equal(visto.encuentro.rutina[0].cambio.nombre, 'Press de pecho en máquina');
  assert.equal(visto.encuentro.rutina[0].cambio.elegido_por, 'Juan');

  // Solo el coach marca asistencia, y suma 10 puntos una sola vez
  assert.equal((await api('asistencia', { encuentro_id: enc.id, usuario_id: amigo.usuario.id, asistio: 1 }, amigo.token)).ok, false);
  assert.equal((await api('asistencia', { encuentro_id: enc.id, usuario_id: amigo.usuario.id, asistio: 1 }, coach.token)).ok, true);
  assert.equal((await api('asistencia', { encuentro_id: enc.id, usuario_id: amigo.usuario.id, asistio: 1 }, coach.token)).ok, true);

  // Series: la primera vez no es récord, superar la marca sí
  const press = id('Press de pecho en máquina');
  assert.equal((await api('serie_guardar', { encuentro_id: enc.id, ejercicio_id: press, numero: 1, repeticiones: 10, peso: 40 }, amigo.token)).record, false);
  assert.equal((await api('serie_guardar', { encuentro_id: enc.id, ejercicio_id: press, numero: 2, repeticiones: 8, peso: 45 }, amigo.token)).record, true);

  const prog = await api('progreso', {}, amigo.token);
  assert.equal(prog.ok, true, prog.error);
  assert.equal(prog.nivel.puntos, 25);
  assert.equal(prog.nivel.nivel, 'Bronce');
  assert.equal(prog.nivel.siguiente.faltan, 75);
  assert.equal(prog.asistencia.fue, 1);
  assert.equal(prog.records[0].mejor_peso, '45.00');

  // El coach puede ver el progreso del amigo; un desconocido no
  assert.equal((await api('progreso', { usuario_id: amigo.usuario.id }, coach.token)).ok, true);
  const otro = await api('registro', { nombre: 'Otro', email: 'otro@test.ar', password: 'secreto3' });
  assert.equal((await api('progreso', { usuario_id: amigo.usuario.id }, otro.token)).ok, false);

  // Ranking apagado hasta que el coach lo activa
  assert.equal((await api('ranking', { grupo_id: grupoId }, amigo.token)).activo, false);
  await api('grupo_config', { grupo_id: grupoId, ranking_grupo: 1 }, coach.token);
  const rk = await api('ranking', { grupo_id: grupoId }, amigo.token);
  assert.equal(rk.ranking[0].nombre, 'Juan');
  assert.equal(rk.ranking[0].puntos, 25);

  // Propuestas
  const prop = await api('propuesta_crear', { grupo_id: grupoId, texto: 'Sumemos sentadilla' }, amigo.token);
  assert.equal(prop.ok, true, prop.error);
  assert.equal((await api('propuesta_resolver', { propuesta_id: prop.id, estado: 'aceptada' }, amigo.token)).ok, false);
  assert.equal((await api('propuesta_resolver', { propuesta_id: prop.id, estado: 'aceptada' }, coach.token)).ok, true);
  assert.equal((await api('propuestas', { grupo_id: grupoId }, amigo.token)).propuestas[0].estado, 'aceptada');

  const yo = await api('yo', {}, amigo.token);
  assert.equal(yo.grupos[0].rol, 'miembro');
  assert.equal(yo.nivel.por_grupo[0].grupo_id, grupoId);
});
