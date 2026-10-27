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
            carga: 'pesado', descanso_seg: 120, nota: 'Bajar en 3 segundos',
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
  assert.equal(enc.rutina[0].carga, 'pesado');
  assert.equal(enc.rutina[0].descanso_seg, 120);
  assert.equal(enc.rutina[0].nota, 'Bajar en 3 segundos');
  assert.equal(enc.rutina[1].carga, null);
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

test('horarios distintos por día, mover, cancelar y agregar encuentros', { skip: !enabled && 'Definí CUERPRO_TEST_DB=1 y DB_NAME' }, async () => {
  const coach = await api('registro', { nombre: 'Coach', email: 'coach2@test.ar', password: 'secreto1' });
  const amigo = await api('registro', { nombre: 'Amigo', email: 'amigo2@test.ar', password: 'secreto2' });
  const grupo = await api('grupo_crear', { nombre: 'Mañaneros' }, coach.token);
  const grupoId = grupo.grupo.id;
  await api('grupo_unirse', { codigo: grupo.grupo.codigo_invitacion }, amigo.token);

  const pad = n => String(n).padStart(2, '0');
  const sql = f => `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())} ${pad(f.getHours())}:${pad(f.getMinutes())}`;
  const enDias = (d, hh, mm) => { const f = new Date(); f.setDate(f.getDate() + d); f.setHours(hh, mm, 0, 0); return f; };

  // Mañana a las 08:00 y pasado mañana a las 20:30
  const manana = enDias(1, 8, 0);
  const pasado = enDias(2, 20, 30);
  const r = await api('horarios_guardar', {
    grupo_id: grupoId,
    horarios: [{ dia_semana: manana.getDay(), hora: '08:00' }, { dia_semana: pasado.getDay(), hora: '20:30' }],
  }, coach.token);
  assert.equal(r.ok, true, r.error);

  const prox = async () => (await api('encuentro_proximo', { grupo_id: grupoId }, amigo.token)).encuentro;
  const e1 = await prox();
  assert.equal(e1.fecha_hora, `${sql(manana)}:00`);

  // Solo el coach mueve; mañana pasa a las 10:15 y sigue siendo el próximo
  assert.equal((await api('encuentro_mover', { encuentro_id: e1.id, fecha_hora: sql(enDias(1, 10, 15)) }, amigo.token)).ok, false);
  const mov = await api('encuentro_mover', { encuentro_id: e1.id, fecha_hora: sql(enDias(1, 10, 15)) }, coach.token);
  assert.equal(mov.ok, true, mov.error);
  const e1b = await prox();
  assert.equal(e1b.id, e1.id);
  assert.equal(e1b.fecha_hora, `${sql(enDias(1, 10, 15))}:00`);
  assert.equal(e1b.fecha_original, `${sql(manana)}:00`);

  // Cancelado: el próximo es el de pasado mañana a las 20:30, y el horario fijo de mañana no vuelve
  assert.equal((await api('encuentro_cancelar', { encuentro_id: e1.id }, coach.token)).ok, true);
  const e2 = await prox();
  assert.equal(e2.fecha_hora, `${sql(pasado)}:00`);

  // Un extra antes de ese pasa a ser el próximo; no se puede duplicar
  const extra = await api('encuentro_agregar', { grupo_id: grupoId, fecha_hora: sql(enDias(1, 18, 0)) }, coach.token);
  assert.equal(extra.ok, true, extra.error);
  assert.equal((await prox()).id, extra.id);
  assert.equal((await api('encuentro_agregar', { grupo_id: grupoId, fecha_hora: sql(enDias(1, 18, 0)) }, coach.token)).ok, false);
  assert.equal((await api('encuentro_agregar', { grupo_id: grupoId, fecha_hora: '2020-01-01 10:00' }, coach.token)).ok, false);

  // Confirmar con una nota; volver a confirmar sin nota la conserva, con nota vacía la borra
  const ex = (await prox()).id;
  assert.equal((await api('confirmar', { encuentro_id: ex, va: 1, nota: 'Llego 15 tarde' }, amigo.token)).ok, true);
  const nota = async () => (await prox()).confirmaciones.find(c => c.usuario_id === amigo.usuario.id).nota;
  assert.equal(await nota(), 'Llego 15 tarde');
  await api('confirmar', { encuentro_id: ex, va: 1 }, amigo.token);
  assert.equal(await nota(), 'Llego 15 tarde');
  await api('confirmar', { encuentro_id: ex, va: 1, nota: '' }, amigo.token);
  assert.equal(await nota(), null);

  // Aviso por zona: defaults y lo que cambia el coach (lo inválido se ignora)
  let det = await api('grupo_detalle', { grupo_id: grupoId }, amigo.token);
  assert.equal(det.grupo.dias_por_zona.piernas, 7);
  assert.equal(det.grupo.dias_por_zona.abdominales, 4);
  assert.equal((await api('grupo_config', { grupo_id: grupoId, dias_por_zona: { piernas: 3, pecho: 99 } }, coach.token)).ok, true);
  det = await api('grupo_detalle', { grupo_id: grupoId }, amigo.token);
  assert.equal(det.grupo.dias_por_zona.piernas, 3);
  assert.equal(det.grupo.dias_por_zona.pecho, 7);

  // El coach crea un ejercicio propio del grupo
  const ej = await api('ejercicio_crear', { grupo_id: grupoId, nombre: 'Remo en TRX', musculo_principal: 'espalda', equipo: 'otro' }, coach.token);
  assert.equal(ej.ok, true, ej.error);
  const cat = await api('ejercicios', { grupo_id: grupoId }, amigo.token);
  assert.ok(cat.ejercicios.some(e => e.id === ej.id && e.grupo_id === grupoId));

  // El próximo encuentro se generó sin plan: al armarlo, toma su rutina
  assert.equal((await prox()).rutina.length, 0);
  const plan = nombreDia => ({ dias: [
    { nombre: nombreDia, ejercicios: [{ ejercicio_id: ej.id }] },
    { nombre: 'Día B', ejercicios: [{ ejercicio_id: ej.id }, { ejercicio_id: ej.id }] },
  ] });
  const g1 = await api('plan_guardar', { grupo_id: grupoId, plan: plan('Día A') }, coach.token);
  assert.equal(g1.ok, true);
  let p = await prox();
  assert.equal(p.dia.nombre, 'Día A');
  assert.equal(p.rutina.length, 1);
  // Si el coach vuelve a guardar el plan, sigue con el mismo día (del plan nuevo)
  const g2 = await api('plan_guardar', { grupo_id: grupoId, plan_id: g1.plan_id, plan: plan('Día A editado') }, coach.token);
  assert.equal(g2.ok, true);
  p = await prox();
  assert.equal(p.dia.nombre, 'Día A editado');
  // Si mueve los días de lugar, sigue tocando el mismo día
  const invertido = { dias: [...plan('Día A editado').dias].reverse() };
  const g3 = await api('plan_guardar', { grupo_id: grupoId, plan_id: g2.plan_id, plan: invertido }, coach.token);
  assert.equal(g3.ok, true);
  assert.equal((await prox()).dia.nombre, 'Día A editado');

  // Varios planes: uno nuevo no cambia el activo hasta que se elige
  const verano = await api('plan_guardar', { grupo_id: grupoId, plan: { nombre: 'Verano', dias: [{ nombre: 'Full body', ejercicios: [{ ejercicio_id: ej.id }] }] } }, coach.token);
  assert.equal(verano.ok, true);
  let planes = (await api('plan', { grupo_id: grupoId }, amigo.token)).planes;
  assert.deepEqual(planes.map(p => [p.nombre, p.activo]), [['Plan', 1], ['Verano', 0]]);
  assert.equal((await api('plan', { grupo_id: grupoId, plan_id: verano.plan_id }, amigo.token)).plan.nombre, 'Verano');
  assert.equal((await api('plan_activar', { grupo_id: grupoId, plan_id: verano.plan_id }, amigo.token)).ok, false);
  assert.equal((await api('plan_activar', { grupo_id: grupoId, plan_id: verano.plan_id }, coach.token)).ok, true);
  assert.equal((await api('plan', { grupo_id: grupoId }, amigo.token)).plan.nombre, 'Verano');
  assert.equal((await prox()).dia.nombre, 'Full body');
  // El activo no se borra; el otro sí
  assert.equal((await api('plan_borrar', { grupo_id: grupoId, plan_id: verano.plan_id }, coach.token)).ok, false);
  assert.equal((await api('plan_borrar', { grupo_id: grupoId, plan_id: g3.plan_id }, coach.token)).ok, true);
  planes = (await api('plan', { grupo_id: grupoId }, amigo.token)).planes;
  assert.deepEqual(planes.map(p => p.nombre), ['Verano']);

  // Superserie: queda marcada en el primero; el último del día no puede unirse a nada
  const ss = await api('plan_guardar', { grupo_id: grupoId, plan_id: verano.plan_id, plan: { nombre: 'Verano', vence: '2030-01-31', dias: [{ nombre: 'Full body', ejercicios: [
    { ejercicio_id: ej.id, union_siguiente: 'superserie' }, { ejercicio_id: ej.id, union_siguiente: 'circuito' },
  ] }] } }, coach.token);
  assert.equal(ss.ok, true, ss.error);
  const rut = (await api('plan', { grupo_id: grupoId }, amigo.token)).plan.dias[0].ejercicios;
  assert.equal((await api('plan', { grupo_id: grupoId }, amigo.token)).plan.vence, '2030-01-31');
  assert.deepEqual(rut.map(e => e.union_siguiente), ['superserie', null]);
});

