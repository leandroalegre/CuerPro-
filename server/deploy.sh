#!/bin/bash
# deploy.sh - Despliega CuerPro API en el servidor
# Ejecutar desde ~/cuerpro-api/ en el servidor

set -e

echo "💪 Desplegando CuerPro API..."

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install --production

# Copiar .env.example si no existe .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Creado .env desde .env.example — EDITAR con las credenciales reales!"
fi

# Iniciar/reiniciar con PM2
echo "🔄 Iniciando con PM2..."
pm2 delete cuerpro-api 2>/dev/null || true
pm2 start ecosystem.config.js

echo "✅ CuerPro API desplegada!"
echo "📋 Estado PM2:"
pm2 list
