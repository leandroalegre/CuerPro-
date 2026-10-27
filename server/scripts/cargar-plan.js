'use strict';

// Carga un plan escrito a mano (JSON con nombres de ejercicios) en el grupo de un coach.
// Los ejercicios que no están en el catálogo se crean para ese grupo.
//
//   node scripts/cargar-plan.js <email del coach> <archivo.json> ["nombre del grupo"]
//
// Formato del JSON:
//   { "nombre": "...", "dias": [ { "nombre": "...", "ejercicios": [
//       { "nombre": "...", "musculo": "...", "equipo": "maquina", "series": 4, "repeticiones": "12",
//         "carga": "pesado", "descanso_seg": 120, "nota": "..." } ] } ] }
// "musculo" y "equipo" solo hacen falta si el ejercicio no existe todavía.
const fs = require('fs');
const path = require('path');
const { pool, initTables, guardarPlan } = require('../index');

async function main() {
  const [email, archivo, nombreGrupo] = process.argv.slice(2);
  if (!email || !archivo) throw new Error('Uso: node scripts/cargar-plan.js <email> <archivo.json> ["grupo"]');
  const plan = JSON.parse(fs.readFileSync(path.resolve(archivo), 'utf8'));
  await initTables();

  const [[usuario]] = await pool.query('SELECT id, nombre FROM cuerpro_usuarios WHERE email = ?', [email.toLowerCase()]);
  if (!usuario) throw new Error(`No hay ninguna cuenta con el email ${email}`);
  const [grupos] = await pool.query(
    `SELECT g.id, g.nombre FROM cuerpro_grupos g JOIN cuerpro_miembros m ON m.grupo_id = g.id
     WHERE m.usuario_id = ? AND m.rol = 'coach'`,
    [usuario.id]
  );
  const elegidos = nombreGrupo ? grupos.filter(g => g.nombre === nombreGrupo) : grupos;
  if (elegidos.length !== 1) {
    throw new Error(`${usuario.nombre} es coach de: ${grupos.map(g => `"${g.nombre}"`).join(', ') || 'ningún grupo'}. ` +
                    'Indicá el nombre exacto del grupo.');
  }
  const grupo = elegidos[0];

  const creados = [];
  for (const dia of plan.dias) {
    for (const ej of dia.ejercicios) {
      const [[existe]] = await pool.query(
        `SELECT id FROM cuerpro_ejercicios WHERE nombre = ? AND (grupo_id IS NULL OR grupo_id = ?)
         ORDER BY grupo_id IS NULL LIMIT 1`,
        [ej.nombre, grupo.id]
      );
      if (existe) {
        ej.ejercicio_id = existe.id;
        continue;
      }
      if (!ej.musculo || !ej.equipo) throw new Error(`"${ej.nombre}" no está en el catálogo: falta musculo y equipo`);
      const [r] = await pool.query(
        'INSERT INTO cuerpro_ejercicios (grupo_id, nombre, musculo_principal, musculos_secundarios, equipo, movimiento) VALUES (?, ?, ?, ?, ?, ?)',
        [grupo.id, ej.nombre, ej.musculo, '', ej.equipo, '']
      );
      ej.ejercicio_id = r.insertId;
      creados.push(ej.nombre);
    }
  }

  const planId = await guardarPlan(grupo.id, plan, { activar: true });
  console.log(`✅ Plan "${plan.nombre}" cargado en "${grupo.nombre}" (plan ${planId}).`);
  if (creados.length) console.log(`Ejercicios nuevos para el grupo: ${creados.join(', ')}`);
}

main()
  .catch(e => { console.error(`❌ ${e.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
