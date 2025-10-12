module.exports = {
  apps: [
    {
      name: 'eitherway-backend',
      script: 'npm',
      args: 'run server',
      cwd: '/root/Eitherway-revamped',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/root/Eitherway-revamped/logs/backend-error.log',
      out_file: '/root/Eitherway-revamped/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'eitherway-frontend',
      script: 'npm',
      args: 'run start -w @eitherway/ui-frontend',
      cwd: '/root/Eitherway-revamped',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5173
      },
      error_file: '/root/Eitherway-revamped/logs/frontend-error.log',
      out_file: '/root/Eitherway-revamped/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
