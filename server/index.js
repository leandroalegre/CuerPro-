'use strict';

const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const EJERCICIOS_BASE = require('./ejercicios-base');

const app  = express();
const PORT = process.env.PORT || 3031;

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── DB Pool ──────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:              process.env.DB_HOST || 'localhost',
  port:              Number(process.env.DB_PORT || 3306),
  user:              process.env.DB_USER || 'sistemacbahost_cuerpro_api',
  password:          process.env.DB_PASS || '',
  database:          process.env.DB_NAME || 'sistemacbahost_cuerpro',
  charset:           'utf8mb4',
  dateStrings:       true,
  waitForConnections: true,
  connectionLimit:   10,
});
// Fechas y "hoy" en hora de Córdoba (Argentina no tiene horario de verano)
pool.on('connection', conn => conn.query("SET time_zone = '-03:00'"));

// ─── Init tablas ──────────────────────────────────────────────────────────────
const CARGAS = ['liviano', 'moderado', 'pesado'];
const UNIONES = ['superserie', 'circuito'];

// Zonas para el aviso de músculo sin entrenar, con los días por defecto.
// El cardio no avisa: suele ser entrada en calor.
const ZONAS = {
  piernas:     { musculos: ['cuadriceps', 'isquios', 'gluteos', 'gemelos'], dias: 7 },
  espalda:     { musculos: ['espalda'], dias: 7 },
  pecho:       { musculos: ['pecho'], dias: 7 },
  hombros:     { musculos: ['hombros'], dias: 7 },
  brazos:      { musculos: ['biceps', 'triceps'], dias: 7 },
  abdominales: { musculos: ['abdominales'], dias: 4 },
};
const ZONA_DE = Object.fromEntries(
  Object.entries(ZONAS).flatMap(([zona, z]) => z.musculos.map(m => [m, zona]))
);

// Días por zona de un grupo: lo que guardó el coach y, si falta, el default
function diasPorZona(grupo) {
  let propios = {};
  try { propios = JSON.parse(grupo.dias_por_zona || '{}'); } catch {}
  return Object.fromEntries(Object.entries(ZONAS).map(([zona, z]) => [zona, Number(propios[zona]) || z.dias]));
}

const COLUMNAS_NUEVAS = [
  ['cuerpro_encuentros', 'fecha_original', 'DATETIME DEFAULT NULL AFTER dia_id'],
  ['cuerpro_encuentros', 'cancelado', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER fecha_original'],
  ['cuerpro_confirmaciones', 'nota', 'VARCHAR(140) DEFAULT NULL AFTER asistio'],
  ['cuerpro_plan_ejercicios', 'carga', "ENUM('liviano','moderado','pesado') DEFAULT NULL AFTER peso_sugerido"],
  ['cuerpro_plan_ejercicios', 'descanso_seg', 'INT DEFAULT NULL AFTER carga'],
  ['cuerpro_plan_ejercicios', 'nota', 'VARCHAR(200) DEFAULT NULL AFTER descanso_seg'],
  ['cuerpro_plan_ejercicios', 'union_siguiente', "ENUM('superserie','circuito') DEFAULT NULL AFTER nota"],
  // Antes cada guardado dejaba la versión anterior inactiva: esas pasan a archivadas
  ['cuerpro_planes', 'vence', 'DATE DEFAULT NULL AFTER archivado'],
  ['cuerpro_grupos', 'dias_por_zona', 'VARCHAR(255) DEFAULT NULL AFTER dias_aviso_musculo'],
  ['cuerpro_usuarios', 'superadmin', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash'],
  // Los "Mi entrenamiento" que creaba la bienvenida para entrenar solo pasan a ser el espacio Individual
  ['cuerpro_grupos', 'individual', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER quien_edita',
   `UPDATE cuerpro_grupos g SET g.individual = 1, g.nombre = 'Individual'
    WHERE g.nombre = 'Mi entrenamiento' AND (SELECT COUNT(*) FROM cuerpro_miembros m WHERE m.grupo_id = g.id) = 1`],
  ['cuerpro_planes', 'archivado', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER publicado',
   'UPDATE cuerpro_planes SET archivado = 1 WHERE activo = 0'],
];

async function initTables() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .map(line => line.replace(/\s--\s.*$/, '')) // comentarios al final de la línea (pueden tener ";")
    .join('\n');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

  const conn = await pool.getConnection();
  try {
    for (const statement of statements) await conn.query(statement);

    // Columnas agregadas después de crear las tablas en producción
    for (const [tabla, columna, definicion, alCrear] of COLUMNAS_NUEVAS) {
      const [existe] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tabla, columna]
      );
      if (existe.length) continue;
      await conn.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
      if (alCrear) await conn.query(alCrear);
    }

    // Catálogo precargado (solo la primera vez)
    const [[{ total }]] = await conn.query(
      'SELECT COUNT(*) AS total FROM cuerpro_ejercicios WHERE grupo_id IS NULL'
    );
    if (total === 0) {
      await conn.query(
        `INSERT INTO cuerpro_ejercicios
           (nombre, musculo_principal, musculos_secundarios, equipo, movimiento) VALUES ?`,
        [EJERCICIOS_BASE]
      );
    }

    // Limpiar sesiones vencidas
    await conn.query(
      'DELETE FROM cuerpro_sesiones WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [SESION_DIAS]
    );

    console.log('✅ Tablas OK');
  } finally {
    conn.release();
  }
}

// ─── Reglas del juego ─────────────────────────────────────────────────────────
const SESION_DIAS = 60;

const PUNTOS = {
  asistencia:      10,
  rutina_completa: 5,
  semana_completa: 20,
  record:          15,
  sin_avisos:      10,
};

// Niveles por temporada de 1 mes (puntos mínimos)
const NIVELES = [
  { nombre: 'Bronce',   desde: 0 },
  { nombre: 'Plata',    desde: 100 },
  { nombre: 'Oro',      desde: 200 },
  { nombre: 'Platino',  desde: 300 },
  { nombre: 'Diamante', desde: 380 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ok(res, data) {
  return res.json({ ok: true, ...data });
}
function err(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}
function getParam(req, key) {
  return req.body?.[key] ?? req.query?.[key];
}
function requireParams(req, ...keys) {
  const values = keys.map(k => getParam(req, k));
  const missing = keys.filter((k, i) => values[i] === undefined || values[i] === null || values[i] === '');
  if (missing.length) throw httpError(400, `Campos requeridos: ${missing.join(', ')}`);
  return values;
}
function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function checkPassword(password, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function nuevoCodigo() {
  // Sin 0/O ni 1/I para que se pueda dictar
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), b => letras[b % letras.length]).join('');
}

function temporadaActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}
function temporadaAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return temporadaActual(d);
}
function nivelPorPuntos(puntos) {
  let idx = 0;
  NIVELES.forEach((n, i) => { if (puntos >= n.desde) idx = i; });
  return idx;
}

async function sesion(req) {
  const auth  = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : getParam(req, 'token');
  if (!token) throw httpError(401, 'Sesión requerida');
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.email FROM cuerpro_sesiones s
     JOIN cuerpro_usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [token, SESION_DIAS]
  );
  if (!rows.length) throw httpError(401, 'Sesión vencida, volvé a entrar');
  return rows[0];
}

// Superadmin: ve todos los usuarios y grupos y blanquea contraseñas.
// Se nombra desde el servidor con scripts/hacer-superadmin.js
async function superadmin(req) {
  const usuario = await sesion(req);
  const [[fila]] = await pool.query('SELECT superadmin FROM cuerpro_usuarios WHERE id = ?', [usuario.id]);
  if (!fila?.superadmin) throw httpError(403, 'Solo el administrador puede ver esto');
  return usuario;
}

// Contraseña temporal fácil de dictar: 8 letras y números sin 0/O ni 1/I
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), b => letras[b % letras.length]).join('');
}

const hashCodigo = codigo => crypto.createHash('sha256').update(String(codigo)).digest('hex');

