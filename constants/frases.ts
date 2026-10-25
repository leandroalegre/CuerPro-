// Frases motivadoras: se muestra una distinta cada día
export const FRASES = [
  'El mejor entrenamiento es el que no te salteás.',
  'No hace falta ganas, hace falta constancia.',
  'Un día más es un día menos para tu objetivo.',
  'Hoy duele, mañana es fuerza.',
  'El grupo te espera: nadie entrena solo.',
  'Tu único rival es el de la semana pasada.',
  'Si fuera fácil, todos lo harían.',
  'Disciplina es elegir entre lo que querés ahora y lo que querés más.',
  'Las excusas no levantan peso.',
  'Poco a poco se llega lejos.',
  'Cuidá el cuerpo: es el único lugar que tenés para vivir.',
  'Lo que hacés hoy lo agradecés en un mes.',
];

export function fraseDelDia(fecha = new Date()) {
  const dia = Math.floor(fecha.getTime() / 86400000);
  return FRASES[dia % FRASES.length];
}
