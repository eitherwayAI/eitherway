module.exports = {
  apps: [
    {
      name: 'eitherway-backend',
      script: 'npm',
      args: 'run server',
      cwd: '/home/ubuntu/eitherway',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/home/ubuntu/eitherway/logs/backend-error.log',
      out_file: '/home/ubuntu/eitherway/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'eitherway-frontend',
      script: 'npm',
      args: 'run ui',
      cwd: '/home/ubuntu/eitherway',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5173
      },
      error_file: '/home/ubuntu/eitherway/logs/frontend-error.log',
      out_file: '/home/ubuntu/eitherway/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