// Manda un email con el sendmail del hosting (o SENDMAIL_PATH)
function enviarMail(para, asunto, texto) {
  if (/[\r\n]/.test(para)) return Promise.reject(new Error('Email inválido'));
  const remitente = process.env.MAIL_FROM || 'CuerPro <no-reply@cuerpro.sistemascloud.ar>';
  const mensaje = [
    `From: ${remitente}`,
    `To: ${para}`,
    `Subject: =?UTF-8?B?${Buffer.from(asunto).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    texto,
  ].join('\n');
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.SENDMAIL_PATH || '/usr/sbin/sendmail', ['-t', '-i']);
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`sendmail salió con ${code}`))));
    p.stdin.end(mensaje);
  });
}

async function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO cuerpro_sesiones (token, usuario_id) VALUES (?, ?)', [token, usuarioId]);
  return token;
}

// Devuelve el grupo y el rol del usuario; falla si no es miembro
async function miembro(grupoId, usuarioId) {
  const [rows] = await pool.query(
    `SELECT g.*, m.rol FROM cuerpro_grupos g
     JOIN cuerpro_miembros m ON m.grupo_id = g.id
     WHERE g.id = ? AND m.usuario_id = ?`,
    [grupoId, usuarioId]
  );
  if (!rows.length) throw httpError(403, 'No sos miembro de este grupo');
  return rows[0];
}
async function coach(grupoId, usuarioId) {
  const grupo = await miembro(grupoId, usuarioId);
  if (grupo.rol !== 'coach') throw httpError(403, 'Solo un coach puede hacer esto');
  return grupo;
}
async function puedeEditarPlan(grupoId, usuarioId) {
  const grupo = await miembro(grupoId, usuarioId);
  if (grupo.rol !== 'coach' && grupo.quien_edita !== 'todos')
    throw httpError(403, 'Solo los coaches pueden editar el plan');
  return grupo;
}

// Cada usuario tiene un espacio Individual: un grupo donde está solo él, siempre como coach.
// Si no lo tiene (usuarios de antes), se crea acá.
async function espacioIndividual(usuarioId) {
  const [[ya]] = await pool.query(
    `SELECT g.id FROM cuerpro_grupos g JOIN cuerpro_miembros m ON m.grupo_id = g.id
     WHERE m.usuario_id = ? AND g.individual = 1 ORDER BY g.id LIMIT 1`,
    [usuarioId]
  );
  if (ya) return ya.id;
  const [r] = await pool.query(
    "INSERT INTO cuerpro_grupos (nombre, codigo_invitacion, individual) VALUES ('Individual', ?, 1)",
    [await codigoLibre()]
  );
  await pool.query("INSERT INTO cuerpro_miembros (grupo_id, usuario_id, rol) VALUES (?, ?, 'coach')", [r.insertId, usuarioId]);
  return r.insertId;
}

async function codigoLibre() {
  let codigo;
  for (let i = 0; i < 5; i++) {
    codigo = nuevoCodigo();
    const [ya] = await pool.query('SELECT id FROM cuerpro_grupos WHERE codigo_invitacion = ?', [codigo]);
    if (!ya.length) break;
  }
  return codigo;
}

async function sumarPuntos(usuarioId, grupoId, motivo, referencia) {
  // INSERT IGNORE + clave única: el mismo evento nunca suma dos veces
  await pool.query(
    `INSERT IGNORE INTO cuerpro_puntos (usuario_id, grupo_id, temporada, motivo, puntos, referencia)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [usuarioId, grupoId, temporadaActual(), motivo, PUNTOS[motivo], referencia]
  );
}
async function quitarPuntos(usuarioId, motivo, referencia) {
  await pool.query(
    'DELETE FROM cuerpro_puntos WHERE usuario_id = ? AND motivo = ? AND referencia = ?',
    [usuarioId, motivo, referencia]
  );
}

// Nivel general: suma todos los grupos. Al empezar el mes bajás un nivel, no volvés a Bronce.
async function nivelDe(usuarioId) {
  const [rows] = await pool.query(
    `SELECT temporada, grupo_id, SUM(puntos) AS puntos FROM cuerpro_puntos
     WHERE usuario_id = ? AND temporada IN (?, ?)
     GROUP BY temporada, grupo_id`,
    [usuarioId, temporadaActual(), temporadaAnterior()]
  );
  const actual   = rows.filter(r => r.temporada === temporadaActual());
  const anterior = rows.filter(r => r.temporada === temporadaAnterior());
  const puntos   = actual.reduce((s, r) => s + Number(r.puntos), 0);
  const puntosAnt = anterior.reduce((s, r) => s + Number(r.puntos), 0);
  const idx = Math.max(nivelPorPuntos(puntos), nivelPorPuntos(puntosAnt) - 1, 0);
  const siguiente = NIVELES[idx + 1];
  return {
    temporada: temporadaActual(),
    puntos,
    nivel: NIVELES[idx].nombre,
    siguiente: siguiente ? { nombre: siguiente.nombre, faltan: Math.max(siguiente.desde - puntos, 0) } : null,
    por_grupo: actual.map(r => ({ grupo_id: r.grupo_id, puntos: Number(r.puntos) })),
  };
}

const pad2 = n => String(n).padStart(2, '0');
const fechaSql = f =>
  `${f.getFullYear()}-${pad2(f.getMonth() + 1)}-${pad2(f.getDate())} ${pad2(f.getHours())}:${pad2(f.getMinutes())}:00`;

// Le toca el siguiente día del plan, en rotación según los encuentros anteriores
async function diaDelPlan(grupoId, fechaHora) {
  const [[plan]] = await pool.query(
    'SELECT id FROM cuerpro_planes WHERE grupo_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1',
    [grupoId]
  );
  if (!plan) return null;
  const [dias] = await pool.query('SELECT id FROM cuerpro_plan_dias WHERE plan_id = ? ORDER BY orden', [plan.id]);
  if (!dias.length) return null;
  const [[{ previos }]] = await pool.query(
    'SELECT COUNT(*) AS previos FROM cuerpro_encuentros WHERE grupo_id = ? AND fecha_hora < ? AND cancelado = 0',
    [grupoId, fechaHora]
  );
  return dias[previos % dias.length].id;
}

// Si el encuentro se generó antes de que hubiera plan, o el coach guardó el plan
// de nuevo (cada guardado crea uno nuevo), le asigna el día del plan activo:
// el del mismo nombre o lugar si existe, si no el que le toca en la rotación.
async function conDiaVigente(encuentro) {
  if (!encuentro) return encuentro;
  const [[actual]] = encuentro.dia_id
    ? await pool.query(
        `SELECT d.orden, d.nombre, p.activo FROM cuerpro_plan_dias d JOIN cuerpro_planes p ON p.id = d.plan_id WHERE d.id = ?`,
        [encuentro.dia_id]
      )
    : [[null]];
  if (actual && actual.activo) return encuentro;

  let diaId = null;
  if (actual) {
    // Primero el día con el mismo nombre (aunque el coach lo haya movido), si no el mismo lugar
    const [[mismo]] = await pool.query(
      `SELECT d.id FROM cuerpro_plan_dias d JOIN cuerpro_planes p ON p.id = d.plan_id
       WHERE p.grupo_id = ? AND p.activo = 1 AND (d.nombre = ? OR d.orden = ?)
       ORDER BY p.id DESC, d.nombre = ? DESC LIMIT 1`,
      [encuentro.grupo_id, actual.nombre, actual.orden, actual.nombre]
    );
    diaId = mismo?.id ?? null;
  }
  if (!diaId) diaId = await diaDelPlan(encuentro.grupo_id, encuentro.fecha_hora);
  if (!diaId) return encuentro;
  await pool.query('UPDATE cuerpro_encuentros SET dia_id = ? WHERE id = ?', [diaId, encuentro.id]);
  return { ...encuentro, dia_id: diaId };
}

// Próximo encuentro: el más cercano entre los horarios fijos del grupo y los
// encuentros que el coach movió o agregó. Un horario fijo que el coach movió
// o canceló se saltea. Si el próximo sale del horario fijo, se crea.
async function proximoEncuentro(grupoId) {
  const ahora = new Date();
  // Un encuentro sigue siendo "el próximo" hasta 2 horas después de empezar
  const desde = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
  const desdeSql = fechaSql(desde);

  const [[agendado]] = await pool.query(
    `SELECT * FROM cuerpro_encuentros
     WHERE grupo_id = ? AND fecha_hora >= ? AND cancelado = 0
     ORDER BY fecha_hora LIMIT 1`,
    [grupoId, desdeSql]
  );

  const [horarios] = await pool.query('SELECT dia_semana, hora FROM cuerpro_horarios WHERE grupo_id = ?', [grupoId]);
  const [salteados] = await pool.query(
    `SELECT fecha_original AS f FROM cuerpro_encuentros WHERE grupo_id = ? AND fecha_original >= ?
     UNION SELECT fecha_hora AS f FROM cuerpro_encuentros WHERE grupo_id = ? AND cancelado = 1 AND fecha_hora >= ?`,
    [grupoId, desdeSql, grupoId, desdeSql]
  );
  const saltear = new Set(salteados.map(r => String(r.f).slice(0, 19)));

  // Horario fijo más cercano que no se haya movido ni cancelado (mira 8 semanas)
  let fijo = null;
  for (let d = 0; d <= 56 && horarios.length; d++) {
    for (const h of horarios) {
      const [hh, mm] = String(h.hora).split(':').map(Number);
      const f = new Date(desde);
      f.setDate(f.getDate() + d);
      f.setHours(hh, mm, 0, 0);
      if (f.getDay() !== Number(h.dia_semana) || f < desde || saltear.has(fechaSql(f))) continue;
      if (!fijo || f < fijo) fijo = f;
    }
    if (fijo) break;
  }

  if (!fijo) return conDiaVigente(agendado || null);
  const fechaHora = fechaSql(fijo);
  if (agendado && String(agendado.fecha_hora) <= fechaHora) return conDiaVigente(agendado);

  await pool.query(
    'INSERT IGNORE INTO cuerpro_encuentros (grupo_id, fecha_hora, dia_id) VALUES (?, ?, ?)',
    [grupoId, fechaHora, await diaDelPlan(grupoId, fechaHora)]
  );
  const [[encuentro]] = await pool.query(
    'SELECT * FROM cuerpro_encuentros WHERE grupo_id = ? AND fecha_hora = ?',
    [grupoId, fechaHora]
  );
  return conDiaVigente(encuentro);
}