test('superadmin, cambiar y recuperar contraseña', { skip: !enabled && 'Definí CUERPRO_TEST_DB=1 y DB_NAME' }, async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  // sendmail falso: guarda el email en un archivo
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuerpro-mail-'));
  const buzon = path.join(dir, 'buzon.txt');
  const sendmail = path.join(dir, 'sendmail');
  fs.writeFileSync(sendmail, `#!/bin/sh\ncat > "${buzon}"\n`, { mode: 0o755 });
  process.env.SENDMAIL_PATH = sendmail;

  const ana = await api('registro', { nombre: 'Ana', email: 'ana@test.ar', password: 'secreto1' });
  const jefe = await api('registro', { nombre: 'Jefe', email: 'jefe@test.ar', password: 'secreto1' });
  assert.equal((await api('yo', {}, jefe.token)).usuario.superadmin, false);
  assert.equal((await api('admin_resumen', {}, jefe.token)).ok, false);
  await pool.query("UPDATE cuerpro_usuarios SET superadmin = 1 WHERE email = 'jefe@test.ar'");
  assert.equal((await api('yo', {}, jefe.token)).usuario.superadmin, true);

  const resumen = await api('admin_resumen', {}, jefe.token);
  assert.equal(resumen.ok, true, resumen.error);
  assert.ok(resumen.usuarios.some(u => u.email === 'ana@test.ar'));
  assert.ok(resumen.grupos.length >= 1);
  assert.equal(resumen.usuarios[0].password_hash, undefined);

  // Blanquear: la clave vieja deja de andar, la sesión se cierra y entra con la temporal
  const anaId = resumen.usuarios.find(u => u.email === 'ana@test.ar').id;
  const blanqueo = await api('admin_blanquear', { usuario_id: anaId }, jefe.token);
  assert.match(blanqueo.password, /^[a-z2-9]{8}$/);
  assert.equal((await api('yo', {}, ana.token)).ok, false);
  assert.equal((await api('login', { email: 'ana@test.ar', password: 'secreto1' })).ok, false);
  const temporal = await api('login', { email: 'ana@test.ar', password: blanqueo.password });
  assert.equal(temporal.ok, true);
  assert.equal((await api('admin_blanquear', { usuario_id: anaId }, temporal.token)).ok, false);

  // Cambiar la propia contraseña
  assert.equal((await api('cambiar_password', { actual: 'mal', nueva: 'nueva123' }, temporal.token)).ok, false);
  assert.equal((await api('cambiar_password', { actual: blanqueo.password, nueva: 'nueva123' }, temporal.token)).ok, true);
  assert.equal((await api('login', { email: 'ana@test.ar', password: 'nueva123' })).ok, true);

  // Recuperar por email: no revela si la cuenta existe
  assert.equal((await api('recuperar_pedir', { email: 'nadie@test.ar' })).ok, true);
  assert.equal(fs.existsSync(buzon), false);
  assert.equal((await api('recuperar_pedir', { email: 'Ana@test.ar' })).ok, true);
  const mail = fs.readFileSync(buzon, 'utf8');
  assert.match(mail, /^To: ana@test\.ar$/m);
  const codigo = mail.match(/es: (\d{6})/)[1];
  assert.equal((await api('recuperar_pedir', { email: 'ana@test.ar' })).ok, false); // esperar un minuto
  const malo = codigo === '000000' ? '111111' : '000000';
  assert.equal((await api('recuperar_cambiar', { email: 'ana@test.ar', codigo: malo, nueva: 'otra1234' })).ok, false);
  const listo = await api('recuperar_cambiar', { email: 'ana@test.ar', codigo, nueva: 'otra1234' });
  assert.equal(listo.ok, true, listo.error);
  assert.equal((await api('yo', {}, listo.token)).usuario.email, 'ana@test.ar');
  assert.equal((await api('login', { email: 'ana@test.ar', password: 'otra1234' })).ok, true);
  // El código no se puede usar dos veces
  assert.equal((await api('recuperar_cambiar', { email: 'ana@test.ar', codigo, nueva: 'otra5678' })).ok, false);

  // Sin sendmail avisa que pidan el blanqueo
  process.env.SENDMAIL_PATH = path.join(dir, 'no-existe');
  await pool.query('DELETE FROM cuerpro_recuperaciones');
  const sinMail = await api('recuperar_pedir', { email: 'jefe@test.ar' });
  assert.equal(sinMail.ok, false);
  assert.match(sinMail.error, /administrador/);
  fs.rmSync(dir, { recursive: true });
});
