-- CuerPro — esquema MySQL
-- El servidor lo ejecuta solo al arrancar (CREATE TABLE IF NOT EXISTS).
-- También se puede importar a mano desde phpMyAdmin.

CREATE TABLE IF NOT EXISTS cuerpro_usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  foto_url      VARCHAR(255) DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_sesiones (
  token      VARCHAR(64) PRIMARY KEY,
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Grupo de amigos que entrena junto en el mismo gym
CREATE TABLE IF NOT EXISTS cuerpro_grupos (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(100) NOT NULL,
  gym                VARCHAR(100) DEFAULT '',
  codigo_invitacion  VARCHAR(12)  NOT NULL,
  -- 'todos': cualquier miembro puede editar el plan; 'algunos': solo los coaches
  quien_edita        ENUM('todos','algunos') NOT NULL DEFAULT 'algunos',
  dias_aviso_musculo INT NOT NULL DEFAULT 5,
  ranking_grupo      TINYINT(1) NOT NULL DEFAULT 0,
  ranking_global     TINYINT(1) NOT NULL DEFAULT 0,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_codigo (codigo_invitacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_miembros (
  grupo_id   INT NOT NULL,
  usuario_id INT NOT NULL,
  rol        ENUM('coach','miembro') NOT NULL DEFAULT 'miembro',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (grupo_id, usuario_id),
  FOREIGN KEY (grupo_id)   REFERENCES cuerpro_grupos(id)   ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Horario fijo del grupo: dia_semana 0 = domingo … 6 = sábado
CREATE TABLE IF NOT EXISTS cuerpro_horarios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  grupo_id   INT NOT NULL,
  dia_semana TINYINT NOT NULL,
  hora       TIME NOT NULL,
  FOREIGN KEY (grupo_id) REFERENCES cuerpro_grupos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catálogo de ejercicios. grupo_id NULL = precargado para todos
CREATE TABLE IF NOT EXISTS cuerpro_ejercicios (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  grupo_id            INT DEFAULT NULL,
  nombre              VARCHAR(100) NOT NULL,
  musculo_principal   VARCHAR(40)  NOT NULL,
  musculos_secundarios VARCHAR(200) DEFAULT '',
  equipo              ENUM('maquina','mancuerna','barra','polea','peso_corporal','otro') NOT NULL,
  movimiento          VARCHAR(40)  DEFAULT '',
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grupo_id) REFERENCES cuerpro_grupos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plan: de un grupo (grupo_id) o personal (usuario_id) para quien entrena solo
CREATE TABLE IF NOT EXISTS cuerpro_planes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  grupo_id    INT DEFAULT NULL,
  usuario_id  INT DEFAULT NULL,
  nombre      VARCHAR(100) NOT NULL,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  publicado   TINYINT(1) NOT NULL DEFAULT 0,
  archivado   TINYINT(1) NOT NULL DEFAULT 0, -- versión vieja de un plan editado
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grupo_id)   REFERENCES cuerpro_grupos(id)   ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_plan_dias (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  orden   INT NOT NULL,
  nombre  VARCHAR(100) NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES cuerpro_planes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_plan_ejercicios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  dia_id        INT NOT NULL,
  ejercicio_id  INT NOT NULL,
  orden         INT NOT NULL,
  series        INT NOT NULL DEFAULT 3,
  repeticiones  VARCHAR(20) NOT NULL DEFAULT '10',
  peso_sugerido DECIMAL(6,2) DEFAULT NULL,
  carga         ENUM('liviano','moderado','pesado') DEFAULT NULL, -- cuando no hay kilos
  descanso_seg  INT DEFAULT NULL,                                 -- pausa entre series
  nota          VARCHAR(200) DEFAULT NULL,                        -- indicación técnica del coach
  union_siguiente ENUM('superserie','circuito') DEFAULT NULL,     -- va junto con el ejercicio que sigue
  FOREIGN KEY (dia_id)       REFERENCES cuerpro_plan_dias(id)  ON DELETE CASCADE,
  FOREIGN KEY (ejercicio_id) REFERENCES cuerpro_ejercicios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Alternativas que define el coach para cuando la máquina está ocupada
CREATE TABLE IF NOT EXISTS cuerpro_alternativas (
  plan_ejercicio_id INT NOT NULL,
  ejercicio_id      INT NOT NULL,
  orden             INT NOT NULL DEFAULT 1,
  PRIMARY KEY (plan_ejercicio_id, ejercicio_id),
  FOREIGN KEY (plan_ejercicio_id) REFERENCES cuerpro_plan_ejercicios(id) ON DELETE CASCADE,
  FOREIGN KEY (ejercicio_id)      REFERENCES cuerpro_ejercicios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_encuentros (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  grupo_id   INT NOT NULL,
  fecha_hora DATETIME NOT NULL,
  dia_id     INT DEFAULT NULL,
  -- Si el coach lo movió: la fecha del horario fijo que reemplaza
  fecha_original DATETIME DEFAULT NULL,
  cancelado  TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_grupo_fecha (grupo_id, fecha_hora),
  FOREIGN KEY (grupo_id) REFERENCES cuerpro_grupos(id)    ON DELETE CASCADE,
  FOREIGN KEY (dia_id)   REFERENCES cuerpro_plan_dias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Si alguien elige una alternativa, cambia para todo el grupo en ese encuentro
CREATE TABLE IF NOT EXISTS cuerpro_cambios_encuentro (
  encuentro_id      INT NOT NULL,
  plan_ejercicio_id INT NOT NULL,
  ejercicio_id      INT NOT NULL,
  usuario_id        INT NOT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (encuentro_id, plan_ejercicio_id),
  FOREIGN KEY (encuentro_id)      REFERENCES cuerpro_encuentros(id)       ON DELETE CASCADE,
  FOREIGN KEY (plan_ejercicio_id) REFERENCES cuerpro_plan_ejercicios(id)  ON DELETE CASCADE,
  FOREIGN KEY (ejercicio_id)      REFERENCES cuerpro_ejercicios(id),
  FOREIGN KEY (usuario_id)        REFERENCES cuerpro_usuarios(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Voy / no voy" antes, y asistencia real que marca el coach
CREATE TABLE IF NOT EXISTS cuerpro_confirmaciones (
  encuentro_id INT NOT NULL,
  usuario_id   INT NOT NULL,
  va           TINYINT(1) DEFAULT NULL,
  asistio      TINYINT(1) DEFAULT NULL,
  nota         VARCHAR(140) DEFAULT NULL,  -- "llego 15 tarde", etc.
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (encuentro_id, usuario_id),
  FOREIGN KEY (encuentro_id) REFERENCES cuerpro_encuentros(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id)   REFERENCES cuerpro_usuarios(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_series (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT NOT NULL,
  encuentro_id INT DEFAULT NULL,
  ejercicio_id INT NOT NULL,
  numero       INT NOT NULL,
  repeticiones INT NOT NULL,
  peso         DECIMAL(6,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usuario_ejercicio (usuario_id, ejercicio_id),
  FOREIGN KEY (usuario_id)   REFERENCES cuerpro_usuarios(id)   ON DELETE CASCADE,
  FOREIGN KEY (encuentro_id) REFERENCES cuerpro_encuentros(id) ON DELETE SET NULL,
  FOREIGN KEY (ejercicio_id) REFERENCES cuerpro_ejercicios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Propuestas de cambios al plan que hacen los miembros
CREATE TABLE IF NOT EXISTS cuerpro_propuestas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  plan_id    INT NOT NULL,
  usuario_id INT NOT NULL,
  texto      TEXT NOT NULL,
  estado     ENUM('pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id)    REFERENCES cuerpro_planes(id)   ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Puntos de la temporada (mes). motivo: asistencia, rutina_completa, semana_completa, record, sin_avisos
CREATE TABLE IF NOT EXISTS cuerpro_puntos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  grupo_id   INT DEFAULT NULL,
  temporada  CHAR(7) NOT NULL,
  motivo     VARCHAR(30) NOT NULL,
  puntos     INT NOT NULL,
  referencia VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_evento (usuario_id, motivo, referencia),
  KEY idx_temporada (temporada, usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (grupo_id)   REFERENCES cuerpro_grupos(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuerpro_push_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token      VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_token (token),
  FOREIGN KEY (usuario_id) REFERENCES cuerpro_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