// "2026-10-28 19:30" → valida y devuelve "2026-10-28 19:30:00"
function fechaHoraParam(valor) {
  const m = String(valor).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) throw httpError(400, 'Fecha inválida, usá AAAA-MM-DD HH:MM');
  const fecha = `${m[1]} ${pad2(m[2])}:${m[3]}:00`;
  if (new Date(fecha.replace(' ', 'T')) < new Date()) throw httpError(400, 'Esa fecha ya pasó');
  return fecha;
}

const fechaLinda = fechaHora => {
  const f = new Date(String(fechaHora).replace(' ', 'T'));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${dias[f.getDay()]} ${f.getDate()}/${f.getMonth() + 1} a las ${pad2(f.getHours())}:${pad2(f.getMinutes())}`;
};

async function avisarAlGrupo(grupoId, menosUsuarioId, title, body, encuentroId) {
  const [miembros] = await pool.query(
    'SELECT usuario_id FROM cuerpro_miembros WHERE grupo_id = ? AND usuario_id <> ?',
    [grupoId, menosUsuarioId]
  );
  notificar(miembros.map(m => m.usuario_id), { title, body, data: { tipo: 'encuentro', encuentro_id: encuentroId } });
}

// Cuántos entrenamientos del grupo quedan en el mes después de `desde`
async function entrenamientosQuedanEnMes(grupoId, desde) {
  const [horarios] = await pool.query('SELECT dia_semana FROM cuerpro_horarios WHERE grupo_id = ?', [grupoId]);
  const dias = horarios.map(h => Number(h.dia_semana));
  const f = new Date(desde);
  const mes = f.getMonth();
  let total = 0;
  for (f.setDate(f.getDate() + 1); f.getMonth() === mes; f.setDate(f.getDate() + 1)) {
    total += dias.filter(d => d === f.getDay()).length;
  }
  return total;
}

// Si no vas: cuántas veces más tenés que ir este mes para llegar al próximo nivel
async function objetivoDelMes(usuarioId, grupoId, fechaHora) {
  const nivel = await nivelDe(usuarioId);
  const quedan = await entrenamientosQuedanEnMes(grupoId, fechaHora.replace(' ', 'T'));
  if (!nivel.siguiente) {
    return { nivel: nivel.nivel, objetivo: null, necesitas: 0, quedan,
      texto: `Ya sos ${nivel.nivel}. Quedan ${quedan} entrenamientos este mes para seguir sumando.` };
  }
  const necesitas = Math.ceil(nivel.siguiente.faltan / PUNTOS.asistencia);
  const llegas = necesitas <= quedan;
  const texto = llegas
    ? `Para llegar a ${nivel.siguiente.nombre} tenés que ir a ${necesitas} de los ${quedan} entrenamientos que quedan este mes.`
    : `Quedan ${quedan} entrenamientos este mes: con asistencia sola no llegás a ${nivel.siguiente.nombre}, ` +
      `pero cada récord personal suma ${PUNTOS.record} puntos más.`;
  return { nivel: nivel.nivel, objetivo: nivel.siguiente.nombre, necesitas, quedan, llegas, texto };
}

// Un grupo puede tener varios planes y uno activo, que es el que se entrena.
// Editar un plan guarda una versión nueva y archiva la anterior, así no se pierde
// el historial de series. Sin `reemplaza` es un plan nuevo; queda activo si se pide
// o si el grupo no tenía ninguno. También lo usa scripts/cargar-plan.js.
async function guardarPlan(grupoId, plan, { reemplaza = null, activar = false } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let activo = activar;
    if (reemplaza) {
      const [[viejo]] = await conn.query(
        'SELECT activo FROM cuerpro_planes WHERE id = ? AND grupo_id = ? AND archivado = 0',
        [reemplaza, grupoId]
      );
      if (!viejo) throw httpError(404, 'Ese plan ya no existe');
      activo = activo || !!viejo.activo;
      await conn.query('UPDATE cuerpro_planes SET archivado = 1, activo = 0 WHERE id = ?', [reemplaza]);
    } else if (!activo) {
      const [[hay]] = await conn.query('SELECT 1 AS si FROM cuerpro_planes WHERE grupo_id = ? AND activo = 1', [grupoId]);
      activo = !hay;
    }
    if (activo) await conn.query('UPDATE cuerpro_planes SET activo = 0 WHERE grupo_id = ?', [grupoId]);
    const [p] = await conn.query(
      'INSERT INTO cuerpro_planes (grupo_id, nombre, activo, vence) VALUES (?, ?, ?, ?)',
      [grupoId, plan.nombre || 'Plan', activo ? 1 : 0, /^\d{4}-\d{2}-\d{2}$/.test(plan.vence || '') ? plan.vence : null]
    );
    for (const [i, dia] of plan.dias.entries()) {
      const [d] = await conn.query(
        'INSERT INTO cuerpro_plan_dias (plan_id, orden, nombre) VALUES (?, ?, ?)',
        [p.insertId, i + 1, dia.nombre || `Día ${i + 1}`]
      );
      for (const [j, ej] of (dia.ejercicios || []).entries()) {
        const [pe] = await conn.query(
          `INSERT INTO cuerpro_plan_ejercicios
             (dia_id, ejercicio_id, orden, series, repeticiones, peso_sugerido, carga, descanso_seg, nota, union_siguiente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [d.insertId, ej.ejercicio_id, j + 1, ej.series || 3, String(ej.repeticiones || '10'), ej.peso_sugerido ?? null,
           CARGAS.includes(ej.carga) ? ej.carga : null, Number(ej.descanso_seg) || null,
           ej.nota ? String(ej.nota).trim().slice(0, 200) || null : null,
           // El último del día no tiene con quién unirse
           UNIONES.includes(ej.union_siguiente) && j + 1 < (dia.ejercicios || []).length ? ej.union_siguiente : null]
        );
        for (const [k, altId] of (ej.alternativas || []).entries()) {
          await conn.query(
            'INSERT IGNORE INTO cuerpro_alternativas (plan_ejercicio_id, ejercicio_id, orden) VALUES (?, ?, ?)',
            [pe.insertId, altId, k + 1]
          );
        }
      }
    }
    await conn.commit();
    return p.insertId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Ejercicios de un día del plan, con alternativas y los cambios elegidos en el encuentro
async function rutinaDelDia(diaId, encuentroId) {
  const [ejercicios] = await pool.query(
    `SELECT pe.id AS plan_ejercicio_id, pe.orden, pe.series, pe.repeticiones, pe.peso_sugerido,
            pe.carga, pe.descanso_seg, pe.nota, pe.union_siguiente,
            e.id AS ejercicio_id, e.nombre, e.musculo_principal, e.equipo
     FROM cuerpro_plan_ejercicios pe
     JOIN cuerpro_ejercicios e ON e.id = pe.ejercicio_id
     WHERE pe.dia_id = ? ORDER BY pe.orden`,
    [diaId]
  );
  if (!ejercicios.length) return [];
  const ids = ejercicios.map(e => e.plan_ejercicio_id);
  const [alternativas] = await pool.query(
    `SELECT a.plan_ejercicio_id, e.id AS ejercicio_id, e.nombre, e.equipo
     FROM cuerpro_alternativas a JOIN cuerpro_ejercicios e ON e.id = a.ejercicio_id
     WHERE a.plan_ejercicio_id IN (?) ORDER BY a.orden`,
    [ids]
  );
  let cambios = [];
  if (encuentroId) {
    [cambios] = await pool.query(
      `SELECT c.plan_ejercicio_id, e.id AS ejercicio_id, e.nombre, e.equipo, u.nombre AS elegido_por
       FROM cuerpro_cambios_encuentro c
       JOIN cuerpro_ejercicios e ON e.id = c.ejercicio_id
       JOIN cuerpro_usuarios u ON u.id = c.usuario_id
       WHERE c.encuentro_id = ?`,
      [encuentroId]
    );
  }
  return ejercicios.map(e => ({
    ...e,
    alternativas: alternativas.filter(a => a.plan_ejercicio_id === e.plan_ejercicio_id),
    cambio: cambios.find(c => c.plan_ejercicio_id === e.plan_ejercicio_id) || null,
  }));
}

function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

