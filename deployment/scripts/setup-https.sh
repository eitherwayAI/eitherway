#!/bin/bash
#
# HTTPS Setup Script
# Obtains Let's Encrypt SSL certificates and configures nginx
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

DOMAIN="dev.eitherway.ai"
EMAIL="serradezkevin@gmail.com"

print_info "Setting up HTTPS for $DOMAIN..."

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    print_error "nginx is not installed. Please run setup.sh first."
    exit 1
fi

# Copy nginx configuration
print_info "Copying nginx configuration..."
if [ ! -f /etc/nginx/sites-available/eitherway.conf ]; then
    cp /root/Eitherway-revamped/deployment/nginx/eitherway.conf /etc/nginx/sites-available/eitherway.conf
fi

# Create temporary nginx config without SSL (for certbot)
print_info "Creating temporary nginx config for certificate verification..."
cat > /etc/nginx/sites-available/eitherway-temp.conf << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name dev.eitherway.ai;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF

# Enable temporary config
ln -sf /etc/nginx/sites-available/eitherway-temp.conf /etc/nginx/sites-enabled/eitherway-temp.conf

# Remove default nginx site
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
print_info "Testing nginx configuration..."
nginx -t

# Reload nginx
print_info "Reloading nginx..."
systemctl reload nginx

# Obtain SSL certificate
print_info "Obtaining SSL certificate from Let's Encrypt..."
certbot certonly --nginx \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    -d $DOMAIN

# Remove temporary config
rm -f /etc/nginx/sites-enabled/eitherway-temp.conf

# Enable main site configuration
print_info "Enabling main site configuration..."
ln -sf /etc/nginx/sites-available/eitherway.conf /etc/nginx/sites-enabled/eitherway.conf

# Test nginx configuration again
print_info "Testing final nginx configuration..."
nginx -t

# Reload nginx
print_info "Reloading nginx with SSL configuration..."
systemctl reload nginx

# Setup automatic certificate renewal
print_info "Setting up automatic certificate renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

print_info "✅ HTTPS setup complete!"
print_info ""
print_info "SSL certificate status:"
certbot certificates
print_info ""
print_info "Your site should now be accessible at:"
print_info "https://$DOMAIN"
print_info ""
print_info "Certificates will auto-renew. Check renewal timer with:"
print_info "  systemctl status certbot.timer"
