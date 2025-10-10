# EitherWay Production Deployment Guide

Complete guide for deploying EitherWay to Ubuntu VM with dev.eitherway.ai domain.

## Prerequisites

- Ubuntu 20.04+ VM with root access
- Domain `dev.eitherway.ai` pointing to the VM's IP address
- At least 4GB RAM and 2 CPU cores
- Port 80 and 443 open in firewall

## Quick Start

```bash
# 1. Clone repository
cd /home/ubuntu
git clone <repository-url> eitherway
cd eitherway
git checkout beta-deployment

# 2. Make scripts executable
chmod +x deployment/scripts/*.sh

# 3. Run setup scripts in order
./deployment/scripts/setup.sh
./deployment/scripts/setup-database.sh
./deployment/scripts/setup-app.sh
sudo ./deployment/scripts/setup-https.sh
```

## Detailed Steps

### 1. System Setup

Installs Node.js, Docker, PM2, nginx, and other dependencies.

```bash
./deployment/scripts/setup.sh
```

**What it does:**
- Updates system packages
- Installs Node.js 20.x
- Installs pnpm package manager
- Installs PM2 process manager
- Installs Docker and Docker Compose
- Installs nginx web server
- Installs certbot for SSL certificates

**Time:** ~5-10 minutes

### 2. Environment Configuration

Create `.env` file from example:

```bash
cp .env.example .env
nano .env
```

**Required variables to set:**
```env
# API Keys (REQUIRED)
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Database Password (CHANGE THIS!)
POSTGRES_PASSWORD=your_strong_password_here

# Encryption Key (GENERATE NEW!)
# Run: openssl rand -base64 32
ENCRYPTION_KEY=generated_encryption_key_here

# Production Environment
NODE_ENV=production
```

**Optional variables:**
- `COINGECKO_DEMO_API_KEY` - For crypto price data
- `NETLIFY_SERVER_TOKEN` - For live deployment logs

### 3. Database Setup

Sets up PostgreSQL with Docker and runs all migrations:

```bash
./deployment/scripts/setup-database.sh
```

**What it does:**
- Starts PostgreSQL container with Docker Compose
- Creates pgcrypto extension
- Runs all database migrations (001-013)
- Verifies database connectivity

**Time:** ~2-3 minutes

**Verify:**
```bash
docker ps  # Should show eitherway-postgres
docker logs eitherway-postgres  # Check for errors
```

### 4. Application Setup

Builds and starts the application with PM2:

```bash
./deployment/scripts/setup-app.sh
```

**What it does:**
- Installs npm dependencies with pnpm
- Builds all packages (database, runtime, ui-server, ui-frontend)
- Generates self-signed certificates for backend HTTPS
- Starts backend and frontend with PM2
- Saves PM2 process list for auto-restart on reboot

**Time:** ~3-5 minutes (first build is slower)

**Verify:**
```bash
pm2 list  # Should show 2 apps running
pm2 logs  # Check application logs
curl http://localhost:3001/api/health  # Test backend
curl http://localhost:5173  # Test frontend
```

### 5. HTTPS and Nginx Setup

Obtains SSL certificate and configures nginx:

```bash
sudo ./deployment/scripts/setup-https.sh
```

**What it does:**
- Copies nginx configuration to /etc/nginx/sites-available/
- Obtains Let's Encrypt SSL certificate for dev.eitherway.ai
- Configures nginx as reverse proxy
- Enables automatic certificate renewal
- Reloads nginx with SSL configuration

**Time:** ~1-2 minutes

**Verify:**
```bash
sudo nginx -t  # Test nginx configuration
sudo systemctl status nginx  # Check nginx status
curl https://dev.eitherway.ai/api/health  # Test HTTPS
```

## Post-Deployment

### Check Application Status

```bash
# PM2 processes
pm2 list
pm2 logs eitherway-backend --lines 50
pm2 logs eitherway-frontend --lines 50

# Database
docker ps
docker logs eitherway-postgres --tail 50

# Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/eitherway_access.log
```

### Update Application

```bash
cd /home/ubuntu/eitherway
git pull origin beta-deployment
pnpm install
pnpm run build
pm2 restart all
```

### Restart Services

```bash
# Restart PM2 apps
pm2 restart all

# Restart database
docker-compose restart postgres

# Restart nginx
sudo systemctl restart nginx
```

### Monitor Logs

```bash
# Real-time logs
pm2 logs

# Specific app logs
pm2 logs eitherway-backend
pm2 logs eitherway-frontend

# PM2 monitoring dashboard
pm2 monit
```

## Troubleshooting

### Application not starting

```bash
# Check PM2 logs
pm2 logs --err

# Check environment variables
cat .env

# Verify database connection
docker exec eitherway-postgres pg_isready -U postgres
```

### Database connection issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check database logs
docker logs eitherway-postgres

# Verify credentials
docker exec -it eitherway-postgres psql -U postgres -d eitherway
```

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check nginx configuration
sudo nginx -t
```

### Port conflicts

```bash
# Check what's using ports
sudo lsof -i :3001
sudo lsof -i :5173
sudo lsof -i :5433
sudo lsof -i :80
sudo lsof -i :443
```

## Security Checklist

- [ ] Strong PostgreSQL password in .env
- [ ] Unique ENCRYPTION_KEY generated
- [ ] Firewall configured (UFW or cloud provider)
- [ ] Only ports 80, 443, and 22 (SSH) open
- [ ] SSH key-based authentication enabled
- [ ] Regular backups configured
- [ ] PM2 logs rotated (pm2 install pm2-logrotate)
- [ ] System updates automated

## Backup Strategy

### Database Backup

```bash
# Manual backup
docker exec eitherway-postgres pg_dump -U postgres eitherway > backup_$(date +%Y%m%d).sql

# Restore backup
docker exec -i eitherway-postgres psql -U postgres eitherway < backup_20231215.sql
```

### Automated Backups

Add to crontab:
```bash
# Daily database backup at 2 AM
0 2 * * * cd /home/ubuntu/eitherway && docker exec eitherway-postgres pg_dump -U postgres eitherway > /home/ubuntu/backups/db_$(date +\%Y\%m\%d).sql
```

## Performance Tuning

### PM2 Cluster Mode

For better performance, edit `ecosystem.config.js`:

```javascript
instances: 'max',  // Use all CPU cores
exec_mode: 'cluster'
```

### PostgreSQL Optimization

Edit docker-compose.yml to add:

```yaml
command: postgres -c shared_buffers=256MB -c max_connections=200
```

## Maintenance

### Regular Updates

```bash
# System updates
sudo apt update && sudo apt upgrade -y

# Node.js dependencies
pnpm update

# Rebuild and restart
pnpm run build
pm2 restart all
```

### Certificate Renewal

Automatic renewal is configured. Verify with:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## Support

For issues or questions:
- Check logs: `pm2 logs`
- Review nginx logs: `/var/log/nginx/eitherway_*.log`
- Database logs: `docker logs eitherway-postgres`
