'use strict';

// Nombra superadmin a una cuenta: ve todos los usuarios y grupos y blanquea contraseñas.
//
//   node scripts/hacer-superadmin.js <email> [--quitar]
const { pool, initTables } = require('../index');

async function main() {
  const [email, opcion] = process.argv.slice(2);
  if (!email) throw new Error('Uso: node scripts/hacer-superadmin.js <email> [--quitar]');
  await initTables();
  const valor = opcion === '--quitar' ? 0 : 1;
  const [r] = await pool.query('UPDATE cuerpro_usuarios SET superadmin = ? WHERE email = ?', [valor, email.toLowerCase()]);
  if (!r.affectedRows) throw new Error(`No hay ninguna cuenta con el email ${email}`);
  console.log(valor ? `✅ ${email} ahora es superadmin.` : `✅ ${email} ya no es superadmin.`);
}

main()
  .catch(e => { console.error(`❌ ${e.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
