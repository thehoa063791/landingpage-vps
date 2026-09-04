// PM2 process file. Run:  pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'landingpage',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      out_file: './logs/app.out.log',
      error_file: './logs/app.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
