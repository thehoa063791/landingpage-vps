/* eslint-env node */
module.exports = {
  apps: [
    {
      name: 'next-dong-tien',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3002',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        ADMIN_API_URL: 'http://127.0.0.1:3001',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      instances: '1',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/dong-tien-error.log',
      out_file: './logs/dong-tien-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