async function notificar(usuarioIds, message) {
  if (!usuarioIds.length) return;
  const [rows] = await pool.query(
    'SELECT token FROM cuerpro_push_tokens WHERE usuario_id IN (?)',
    [usuarioIds]
  );
  if (!rows.length) return;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const messages = rows.map(row => ({
    to: row.token,
    title: message.title,
    body: message.body,
    sound: 'default',
    data: message.data,
  }));
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      const json = await response.json();
      const tickets = Array.isArray(json.data) ? json.data : [];
      for (let j = 0; j < tickets.length; j++) {
        if (tickets[j]?.details?.error === 'DeviceNotRegistered') {
          await pool.query('DELETE FROM cuerpro_push_tokens WHERE token = ?', [chunk[j].to]);
        }
      }
    } catch (e) {
      console.error('Push error', e.message);
    }
  }
}

// ─── Acciones ─────────────────────────────────────────────────────────────────
const acciones = {

  // ── Ping ──
  async ping() {
    return { version: '0.1.0', timestamp: new Date().toISOString() };
  },

  // ── Cuenta ──
  async registro(req) {
    const [nombre, email, password] = requireParams(req, 'nombre', 'email', 'password');
    if (String(password).length < 6) throw httpError(400, 'La contraseña necesita al menos 6 caracteres');
    const mail = String(email).trim().toLowerCase();
    const [existe] = await pool.query('SELECT id FROM cuerpro_usuarios WHERE email = ?', [mail]);
    if (existe.length) throw httpError(409, 'Ya hay una cuenta con ese email');
    const [r] = await pool.query(
      'INSERT INTO cuerpro_usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
      [String(nombre).trim(), mail, hashPassword(String(password))]
    );
    await espacioIndividual(r.insertId);
    return { token: await crearSesion(r.insertId), usuario: { id: r.insertId, nombre, email: mail } };
  },

  async login(req) {
    const [email, password] = requireParams(req, 'email', 'password');
    const [rows] = await pool.query(
      'SELECT id, nombre, email, password_hash FROM cuerpro_usuarios WHERE email = ?',
      [String(email).trim().toLowerCase()]
    );
    if (!rows.length || !checkPassword(String(password), rows[0].password_hash))
      throw httpError(401, 'Email o contraseña incorrectos');
    const { password_hash, ...usuario } = rows[0];
    return { token: await crearSesion(usuario.id), usuario };
  },

  async logout(req) {
    const auth  = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : getParam(req, 'token');
    await pool.query('DELETE FROM cuerpro_sesiones WHERE token = ?', [token || '']);
    return {};
  },

  async cambiar_password(req) {
    const usuario = await sesion(req);
    const [actual, nueva] = requireParams(req, 'actual', 'nueva');
    if (String(nueva).length < 6) throw httpError(400, 'La contraseña necesita al menos 6 caracteres');
    const [[fila]] = await pool.query('SELECT password_hash FROM cuerpro_usuarios WHERE id = ?', [usuario.id]);
    if (!checkPassword(String(actual), fila.password_hash)) throw httpError(401, 'La contraseña actual no es correcta');
    await pool.query('UPDATE cuerpro_usuarios SET password_hash = ? WHERE id = ?', [hashPassword(String(nueva)), usuario.id]);
    return {};
  },

  // ── Recuperar contraseña: un código de 6 números por email, vale 30 minutos ──
  async recuperar_pedir(req) {
    const [email] = requireParams(req, 'email');
    const mail = String(email).trim().toLowerCase();
    const [[u]] = await pool.query('SELECT id, nombre, email FROM cuerpro_usuarios WHERE email = ?', [mail]);
    // Misma respuesta exista o no la cuenta, para no revelar quién está registrado
    if (!u) return {};
    const [[reciente]] = await pool.query(
      'SELECT 1 AS si FROM cuerpro_recuperaciones WHERE usuario_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)',
      [u.id]
    );
    if (reciente) throw httpError(429, 'Ya te mandamos un código, esperá un minuto para pedir otro');
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await pool.query('DELETE FROM cuerpro_recuperaciones WHERE usuario_id = ?', [u.id]);
    await pool.query(
      'INSERT INTO cuerpro_recuperaciones (usuario_id, codigo_hash, vence) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
      [u.id, hashCodigo(codigo)]
    );
    try {
      await enviarMail(u.email, `Tu código de CuerPro: ${codigo}`,
        `Hola ${u.nombre},\n\nTu código para cambiar la contraseña de CuerPro es: ${codigo}\n\n` +
        'Vale por 30 minutos. Si no lo pediste vos, ignorá este email.\n');
    } catch (e) {
      console.error('Mail error', e.message);
      await pool.query('DELETE FROM cuerpro_recuperaciones WHERE usuario_id = ?', [u.id]);
      throw httpError(503, 'No pudimos mandar el email. Pedile al administrador que te blanquee la contraseña.');
    }
    return {};
  },

  async recuperar_cambiar(req) {
    const [email, codigo, nueva] = requireParams(req, 'email', 'codigo', 'nueva');
    if (String(nueva).length < 6) throw httpError(400, 'La contraseña necesita al menos 6 caracteres');
    const [[r]] = await pool.query(
      `SELECT r.id, r.codigo_hash, r.intentos, u.id AS usuario_id FROM cuerpro_recuperaciones r
       JOIN cuerpro_usuarios u ON u.id = r.usuario_id
       WHERE u.email = ? AND r.vence > NOW()`,
      [String(email).trim().toLowerCase()]
    );
    if (!r || r.intentos >= 5) throw httpError(400, 'El código venció, pedí uno nuevo');
    if (r.codigo_hash !== hashCodigo(String(codigo).trim())) {
      await pool.query('UPDATE cuerpro_recuperaciones SET intentos = intentos + 1 WHERE id = ?', [r.id]);
      throw httpError(400, 'El código no es correcto');
    }
    await pool.query('UPDATE cuerpro_usuarios SET password_hash = ? WHERE id = ?', [hashPassword(String(nueva)), r.usuario_id]);
    await pool.query('DELETE FROM cuerpro_recuperaciones WHERE usuario_id = ?', [r.usuario_id]);
    await pool.query('DELETE FROM cuerpro_sesiones WHERE usuario_id = ?', [r.usuario_id]);
    return { token: await crearSesion(r.usuario_id) };
  },

  // ── Superadmin ──
  async admin_resumen(req) {
    await superadmin(req);
    const [usuarios] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.superadmin, DATE_FORMAT(u.created_at, '%Y-%m-%d') AS creado,
              (SELECT DATE_FORMAT(MAX(s.created_at), '%Y-%m-%d') FROM cuerpro_sesiones s WHERE s.usuario_id = u.id) AS ultima_entrada,
              (SELECT GROUP_CONCAT(g.nombre ORDER BY g.nombre SEPARATOR ', ') FROM cuerpro_miembros m
               JOIN cuerpro_grupos g ON g.id = m.grupo_id WHERE m.usuario_id = u.id AND g.individual = 0) AS grupos
       FROM cuerpro_usuarios u ORDER BY u.nombre`
    );
    const [grupos] = await pool.query(
      `SELECT g.id, g.nombre, g.gym, g.individual, DATE_FORMAT(g.created_at, '%Y-%m-%d') AS creado,
              (SELECT COUNT(*) FROM cuerpro_miembros m WHERE m.grupo_id = g.id) AS miembros,
              (SELECT GROUP_CONCAT(u.nombre ORDER BY u.nombre SEPARATOR ', ') FROM cuerpro_miembros m
               JOIN cuerpro_usuarios u ON u.id = m.usuario_id WHERE m.grupo_id = g.id AND m.rol = 'coach') AS coaches,
              (SELECT p.nombre FROM cuerpro_planes p WHERE p.grupo_id = g.id AND p.activo = 1 LIMIT 1) AS plan,
              (SELECT DATE_FORMAT(p.vence, '%Y-%m-%d') FROM cuerpro_planes p WHERE p.grupo_id = g.id AND p.activo = 1 LIMIT 1) AS vence
       FROM cuerpro_grupos g ORDER BY g.individual, g.nombre`
    );
    return { usuarios, grupos };
  },

  // Pone una contraseña temporal y cierra las sesiones abiertas de ese usuario
  async admin_blanquear(req) {
    await superadmin(req);
    const [usuarioId] = requireParams(req, 'usuario_id');
    const clave = claveTemporal();
    const [r] = await pool.query('UPDATE cuerpro_usuarios SET password_hash = ? WHERE id = ?', [hashPassword(clave), usuarioId]);
    if (!r.affectedRows) throw httpError(404, 'No existe ese usuario');
    await pool.query('DELETE FROM cuerpro_sesiones WHERE usuario_id = ?', [usuarioId]);
    return { password: clave };
  },

  async yo(req) {
    const usuario = await sesion(req);
    await espacioIndividual(usuario.id);
    const [filas] = await pool.query(
      // En un grupo donde todos editan, todos actúan como coach. El Individual va primero.
      `SELECT g.id, g.nombre, g.gym, g.codigo_invitacion, g.individual,
              IF(g.quien_edita = 'todos' OR g.individual = 1, 'coach', m.rol) AS rol FROM cuerpro_grupos g
       JOIN cuerpro_miembros m ON m.grupo_id = g.id WHERE m.usuario_id = ? ORDER BY g.individual DESC, g.nombre`,
      [usuario.id]
    );
    const grupos = filas.map(g => ({ ...g, individual: !!g.individual }));
    const [[{ superadmin: esAdmin }]] = await pool.query('SELECT superadmin FROM cuerpro_usuarios WHERE id = ?', [usuario.id]);
    return { usuario: { ...usuario, superadmin: !!esAdmin }, grupos, nivel: await nivelDe(usuario.id) };
  },

  // Para la tarjeta "Primeros pasos": qué ya hizo el usuario en el grupo elegido
  async primeros_pasos(req) {
    const usuario = await sesion(req);
    const grupoId = Number(getParam(req, 'grupo_id')) || null;
    const [[{ grupos }]] = await pool.query(`SELECT COUNT(*) AS grupos FROM cuerpro_miembros m JOIN cuerpro_grupos g ON g.id = m.grupo_id
       WHERE m.usuario_id = ? AND g.individual = 0`, [usuario.id]);
    const pasos = { grupos, miembros: 0, plan: false, horarios: false, confirmo: false, entreno: false };
    if (grupoId) {
      await miembro(grupoId, usuario.id);
      const [[g]] = await pool.query(
        `SELECT (SELECT COUNT(*) FROM cuerpro_miembros WHERE grupo_id = ?) AS miembros,
                EXISTS(SELECT 1 FROM cuerpro_planes WHERE grupo_id = ? AND activo = 1) AS plan,
                EXISTS(SELECT 1 FROM cuerpro_horarios WHERE grupo_id = ?) AS horarios,
                EXISTS(SELECT 1 FROM cuerpro_confirmaciones c JOIN cuerpro_encuentros e ON e.id = c.encuentro_id
                       WHERE e.grupo_id = ? AND c.usuario_id = ? AND c.va = 1) AS confirmo`,
        [grupoId, grupoId, grupoId, grupoId, usuario.id]
      );
      Object.assign(pasos, { miembros: g.miembros, plan: !!g.plan, horarios: !!g.horarios, confirmo: !!g.confirmo });
    }
    const [[serie]] = await pool.query('SELECT 1 AS si FROM cuerpro_series WHERE usuario_id = ? LIMIT 1', [usuario.id]);
    pasos.entreno = !!serie;
    return { pasos };
  },

  async push_token(req) {
    const usuario = await sesion(req);
    const [token] = requireParams(req, 'push_token');
    if (!isExpoPushToken(token)) throw httpError(400, 'Token de notificaciones inválido');
    await pool.query(
      `INSERT INTO cuerpro_push_tokens (usuario_id, token) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id)`,
      [usuario.id, token]
    );
    return {};
  },

  // ── Grupos ──
  async grupo_crear(req) {
    const usuario = await sesion(req);
    const [nombre] = requireParams(req, 'nombre');
    const gym = getParam(req, 'gym') || '';
    const quienEdita = getParam(req, 'quien_edita') === 'todos' ? 'todos' : 'algunos';
    const codigo = await codigoLibre();
    const [r] = await pool.query(
      'INSERT INTO cuerpro_grupos (nombre, gym, codigo_invitacion, quien_edita) VALUES (?, ?, ?, ?)',
      [nombre, gym, codigo, quienEdita]
    );
    await pool.query(
      "INSERT INTO cuerpro_miembros (grupo_id, usuario_id, rol) VALUES (?, ?, 'coach')",
      [r.insertId, usuario.id]
    );
    return { grupo: { id: r.insertId, nombre, gym, codigo_invitacion: codigo, rol: 'coach' } };
  },

  async grupo_unirse(req) {
    const usuario = await sesion(req);
    const [codigo] = requireParams(req, 'codigo');
    const [rows] = await pool.query(
      'SELECT id, nombre, gym, quien_edita FROM cuerpro_grupos WHERE codigo_invitacion = ? AND individual = 0',
      [String(codigo).trim().toUpperCase()]
    );
    if (!rows.length) throw httpError(404, 'No hay ningún grupo con ese código');
    const grupo = rows[0];
    const rol = grupo.quien_edita === 'todos' ? 'coach' : 'miembro';
    await pool.query(
      'INSERT IGNORE INTO cuerpro_miembros (grupo_id, usuario_id, rol) VALUES (?, ?, ?)',
      [grupo.id, usuario.id, rol]
    );
    return { grupo: { id: grupo.id, nombre: grupo.nombre, gym: grupo.gym } };
  },

  async grupo_detalle(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    const grupo = await miembro(grupoId, usuario.id);
    const [miembros] = await pool.query(
      `SELECT u.id, u.nombre, m.rol FROM cuerpro_miembros m
       JOIN cuerpro_usuarios u ON u.id = m.usuario_id WHERE m.grupo_id = ? ORDER BY u.nombre`,
      [grupoId]
    );
    const [horarios] = await pool.query(
      'SELECT id, dia_semana, TIME_FORMAT(hora, "%H:%i") AS hora FROM cuerpro_horarios WHERE grupo_id = ? ORDER BY dia_semana, hora',
      [grupoId]
    );
    return { grupo: { ...grupo, dias_por_zona: diasPorZona(grupo) }, miembros, horarios };
  },

  async grupo_config(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    await coach(grupoId, usuario.id);
    const campos = {};
    const quienEdita = getParam(req, 'quien_edita');
    if (quienEdita === 'todos' || quienEdita === 'algunos') campos.quien_edita = quienEdita;
    const nombre = getParam(req, 'nombre');
    if (nombre !== undefined) {
      if (!String(nombre).trim()) throw httpError(400, 'El grupo necesita un nombre');
      campos.nombre = String(nombre).trim().slice(0, 100);
    }
    const gym = getParam(req, 'gym');
    if (gym !== undefined) campos.gym = String(gym).trim().slice(0, 100);
    const porZona = getParam(req, 'dias_por_zona');
    if (porZona) {
      const datos = typeof porZona === 'string' ? JSON.parse(porZona) : porZona;
      const limpio = {};
      for (const zona of Object.keys(ZONAS)) {
        const n = Math.round(Number(datos[zona]));
        if (n >= 2 && n <= 30) limpio[zona] = n;
      }
      campos.dias_por_zona = JSON.stringify(limpio);
    }
    for (const k of ['ranking_grupo', 'ranking_global']) {
      const v = getParam(req, k);
      if (v !== undefined) campos[k] = v === true || v === '1' || v === 1 ? 1 : 0;
    }
    if (Object.keys(campos).length)
      await pool.query('UPDATE cuerpro_grupos SET ? WHERE id = ?', [campos, grupoId]);
    return {};
  },

  async miembro_rol(req) {
    const usuario = await sesion(req);
    const [grupoId, usuarioId, rol] = requireParams(req, 'grupo_id', 'usuario_id', 'rol');
    await coach(grupoId, usuario.id);
    if (rol !== 'coach' && rol !== 'miembro') throw httpError(400, 'Rol inválido');
    await pool.query(
      'UPDATE cuerpro_miembros SET rol = ? WHERE grupo_id = ? AND usuario_id = ?',
      [rol, grupoId, usuarioId]
    );
    return {};
  },

  // horarios: [{dia_semana: 1, hora: "19:00"}, ...] — reemplaza los anteriores
  async horarios_guardar(req) {
    const usuario = await sesion(req);
    const [grupoId, horarios] = requireParams(req, 'grupo_id', 'horarios');
    await coach(grupoId, usuario.id);
    const lista = typeof horarios === 'string' ? JSON.parse(horarios) : horarios;
    await pool.query('DELETE FROM cuerpro_horarios WHERE grupo_id = ?', [grupoId]);
    if (lista.length) {
      await pool.query(
        'INSERT INTO cuerpro_horarios (grupo_id, dia_semana, hora) VALUES ?',
        [lista.map(h => [grupoId, Number(h.dia_semana), h.hora])]
      );
    }
    return {};
  },

  // ── Ejercicios ──
  async ejercicios(req) {
    const usuario = await sesion(req);
    const grupoId = getParam(req, 'grupo_id');
    if (grupoId) await miembro(grupoId, usuario.id);
    const [rows] = await pool.query(
      `SELECT id, grupo_id, nombre, musculo_principal, musculos_secundarios, equipo, movimiento
       FROM cuerpro_ejercicios WHERE grupo_id IS NULL OR grupo_id = ?
       ORDER BY musculo_principal, nombre`,
      [grupoId || 0]
    );
    return { ejercicios: rows };
  },

  async ejercicio_crear(req) {
    const usuario = await sesion(req);
    const [grupoId, nombre, musculo, equipo] =
      requireParams(req, 'grupo_id', 'nombre', 'musculo_principal', 'equipo');
    await puedeEditarPlan(grupoId, usuario.id);
    const [r] = await pool.query(
      `INSERT INTO cuerpro_ejercicios (grupo_id, nombre, musculo_principal, musculos_secundarios, equipo, movimiento)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [grupoId, nombre, musculo, getParam(req, 'musculos_secundarios') || '', equipo, getParam(req, 'movimiento') || '']
    );
    return { id: r.insertId };
  },

  // ── Planes ──
  // Sin plan_id devuelve el activo. `planes` lista todos los del grupo.
  async plan(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    await miembro(grupoId, usuario.id);
    return planDelGrupo(grupoId, Number(getParam(req, 'plan_id')) || null);
  },

  // El superadmin ve el plan de cualquier grupo (solo lectura)
  async admin_plan(req) {
    await superadmin(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    return planDelGrupo(grupoId, Number(getParam(req, 'plan_id')) || null);
  },

  // plan: {nombre, dias: [{nombre, ejercicios: [{ejercicio_id, series, repeticiones, peso_sugerido,
  //        carga, descanso_seg, nota, alternativas: [ejercicio_id]}]}]}
  // Guarda una versión nueva y deja la anterior inactiva, así no se pierde el historial.
  async plan_guardar(req) {
    const usuario = await sesion(req);
    const [grupoId, planParam] = requireParams(req, 'grupo_id', 'plan');
    await puedeEditarPlan(grupoId, usuario.id);
    const plan = typeof planParam === 'string' ? JSON.parse(planParam) : planParam;
    if (!plan.dias?.length) throw httpError(400, 'El plan necesita al menos un día');

    const planId = await guardarPlan(grupoId, plan, {
      reemplaza: Number(getParam(req, 'plan_id')) || null,
      activar: ['1', 1, true].includes(getParam(req, 'activar')),
    });
    return { plan_id: planId, avisos: await avisosDelPlan(plan) };
  },

  // El grupo pasa a entrenar con este plan
  async plan_activar(req) {
    const usuario = await sesion(req);
    const [grupoId, planId] = requireParams(req, 'grupo_id', 'plan_id');
    await puedeEditarPlan(grupoId, usuario.id);
    const [[plan]] = await pool.query(
      'SELECT id, nombre FROM cuerpro_planes WHERE id = ? AND grupo_id = ? AND archivado = 0',
      [planId, grupoId]
    );
    if (!plan) throw httpError(404, 'Plan no encontrado');
    await pool.query('UPDATE cuerpro_planes SET activo = (id = ?) WHERE grupo_id = ?', [plan.id, grupoId]);
    return {};
  },

  // Borra un plan que no está en uso (queda archivado por el historial)
  async plan_borrar(req) {
    const usuario = await sesion(req);
    const [grupoId, planId] = requireParams(req, 'grupo_id', 'plan_id');
    await puedeEditarPlan(grupoId, usuario.id);
    const [r] = await pool.query(
      'UPDATE cuerpro_planes SET archivado = 1 WHERE id = ? AND grupo_id = ? AND activo = 0 AND archivado = 0',
      [planId, grupoId]
    );
    if (!r.affectedRows) throw httpError(400, 'Solo se puede borrar un plan que no esté activo');
    return {};
  },

  // ── Encuentros y asistencia ──
  async encuentro_proximo(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    const grupo = await miembro(grupoId, usuario.id);
    // El Individual no tiene horarios ni encuentros: se entrena cuando uno quiere
    if (grupo.individual) return { encuentro: null };
    const encuentro = await proximoEncuentro(grupoId);
    if (!encuentro) return { encuentro: null };
    const [confirmaciones] = await pool.query(
      `SELECT u.id AS usuario_id, u.nombre, c.va, c.asistio, c.nota
       FROM cuerpro_miembros m
       JOIN cuerpro_usuarios u ON u.id = m.usuario_id
       LEFT JOIN cuerpro_confirmaciones c ON c.usuario_id = u.id AND c.encuentro_id = ?
       WHERE m.grupo_id = ? ORDER BY u.nombre`,
      [encuentro.id, grupoId]
    );
    const [[dia]] = encuentro.dia_id
      ? await pool.query('SELECT id, nombre FROM cuerpro_plan_dias WHERE id = ?', [encuentro.dia_id])
      : [[null]];
    const rutina = dia ? await rutinaDelDia(dia.id, encuentro.id) : [];
    const mia = confirmaciones.find(c => c.usuario_id === usuario.id);
    const objetivo = mia?.va === 0 ? await objetivoDelMes(usuario.id, grupoId, encuentro.fecha_hora) : null;
    return { encuentro: { ...encuentro, dia, rutina, confirmaciones }, objetivo };
  },

  // El coach mueve un encuentro puntual; el horario fijo no cambia
  async encuentro_mover(req) {
    const usuario = await sesion(req);
    const [encuentroId, nueva] = requireParams(req, 'encuentro_id', 'fecha_hora');
    const [[encuentro]] = await pool.query('SELECT * FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
    if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
    await coach(encuentro.grupo_id, usuario.id);
    const fechaHora = fechaHoraParam(nueva);
    try {
      await pool.query(
        `UPDATE cuerpro_encuentros
         SET fecha_original = COALESCE(fecha_original, fecha_hora), fecha_hora = ?, cancelado = 0
         WHERE id = ?`,
        [fechaHora, encuentroId]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'Ya hay un entrenamiento en ese día y horario');
      throw e;
    }
    avisarAlGrupo(encuentro.grupo_id, usuario.id, 'Cambio de horario',
      `El entrenamiento del ${fechaLinda(encuentro.fecha_hora)} pasa al ${fechaLinda(fechaHora)}`, encuentro.id);
    return {};
  },

  async encuentro_cancelar(req) {
    const usuario = await sesion(req);
    const [encuentroId] = requireParams(req, 'encuentro_id');
    const [[encuentro]] = await pool.query('SELECT * FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
    if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
    await coach(encuentro.grupo_id, usuario.id);
    await pool.query('UPDATE cuerpro_encuentros SET cancelado = 1 WHERE id = ?', [encuentroId]);
    avisarAlGrupo(encuentro.grupo_id, usuario.id, 'Entrenamiento cancelado',
      `Se cancela el entrenamiento del ${fechaLinda(encuentro.fecha_hora)}`, encuentro.id);
    return {};
  },

  // Entrenamiento extra, fuera del horario fijo
  async encuentro_agregar(req) {
    const usuario = await sesion(req);
    const [grupoId, nueva] = requireParams(req, 'grupo_id', 'fecha_hora');
    await coach(grupoId, usuario.id);
    const fechaHora = fechaHoraParam(nueva);
    const [[existe]] = await pool.query(
      'SELECT id, cancelado FROM cuerpro_encuentros WHERE grupo_id = ? AND fecha_hora = ?',
      [grupoId, fechaHora]
    );
    if (existe && !existe.cancelado) throw httpError(409, 'Ya hay un entrenamiento en ese día y horario');
    let id = existe?.id;
    if (existe) {
      await pool.query('UPDATE cuerpro_encuentros SET cancelado = 0 WHERE id = ?', [id]);
    } else {
      const [r] = await pool.query(
        'INSERT INTO cuerpro_encuentros (grupo_id, fecha_hora, dia_id) VALUES (?, ?, ?)',
        [grupoId, fechaHora, await diaDelPlan(grupoId, fechaHora)]
      );
      id = r.insertId;
    }
    avisarAlGrupo(grupoId, usuario.id, 'Entrenamiento extra', `Nuevo entrenamiento el ${fechaLinda(fechaHora)}`, id);
    return { id };
  },

  // va: 1/0. nota (opcional): "llego 15 tarde"; si no viene, se mantiene la que había
  async confirmar(req) {
    const usuario = await sesion(req);
    const [encuentroId, va] = requireParams(req, 'encuentro_id', 'va');
    const [[encuentro]] = await pool.query('SELECT * FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
    if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
    await miembro(encuentro.grupo_id, usuario.id);
    const voy = va === true || va === '1' || va === 1 ? 1 : 0;
    const notaParam = getParam(req, 'nota');
    const nota = notaParam == null ? null : String(notaParam).trim().slice(0, 140);
    const [[antes]] = await pool.query(
      'SELECT va, nota FROM cuerpro_confirmaciones WHERE encuentro_id = ? AND usuario_id = ?',
      [encuentroId, usuario.id]
    );
    await pool.query(
      `INSERT INTO cuerpro_confirmaciones (encuentro_id, usuario_id, va, nota) VALUES (?, ?, ?, NULLIF(?, ''))
       ON DUPLICATE KEY UPDATE va = VALUES(va), nota = IF(?, VALUES(nota), nota)`,
      [encuentroId, usuario.id, voy, nota ?? '', notaParam != null]
    );

    // A los coaches les avisa si alguien no va, o si deja una nota nueva
    const notaNueva = nota && nota !== antes?.nota ? nota : null;
    const cambioANoVa = !voy && antes?.va !== 0;
    if (cambioANoVa || notaNueva) {
      const [coaches] = await pool.query(
        "SELECT usuario_id FROM cuerpro_miembros WHERE grupo_id = ? AND rol = 'coach' AND usuario_id <> ?",
        [encuentro.grupo_id, usuario.id]
      );
      notificar(coaches.map(c => c.usuario_id), {
        title: voy ? `${usuario.nombre} va` : 'Alguien no va',
        body: `${usuario.nombre} ${voy ? 'va' : 'no va'} al entrenamiento${notaNueva ? `: ${notaNueva}` : ''}`,
        data: { tipo: voy ? 'nota' : 'no_voy', encuentro_id: encuentro.id },
      });
    }
    if (!voy) return { objetivo: await objetivoDelMes(usuario.id, encuentro.grupo_id, encuentro.fecha_hora) };
    return { objetivo: null };
  },

  async asistencia(req) {
    const usuario = await sesion(req);
    const [encuentroId, usuarioId, asistio] = requireParams(req, 'encuentro_id', 'usuario_id', 'asistio');
    const [[encuentro]] = await pool.query('SELECT * FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
    if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
    await coach(encuentro.grupo_id, usuario.id);
    await miembro(encuentro.grupo_id, usuarioId);
    const vino = asistio === true || asistio === '1' || asistio === 1 ? 1 : 0;
    await pool.query(
      `INSERT INTO cuerpro_confirmaciones (encuentro_id, usuario_id, asistio) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE asistio = VALUES(asistio)`,
      [encuentroId, usuarioId, vino]
    );
    const ref = `encuentro:${encuentroId}`;
    if (vino) await sumarPuntos(usuarioId, encuentro.grupo_id, 'asistencia', ref);
    else await quitarPuntos(usuarioId, 'asistencia', ref);
    return {};
  },

  // Máquina ocupada: el cambio vale para todo el grupo en ese encuentro
  async alternativa_elegir(req) {
    const usuario = await sesion(req);
    const [encuentroId, planEjercicioId, ejercicioId] =
      requireParams(req, 'encuentro_id', 'plan_ejercicio_id', 'ejercicio_id');
    const [[encuentro]] = await pool.query('SELECT * FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
    if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
    await miembro(encuentro.grupo_id, usuario.id);
    const [valida] = await pool.query(
      'SELECT 1 FROM cuerpro_alternativas WHERE plan_ejercicio_id = ? AND ejercicio_id = ?',
      [planEjercicioId, ejercicioId]
    );
    const [original] = await pool.query(
      'SELECT 1 FROM cuerpro_plan_ejercicios WHERE id = ? AND ejercicio_id = ?',
      [planEjercicioId, ejercicioId]
    );
    if (original.length) {
      // Volver al ejercicio original
      await pool.query(
        'DELETE FROM cuerpro_cambios_encuentro WHERE encuentro_id = ? AND plan_ejercicio_id = ?',
        [encuentroId, planEjercicioId]
      );
      return {};
    }
    if (!valida.length) throw httpError(400, 'Esa alternativa no está cargada para este ejercicio');
    await pool.query(
      `INSERT INTO cuerpro_cambios_encuentro (encuentro_id, plan_ejercicio_id, ejercicio_id, usuario_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ejercicio_id = VALUES(ejercicio_id), usuario_id = VALUES(usuario_id)`,
      [encuentroId, planEjercicioId, ejercicioId, usuario.id]
    );
    return {};
  },

  // ── Registro de series y progreso ──
  async serie_guardar(req) {
    const usuario = await sesion(req);
    const [ejercicioId, numero, repeticiones] = requireParams(req, 'ejercicio_id', 'numero', 'repeticiones');
    const peso = Number(getParam(req, 'peso') || 0);
    const encuentroId = getParam(req, 'encuentro_id') || null;
    let grupoId = null;
    if (encuentroId) {
      const [[encuentro]] = await pool.query('SELECT grupo_id FROM cuerpro_encuentros WHERE id = ?', [encuentroId]);
      if (!encuentro) throw httpError(404, 'Encuentro no encontrado');
      await miembro(encuentro.grupo_id, usuario.id);
      grupoId = encuentro.grupo_id;
    }

    const [[mejor]] = await pool.query(
      'SELECT MAX(peso) AS peso, COUNT(*) AS veces FROM cuerpro_series WHERE usuario_id = ? AND ejercicio_id = ?',
      [usuario.id, ejercicioId]
    );
    const [r] = await pool.query(
      `INSERT INTO cuerpro_series (usuario_id, encuentro_id, ejercicio_id, numero, repeticiones, peso)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario.id, encuentroId, ejercicioId, numero, repeticiones, peso]
    );

    // Récord personal: más peso que tu mejor marca (la primera vez no cuenta)
    const record = mejor.veces > 0 && peso > Number(mejor.peso);
    if (record) {
      const hoy = new Date().toISOString().slice(0, 10);
      await sumarPuntos(usuario.id, grupoId, 'record', `record:${ejercicioId}:${hoy}`);
    }
    return { id: r.insertId, record };
  },

  // Tus últimos días entrenados (en cualquier grupo o solo) y qué día del plan activo
  // te conviene hacer: el que hace más tiempo que no hacés.
  async mis_entrenamientos(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    await miembro(grupoId, usuario.id);

    const [filas] = await pool.query(
      `SELECT d.id, d.nombre, d.orden, pe.ejercicio_id, a.ejercicio_id AS alternativa_id
       FROM cuerpro_planes p
       JOIN cuerpro_plan_dias d ON d.plan_id = p.id
       JOIN cuerpro_plan_ejercicios pe ON pe.dia_id = d.id
       LEFT JOIN cuerpro_alternativas a ON a.plan_ejercicio_id = pe.id
       WHERE p.grupo_id = ? AND p.activo = 1 ORDER BY d.orden`,
      [grupoId]
    );
    const dias = new Map();
    for (const f of filas) {
      if (!dias.has(f.id)) dias.set(f.id, { id: f.id, nombre: f.nombre, orden: f.orden, ejercicios: new Set() });
      dias.get(f.id).ejercicios.add(f.ejercicio_id);
      if (f.alternativa_id) dias.get(f.id).ejercicios.add(f.alternativa_id);
    }

    const [series] = await pool.query(
      `SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS fecha, s.ejercicio_id, e.musculo_principal AS musculo
       FROM cuerpro_series s JOIN cuerpro_ejercicios e ON e.id = s.ejercicio_id
       WHERE s.usuario_id = ? AND s.created_at >= NOW() - INTERVAL 60 DAY
       ORDER BY s.created_at DESC`,
      [usuario.id]
    );
    const porFecha = new Map();
    for (const s of series) {
      if (!porFecha.has(s.fecha)) porFecha.set(s.fecha, { fecha: s.fecha, ejercicios: new Set(), musculos: new Set() });
      porFecha.get(s.fecha).ejercicios.add(s.ejercicio_id);
      porFecha.get(s.fecha).musculos.add(s.musculo);
    }

    // A cada fecha le corresponde el día del plan que más ejercicios comparte
    const ultimaVez = new Map();
    const entrenamientos = [...porFecha.values()].map(f => {
      let mejor = null;
      let comunes = 0;
      for (const d of dias.values()) {
        const n = [...f.ejercicios].filter(id => d.ejercicios.has(id)).length;
        if (n > comunes) { mejor = d; comunes = n; }
      }
      if (mejor && !ultimaVez.has(mejor.id)) ultimaVez.set(mejor.id, f.fecha);
      return { fecha: f.fecha, dia_id: mejor?.id ?? null, dia_nombre: mejor?.nombre ?? null, musculos: [...f.musculos] };
    });

    // Recomienda el que nunca hiciste o el que hiciste hace más tiempo; empata el orden del plan
    const candidatos = [...dias.values()].sort((a, b) =>
      (ultimaVez.get(a.id) ?? '').localeCompare(ultimaVez.get(b.id) ?? '') || a.orden - b.orden);
    const rec = candidatos[0];
    const hace = rec && ultimaVez.has(rec.id)
      ? Math.round((Date.now() - new Date(`${ultimaVez.get(rec.id)}T12:00:00`).getTime()) / 86400000)
      : null;
    return {
      entrenamientos: entrenamientos.slice(0, 5),
      recomendado: rec
        ? { dia_id: rec.id, nombre: rec.nombre, texto: hace === null ? 'Todavía no lo hiciste' : hace <= 0 ? 'Lo hiciste hoy' : `Lo hiciste hace ${hace} ${hace === 1 ? 'día' : 'días'}` }
        : null,
    };
  },

  async progreso(req) {
    const usuario = await sesion(req);
    const usuarioId = getParam(req, 'usuario_id') || usuario.id;
    if (String(usuarioId) !== String(usuario.id)) {
      // Se puede ver el progreso de alguien con quien compartís grupo
      const [comparten] = await pool.query(
        `SELECT 1 FROM cuerpro_miembros a JOIN cuerpro_miembros b ON a.grupo_id = b.grupo_id
         WHERE a.usuario_id = ? AND b.usuario_id = ? LIMIT 1`,
        [usuario.id, usuarioId]
      );
      if (!comparten.length) throw httpError(403, 'Solo podés ver el progreso de tus compañeros de grupo');
    }

    const [musculos] = await pool.query(
      `SELECT e.musculo_principal AS musculo, MAX(s.created_at) AS ultima_vez,
              DATEDIFF(NOW(), MAX(s.created_at)) AS dias
       FROM cuerpro_series s JOIN cuerpro_ejercicios e ON e.id = s.ejercicio_id
       WHERE s.usuario_id = ? GROUP BY e.musculo_principal ORDER BY dias DESC`,
      [usuarioId]
    );
    // Si estás en varios grupos, vale el aviso más corto de cada zona
    const [grupos] = await pool.query(
      `SELECT g.dias_por_zona FROM cuerpro_grupos g
       JOIN cuerpro_miembros m ON m.grupo_id = g.id WHERE m.usuario_id = ?`,
      [usuarioId]
    );
    const limites = {};
    for (const g of grupos.length ? grupos : [{}]) {
      for (const [zona, dias] of Object.entries(diasPorZona(g))) limites[zona] = Math.min(limites[zona] ?? dias, dias);
    }
    // Por zona cuenta el músculo trabajado más recientemente
    const porZona = {};
    for (const m of musculos) {
      const zona = ZONA_DE[m.musculo];
      if (zona && (porZona[zona] === undefined || m.dias < porZona[zona])) porZona[zona] = m.dias;
    }
    const avisos = Object.entries(porZona)
      .filter(([zona, dias]) => dias >= limites[zona])
      .sort((a, b) => b[1] - a[1])
      .map(([zona, dias]) => ({ musculo: zona, dias, texto: `Hace ${dias} días que no hacés ${zona}` }));

    const [records] = await pool.query(
      `SELECT e.id AS ejercicio_id, e.nombre, MAX(s.peso) AS mejor_peso, COUNT(*) AS series
       FROM cuerpro_series s JOIN cuerpro_ejercicios e ON e.id = s.ejercicio_id
       WHERE s.usuario_id = ? GROUP BY e.id, e.nombre ORDER BY e.nombre`,
      [usuarioId]
    );
    const [[asist]] = await pool.query(
      `SELECT SUM(asistio = 1) AS fue, SUM(asistio = 0) AS falto
       FROM cuerpro_confirmaciones WHERE usuario_id = ?`,
      [usuarioId]
    );
    return {
      nivel: await nivelDe(usuarioId),
      musculos,
      avisos,
      records,
      asistencia: { fue: Number(asist.fue || 0), falto: Number(asist.falto || 0) },
    };
  },

  async ranking(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    const grupo = await miembro(grupoId, usuario.id);
    if (!grupo.ranking_grupo) return { activo: false, ranking: [] };
    const [rows] = await pool.query(
      `SELECT u.id AS usuario_id, u.nombre, COALESCE(SUM(p.puntos), 0) AS puntos
       FROM cuerpro_miembros m
       JOIN cuerpro_usuarios u ON u.id = m.usuario_id
       LEFT JOIN cuerpro_puntos p ON p.usuario_id = u.id AND p.temporada = ?
       WHERE m.grupo_id = ? GROUP BY u.id, u.nombre ORDER BY puntos DESC`,
      [temporadaActual(), grupoId]
    );
    return {
      activo: true,
      ranking: rows.map(r => ({ ...r, puntos: Number(r.puntos), nivel: NIVELES[nivelPorPuntos(Number(r.puntos))].nombre })),
    };
  },

  // ── Propuestas al coach ──
  async propuesta_crear(req) {
    const usuario = await sesion(req);
    const [grupoId, texto] = requireParams(req, 'grupo_id', 'texto');
    await miembro(grupoId, usuario.id);
    const [[plan]] = await pool.query(
      'SELECT id FROM cuerpro_planes WHERE grupo_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1',
      [grupoId]
    );
    if (!plan) throw httpError(400, 'El grupo todavía no tiene plan');
    const [r] = await pool.query(
      'INSERT INTO cuerpro_propuestas (plan_id, usuario_id, texto) VALUES (?, ?, ?)',
      [plan.id, usuario.id, texto]
    );
    const [coaches] = await pool.query(
      "SELECT usuario_id FROM cuerpro_miembros WHERE grupo_id = ? AND rol = 'coach' AND usuario_id <> ?",
      [grupoId, usuario.id]
    );
    notificar(coaches.map(c => c.usuario_id), {
      title: 'Nueva propuesta para el plan',
      body: `${usuario.nombre}: ${String(texto).slice(0, 80)}`,
      data: { tipo: 'propuesta', propuesta_id: r.insertId },
    });
    return { id: r.insertId };
  },

  async propuestas(req) {
    const usuario = await sesion(req);
    const [grupoId] = requireParams(req, 'grupo_id');
    await miembro(grupoId, usuario.id);
    const [rows] = await pool.query(
      `SELECT pr.id, pr.texto, pr.estado, pr.created_at, u.nombre AS autor
       FROM cuerpro_propuestas pr
       JOIN cuerpro_planes p ON p.id = pr.plan_id
       JOIN cuerpro_usuarios u ON u.id = pr.usuario_id
       WHERE p.grupo_id = ? ORDER BY pr.estado = 'pendiente' DESC, pr.created_at DESC`,
      [grupoId]
    );
    return { propuestas: rows };
  },

  async propuesta_resolver(req) {
    const usuario = await sesion(req);
    const [propuestaId, estado] = requireParams(req, 'propuesta_id', 'estado');
    if (estado !== 'aceptada' && estado !== 'rechazada') throw httpError(400, 'Estado inválido');
    const [[pr]] = await pool.query(
      `SELECT pr.usuario_id, p.grupo_id FROM cuerpro_propuestas pr
       JOIN cuerpro_planes p ON p.id = pr.plan_id WHERE pr.id = ?`,
      [propuestaId]
    );
    if (!pr) throw httpError(404, 'Propuesta no encontrada');
    await coach(pr.grupo_id, usuario.id);
    await pool.query('UPDATE cuerpro_propuestas SET estado = ? WHERE id = ?', [estado, propuestaId]);
    notificar([pr.usuario_id], {
      title: estado === 'aceptada' ? 'Aceptaron tu propuesta' : 'Rechazaron tu propuesta',
      body: `${usuario.nombre} revisó tu propuesta para el plan`,
      data: { tipo: 'propuesta', propuesta_id: Number(propuestaId) },
    });
    return {};
  },
};

// Los planes del grupo y el elegido (o el activo) con sus días y ejercicios
async function planDelGrupo(grupoId, planId) {
  const [planes] = await pool.query(
    `SELECT id, nombre, activo, DATE_FORMAT(vence, '%Y-%m-%d') AS vence
     FROM cuerpro_planes WHERE grupo_id = ? AND archivado = 0 ORDER BY activo DESC, nombre`,
    [grupoId]
  );
  // Si el que pidió ya no está (lo borraron o lo editaron), muestra el activo
  const plan = planes.find(p => p.id === planId) || planes.find(p => p.activo);
  if (!plan) return { plan: null, planes };
  const [dias] = await pool.query(
    'SELECT id, orden, nombre FROM cuerpro_plan_dias WHERE plan_id = ? ORDER BY orden',
    [plan.id]
  );
  for (const dia of dias) dia.ejercicios = await rutinaDelDia(dia.id, null);
  return { plan: { ...plan, dias }, planes };
}

// Avisa al que arma el plan si un músculo se repite en dos días seguidos
async function avisosDelPlan(plan) {
  const ids = plan.dias.flatMap(d => (d.ejercicios || []).map(e => e.ejercicio_id));
  if (!ids.length) return [];
  const [rows] = await pool.query(
    'SELECT id, musculo_principal FROM cuerpro_ejercicios WHERE id IN (?)',
    [ids]
  );
  const musculo = Object.fromEntries(rows.map(r => [r.id, r.musculo_principal]));
  const porDia = plan.dias.map(d => new Set((d.ejercicios || []).map(e => musculo[e.ejercicio_id])));
  const avisos = [];
  for (let i = 0; i + 1 < porDia.length; i++) {
    for (const m of porDia[i]) {
      if (porDia[i + 1].has(m)) avisos.push(`${m} está en el día ${i + 1} y en el día ${i + 2}`);
    }
  }
  return avisos;
}

// ─── Handler principal (action-based) ────────────────────────────────────────
app.all('/api', async (req, res) => {
  const action = getParam(req, 'action');
  const accion = Object.prototype.hasOwnProperty.call(acciones, action) ? acciones[action] : null;
  if (!accion) return err(res, `Acción desconocida: ${action}`, 404);

  try {
    return ok(res, await accion(req));
  } catch (e) {
    if (e.statusCode) return err(res, e.message, e.statusCode);
    console.error('Error en acción', action, e);
    return err(res, 'Error interno', 500);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  initTables()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`💪 CuerPro API corriendo en puerto ${PORT}`);
      });
    })
    .catch(e => {
      console.error('Error iniciando:', e.message);
      process.exit(1);
    });
}

module.exports = { app, pool, initTables, guardarPlan };
