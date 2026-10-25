module.exports = {
  apps: [
    {
      name:        'cuerpro-api',
      script:      'index.js',
      cwd:         '/home/sistemacbahost/cuerpro-api',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT:     '3031',
        // Los horarios de los encuentros se calculan en hora argentina
        TZ:       'America/Argentina/Cordoba',
      },
    },
  ],
};
