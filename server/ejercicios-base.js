'use strict';

// Catálogo precargado. Cada grupo puede copiarlo, modificarlo o crear los suyos.
// [nombre, musculo_principal, musculos_secundarios, equipo, movimiento]
module.exports = [
  // Pecho
  ['Press de banca plano',          'pecho',    'triceps,hombros', 'barra',         'empuje_horizontal'],
  ['Press de banca con mancuernas', 'pecho',    'triceps,hombros', 'mancuerna',     'empuje_horizontal'],
  ['Press de pecho en máquina',     'pecho',    'triceps,hombros', 'maquina',       'empuje_horizontal'],
  ['Press inclinado con barra',     'pecho',    'hombros,triceps', 'barra',         'empuje_inclinado'],
  ['Press inclinado con mancuernas','pecho',    'hombros,triceps', 'mancuerna',     'empuje_inclinado'],
  ['Aperturas con mancuernas',      'pecho',    'hombros',         'mancuerna',     'apertura'],
  ['Pec deck',                      'pecho',    'hombros',         'maquina',       'apertura'],
  ['Cruce de poleas',               'pecho',    'hombros',         'polea',         'apertura'],
  ['Flexiones de brazos',           'pecho',    'triceps,hombros', 'peso_corporal', 'empuje_horizontal'],
  // Espalda
  ['Dominadas',                     'espalda',  'biceps',          'peso_corporal', 'tiron_vertical'],
  ['Jalón al pecho',                'espalda',  'biceps',          'polea',         'tiron_vertical'],
  ['Jalón en máquina',              'espalda',  'biceps',          'maquina',       'tiron_vertical'],
  ['Remo con barra',                'espalda',  'biceps',          'barra',         'tiron_horizontal'],
  ['Remo con mancuerna',            'espalda',  'biceps',          'mancuerna',     'tiron_horizontal'],
  ['Remo sentado en polea',         'espalda',  'biceps',          'polea',         'tiron_horizontal'],
  ['Remo en máquina',               'espalda',  'biceps',          'maquina',       'tiron_horizontal'],
  ['Peso muerto',                   'espalda',  'isquios,gluteos', 'barra',         'bisagra'],
  // Piernas
  ['Sentadilla con barra',          'cuadriceps','gluteos,isquios','barra',         'sentadilla'],
  ['Sentadilla goblet',             'cuadriceps','gluteos',        'mancuerna',     'sentadilla'],
  ['Prensa de piernas',             'cuadriceps','gluteos',        'maquina',       'sentadilla'],
  ['Sentadilla hack',               'cuadriceps','gluteos',        'maquina',       'sentadilla'],
  ['Estocadas con mancuernas',      'cuadriceps','gluteos',        'mancuerna',     'zancada'],
  ['Sillón de cuádriceps',          'cuadriceps','',               'maquina',       'extension_rodilla'],
  ['Peso muerto rumano',            'isquios',  'gluteos,espalda', 'barra',         'bisagra'],
  ['Peso muerto rumano con mancuernas','isquios','gluteos',        'mancuerna',     'bisagra'],
  ['Camilla de isquios',            'isquios',  '',                'maquina',       'flexion_rodilla'],
  ['Hip thrust',                    'gluteos',  'isquios',         'barra',         'empuje_cadera'],
  ['Hip thrust en máquina',         'gluteos',  'isquios',         'maquina',       'empuje_cadera'],
  ['Gemelos de pie en máquina',     'gemelos',  '',                'maquina',       'extension_tobillo'],
  ['Gemelos con mancuernas',        'gemelos',  '',                'mancuerna',     'extension_tobillo'],
  // Hombros
  ['Press militar con barra',       'hombros',  'triceps',         'barra',         'empuje_vertical'],
  ['Press de hombros con mancuernas','hombros', 'triceps',         'mancuerna',     'empuje_vertical'],
  ['Press de hombros en máquina',   'hombros',  'triceps',         'maquina',       'empuje_vertical'],
  ['Vuelos laterales',              'hombros',  '',                'mancuerna',     'elevacion_lateral'],
  ['Vuelos laterales en polea',     'hombros',  '',                'polea',         'elevacion_lateral'],
  ['Face pull',                     'hombros',  'espalda',         'polea',         'tiron_horizontal'],
  // Brazos
  ['Curl con barra',                'biceps',   '',                'barra',         'flexion_codo'],
  ['Curl con mancuernas',           'biceps',   '',                'mancuerna',     'flexion_codo'],
  ['Curl en polea',                 'biceps',   '',                'polea',         'flexion_codo'],
  ['Curl en máquina',               'biceps',   '',                'maquina',       'flexion_codo'],
  ['Extensión de tríceps en polea', 'triceps',  '',                'polea',         'extension_codo'],
  ['Press francés',                 'triceps',  '',                'barra',         'extension_codo'],
  ['Extensión de tríceps con mancuerna','triceps','',              'mancuerna',     'extension_codo'],
  ['Fondos en paralelas',           'triceps',  'pecho,hombros',   'peso_corporal', 'empuje_vertical'],
  // Abdominales
  ['Plancha',                       'abdominales','',              'peso_corporal', 'core'],
  ['Crunch en polea',               'abdominales','',              'polea',         'core'],
  ['Elevación de piernas colgado',  'abdominales','',              'peso_corporal', 'core'],
  ['Crunch en máquina',             'abdominales','',              'maquina',       'core'],
];
