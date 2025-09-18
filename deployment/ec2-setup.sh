#!/bin/bash
set -e

# AWS EC2 Ubuntu Server Setup Script for Node.js/React Application
# This script sets up Node.js, nginx, PM2, PostgreSQL client, and other dependencies

echo "🚀 Starting EC2 Ubuntu Server Setup..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
echo "🛠️ Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common build-essential

# Install Node.js 18.x (LTS)
echo "📦 Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js and npm installation
echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install PM2 globally for process management
echo "🔧 Installing PM2..."
sudo npm install -g pm2

# Install nginx
echo "🌐 Installing nginx..."
sudo apt install -y nginx

# Install PostgreSQL client
echo "🗄️ Installing PostgreSQL client..."
sudo apt install -y postgresql-client

# Install certbot for SSL certificates
echo "🔒 Installing Certbot for SSL..."
sudo apt install -y certbot python3-certbot-nginx

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/app
sudo chown -R $USER:$USER /var/www/app
cd /var/www/app

# Clone your repository (uncomment and modify as needed)
# echo "📥 Cloning repository..."
# git clone https://github.com/your-username/your-repo.git .

# Install application dependencies and build
if [ -f "package.json" ]; then
    echo "📦 Installing all dependencies (including devDependencies for build)..."
    npm ci
    
    # Build the application
    echo "🏗️ Building application..."
    npm run build
    
    # Clean up devDependencies after build
    echo "🧹 Removing devDependencies to save space..."
    npm prune --production
fi

# Copy PM2 ecosystem configuration
if [ -f "deployment/ecosystem.config.js" ]; then
    echo "⚙️ Copying PM2 configuration..."
    cp deployment/ecosystem.config.js .
fi

# Copy nginx configuration
if [ -f "deployment/nginx.conf" ]; then
    echo "🌐 Setting up nginx configuration..."
    sudo cp deployment/nginx.conf /etc/nginx/sites-available/app
    sudo ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# Setup PM2 startup script
echo "🔄 Setting up PM2 startup script..."
pm2 startup
echo "Remember to run the command shown above with sudo!"

# Setup environment file
echo "📝 Setting up environment file..."
if [ ! -f ".env.production" ]; then
    cp deployment/.env.production.template .env.production
    echo "⚠️ Please edit .env.production with your actual values!"
fi

# Setup firewall
echo "🔥 Configuring UFW firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Create systemd service for additional monitoring (optional)
echo "📋 Creating systemd service..."
sudo tee /etc/systemd/system/nodeapp.service > /dev/null <<EOF
[Unit]
Description=Node.js App
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=/var/www/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
echo "🎯 Enabling services..."
sudo systemctl enable nginx
sudo systemctl enable nodeapp
sudo systemctl start nginx

# Final status check
echo "📊 Service status:"
sudo systemctl status nginx --no-pager -l
pm2 status

echo ""
echo "🎉 EC2 setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update .env.production with your actual environment variables"
echo "2. Start your application with: pm2 start ecosystem.config.js --env production"
echo "3. Save PM2 configuration: pm2 save"
echo "4. Setup SSL certificate: sudo certbot --nginx -d your-domain.com"
echo "5. Test your application at your server's public IP or domain"
echo ""
echo "Useful commands:"
echo "- Check PM2 status: pm2 status"
echo "- View PM2 logs: pm2 logs"
echo "- Restart app: pm2 restart all"
echo "- Check nginx status: sudo systemctl status nginx"
echo "- Test nginx config: sudo nginx -t"
echo "- Reload nginx: sudo systemctl reload nginx"