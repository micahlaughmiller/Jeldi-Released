# AWS Deployment Guide

This directory contains comprehensive deployment configurations for deploying the Node.js/React application to various AWS services. Choose the deployment method that best fits your needs.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Options](#deployment-options)
  - [1. EC2 Deployment](#1-ec2-deployment)
  - [2. Elastic Beanstalk Deployment](#2-elastic-beanstalk-deployment)
  - [3. Lambda/Serverless Deployment](#3-lambdaserverless-deployment)
- [Post-Deployment](#post-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

Before deploying to any AWS service, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js 18.x** installed locally
4. **Git** for version control
5. **Domain name** (optional but recommended for production)

### Required AWS Permissions

Your AWS user/role needs the following permissions:
- EC2 full access (for EC2 deployment)
- Elastic Beanstalk full access (for EB deployment)
- Lambda full access (for serverless deployment)
- IAM role creation and management
- CloudFormation stack management
- S3 bucket creation and management
- Route 53 (if using custom domains)

## 🌍 Environment Configuration

### 1. Copy Environment Template

```bash
cp deployment/.env.production.template .env.production
```

### 2. Fill in Your Values

Edit `.env.production` with your actual values:

- **Database**: PostgreSQL connection string
- **Authentication**: JWT secrets, OAuth credentials
- **AWS**: Access keys, region, bucket names
- **External APIs**: OpenAI, email services, etc.
- **Domains**: Your production URLs

### 3. Secure Your Secrets

⚠️ **SECURITY WARNING**: Never commit `.env.production` to version control!

```bash
echo ".env.production" >> .gitignore
```

For production deployments, use:
- AWS Systems Manager Parameter Store
- AWS Secrets Manager
- Environment variables in your deployment service

## 🚀 Deployment Options

## 1. EC2 Deployment

**Best for**: Full control, custom configurations, traditional server setups

### Prerequisites
- EC2 instance running Ubuntu 20.04 or later
- Security groups allowing HTTP (80), HTTPS (443), and SSH (22)
- Elastic IP address (recommended)

### Quick Start

1. **Launch EC2 Instance**
   ```bash
   # Create security group
   aws ec2 create-security-group --group-name jeldi-sg --description "Security group for Jeldi app"
   
   # Add rules
   aws ec2 authorize-security-group-ingress --group-name jeldi-sg --protocol tcp --port 22 --cidr 0.0.0.0/0
   aws ec2 authorize-security-group-ingress --group-name jeldi-sg --protocol tcp --port 80 --cidr 0.0.0.0/0
   aws ec2 authorize-security-group-ingress --group-name jeldi-sg --protocol tcp --port 443 --cidr 0.0.0.0/0
   
   # Launch instance
   aws ec2 run-instances --image-id ami-0c55b159cbfafe1d0 --count 1 --instance-type t3.medium --key-name your-key-pair --security-groups jeldi-sg
   ```

2. **Connect to Instance**
   ```bash
   ssh -i your-key-pair.pem ubuntu@your-ec2-public-ip
   ```

3. **Run Setup Script**
   ```bash
   # Clone your repository
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   
   # Make setup script executable
   chmod +x deployment/ec2-setup.sh
   
   # Run setup
   ./deployment/ec2-setup.sh
   ```

4. **Configure Environment**
   ```bash
   # Copy and edit environment file
   cp deployment/.env.production.template .env.production
   nano .env.production
   ```

5. **Start Application**
   ```bash
   # Start with PM2
   pm2 start ecosystem.config.js --env production
   
   # Save PM2 configuration
   pm2 save
   ```

6. **Setup SSL (Optional)**
   ```bash
   # Install SSL certificate with Let's Encrypt
   sudo certbot --nginx -d your-domain.com
   ```

### EC2 Configuration Files

- **`ec2-setup.sh`**: Automated Ubuntu server setup
- **`ecosystem.config.js`**: PM2 process management
- **`nginx.conf`**: Nginx reverse proxy configuration

### EC2 Management Commands

```bash
# Check application status
pm2 status

# View logs
pm2 logs

# Restart application
pm2 restart all

# Check nginx status
sudo systemctl status nginx

# Restart nginx
sudo systemctl restart nginx
```

## 2. Elastic Beanstalk Deployment

**Best for**: Managed infrastructure, automatic scaling, easy deployments

### Prerequisites
- Elastic Beanstalk CLI installed
- Application source code in Git

### Quick Start

1. **Initialize Elastic Beanstalk**
   ```bash
   eb init --platform node.js-18 --region us-east-1 jeldi-app
   ```

2. **Create Environment**
   ```bash
   eb create production --instance-type t3.medium --platform-version "Node.js 18 running on 64bit Amazon Linux 2"
   ```

3. **Configure Environment Variables**
   ```bash
   # Set environment variables (from your .env.production file)
   eb setenv NODE_ENV=production DATABASE_URL=your-database-url JWT_SECRET=your-jwt-secret
   ```

4. **Deploy Application**
   ```bash
   eb deploy
   ```

5. **Setup Custom Domain (Optional)**
   ```bash
   # Add custom domain
   eb labs setup-ssl --certificate-arn arn:aws:acm:region:account:certificate/cert-id
   ```

### Elastic Beanstalk Configuration Files

- **`.ebextensions/`**: Environment configuration
  - `01_packages.config`: System packages and Node.js setup
  - `02_environment.config`: Environment variables and scaling
  - `03_nginx.config`: Nginx and WebSocket configuration
  - `04_ssl.config`: SSL and security headers
  - `05_healthcheck.config`: Health monitoring and logging
- **`Dockerrun.aws.json`**: Docker container configuration

### Elastic Beanstalk Management

```bash
# Check environment status
eb status

# View logs
eb logs

# SSH to instance
eb ssh

# Scale environment
eb scale 2  # Scale to 2 instances

# Terminate environment
eb terminate production
```

## 3. Lambda/Serverless Deployment

**Best for**: Cost optimization, automatic scaling, serverless architecture

### Prerequisites
- Serverless Framework CLI installed
- AWS credentials configured

### Quick Start

1. **Install Serverless Framework**
   ```bash
   npm install -g serverless
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure SSM Parameters**
   ```bash
   # Store secrets in AWS Systems Manager Parameter Store
   aws ssm put-parameter --name "/jeldi/production/database-url" --value "your-database-url" --type "SecureString"
   aws ssm put-parameter --name "/jeldi/production/jwt-secret" --value "your-jwt-secret" --type "SecureString"
   aws ssm put-parameter --name "/jeldi/production/openai-api-key" --value "your-openai-key" --type "SecureString"
   # ... add other parameters
   ```

4. **Deploy to AWS**
   ```bash
   # Deploy using enhanced configuration
   sls deploy --config deployment/serverless/serverless.yml --stage production --region us-east-1
   ```

5. **Setup Custom Domain (Optional)**
   ```bash
   sls create_domain --config deployment/serverless/serverless.yml --stage production
   ```

### Lambda Configuration Files

- **`serverless/serverless.yml`**: Enhanced serverless configuration
  - API Gateway configuration
  - Lambda functions with proper sizing
  - WebSocket support
  - Background job processing
  - CloudFormation resources

### Serverless Management

```bash
# Check deployment info
sls info --config deployment/serverless/serverless.yml --stage production

# View logs
sls logs -f api --config deployment/serverless/serverless.yml --stage production --tail

# Invoke function
sls invoke -f api --config deployment/serverless/serverless.yml --stage production

# Remove deployment
sls remove --config deployment/serverless/serverless.yml --stage production
```

## 📊 Post-Deployment

### 1. Health Check

After deployment, verify your application:

```bash
# Check health endpoint
curl https://your-domain.com/api/health

# Check main application
curl https://your-domain.com
```

### 2. Database Setup

If using a new database:

```bash
# Run database migrations
npm run db:push
```

### 3. Domain Configuration

If using a custom domain:

1. **Route 53 Setup**
   ```bash
   # Create hosted zone
   aws route53 create-hosted-zone --name your-domain.com --caller-reference $(date +%s)
   ```

2. **SSL Certificate**
   ```bash
   # Request certificate
   aws acm request-certificate --domain-name your-domain.com --validation-method DNS
   ```

## 📈 Monitoring and Maintenance

### CloudWatch Monitoring

1. **Set up CloudWatch Alarms**
   - High memory usage
   - High CPU usage
   - Error rate thresholds
   - Response time monitoring

2. **Log Monitoring**
   - Application errors
   - Slow queries
   - Failed authentication attempts

### Backup Strategy

1. **Database Backups**
   - Automated daily backups
   - Point-in-time recovery
   - Cross-region replication

2. **Application Backups**
   - Code repository backups
   - Configuration backups
   - Assets and uploads backup

### Security Best Practices

1. **Regular Updates**
   ```bash
   # Update dependencies
   npm audit fix
   
   # Update system packages (EC2)
   sudo apt update && sudo apt upgrade
   ```

2. **Security Monitoring**
   - Enable AWS CloudTrail
   - Monitor failed login attempts
   - Regular security scans

## 🔍 Troubleshooting

### Common Issues

#### Application Won't Start

1. **Check environment variables**
   ```bash
   # Verify environment variables are set
   printenv | grep -E "(NODE_ENV|DATABASE_URL|JWT_SECRET)"
   ```

2. **Check logs**
   ```bash
   # EC2/PM2 logs
   pm2 logs
   
   # Elastic Beanstalk logs
   eb logs
   
   # Lambda logs
   sls logs -f api --tail
   ```

#### Database Connection Issues

1. **Verify connection string**
2. **Check security groups** (allow database port)
3. **Verify database is running**

#### SSL Certificate Issues

1. **Verify domain ownership**
2. **Check DNS configuration**
3. **Validate certificate status**

#### Performance Issues

1. **Monitor resource usage**
   ```bash
   # Check CPU and memory
   top
   htop
   
   # Check disk space
   df -h
   ```

2. **Optimize application**
   - Enable gzip compression
   - Implement caching
   - Optimize database queries

### Support Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **Serverless Framework**: https://www.serverless.com/framework/docs/
- **PM2 Documentation**: https://pm2.keymetrics.io/docs/
- **Nginx Documentation**: https://nginx.org/en/docs/

## 📞 Getting Help

If you encounter issues:

1. **Check logs first** - Most issues can be diagnosed from logs
2. **Verify configuration** - Double-check environment variables and settings
3. **Review AWS documentation** - AWS has comprehensive troubleshooting guides
4. **Community resources** - Stack Overflow, AWS forums, GitHub issues

## 🔄 Deployment Comparison

| Feature | EC2 | Elastic Beanstalk | Lambda |
|---------|-----|------------------|--------|
| **Cost** | Medium | Medium | Low |
| **Scalability** | Manual | Automatic | Automatic |
| **Maintenance** | High | Low | Very Low |
| **Control** | Full | Medium | Limited |
| **Cold Starts** | None | None | Yes |
| **Best For** | Custom setups | Traditional apps | Event-driven |

Choose the deployment method that best matches your requirements, budget, and technical expertise.