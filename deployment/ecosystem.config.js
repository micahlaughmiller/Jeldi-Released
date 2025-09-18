module.exports = {
  apps: [
    {
      name: 'jeldi-app',
      script: 'dist/index.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Database Configuration
        DATABASE_URL: process.env.DATABASE_URL,
        
        // Authentication & Security
        JWT_SECRET: process.env.JWT_SECRET,
        SESSION_SECRET: process.env.SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
        
        // OAuth Configuration
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        
        // AWS Configuration
        AWS_REGION: process.env.AWS_REGION || 'us-east-1',
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        
        // External API Keys
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        
        // Application URLs
        FRONTEND_URL: process.env.FRONTEND_URL || 'https://your-domain.com',
        BACKEND_URL: process.env.BACKEND_URL || 'https://api.your-domain.com',
        
        // Email Configuration (if using)
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT || 587,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        
        // Monitoring & Logging
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      },
      // PM2 Configuration
      watch: false, // Set to true for development
      ignore_watch: ['node_modules', 'logs', '*.log'],
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Health monitoring
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
    }
  ],
  
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-server-ip-here'], // Replace with your EC2 instance IP
      ref: 'origin/main',
      repo: 'https://github.com/your-username/your-repo.git', // Replace with your repo
      path: '/var/www/app',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && npm run build && npm prune --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'sudo mkdir -p /var/www/app/logs'
    }
  }
};