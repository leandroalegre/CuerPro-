// Frases motivadoras: cada vez que entrás a Hoy sale una distinta (nunca la misma dos veces seguidas)
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
  'No pares cuando estés cansado, pará cuando termines.',
  'Una serie más. Siempre se puede una serie más.',
  'El cuerpo logra lo que la cabeza cree.',
  'Entrenar no es castigo, es un regalo para tu cuerpo.',
  'Ir cuando no tenés ganas es lo que marca la diferencia.',
  'Los resultados llegan cuando nadie te está mirando.',
  'Mejor un entrenamiento corto que ninguno.',
  'Hoy sumás, aunque sea poco.',
  'La constancia le gana al talento.',
  'Nadie se arrepiente de haber entrenado.',
  'El cansancio se va, el orgullo se queda.',
  'Cada repetición cuenta.',
  'Hacelo por vos, no por el espejo.',
  'Empezar es la mitad del camino.',
  'Más fuerte que ayer, eso alcanza.',
  'El sudor de hoy es la energía de mañana.',
  'Tu yo del mes que viene te lo va a agradecer.',
  'No esperes motivación: creá el hábito.',
  'Respirá, concentrate y dale.',
  'Juntos se entrena mejor.',
  'Descansar también es parte del plan.',
  'La técnica primero, el peso después.',
  'Paso a paso, kilo a kilo.',
  'Si hoy cuesta, mañana sale.',
  'El récord de hoy es el piso de mañana.',
  'Hacé lo que puedas, pero hacelo.',
  'Ganarle a la pereza ya es una victoria.',
  'Un buen día empieza con un buen entrenamiento.',
];

let ultima = -1;

// Una frase al azar, distinta de la anterior
export function fraseAlAzar() {
  let i = Math.floor(Math.random() * FRASES.length);
  if (i === ultima) i = (i + 1) % FRASES.length;
  ultima = i;
  return FRASES[i];
}

export function fraseDelDia(fecha = new Date()) {
  const dia = Math.floor(fecha.getTime() / 86400000);
  return FRASES[dia % FRASES.length];
}
