#!/bin/bash
#
# Application Setup Script
# Installs dependencies, builds packages, and starts services
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

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_info "Please create .env file first. See .env.example for reference."
    exit 1
fi

# Create logs directory
print_info "Creating logs directory..."
mkdir -p logs

# Install dependencies
print_info "Installing dependencies with pnpm..."
pnpm install

# Build packages (only production-critical ones)
print_info "Building production packages..."
# Build database, runtime, ui-server, ui-frontend (skip evaluations which is dev-only)
pnpm run build --filter '!@eitherway/evaluations' || {
    print_warning "Some packages failed to build, checking critical packages..."
    # Verify critical packages built successfully
    if [ ! -d "packages/database/dist" ] || [ ! -d "packages/ui-server/dist" ]; then
        print_error "Critical packages failed to build!"
        exit 1
    fi
    print_info "Critical packages built successfully, continuing..."
}

# Setup HTTPS certificates for local development (WebContainer compatibility)
print_info "Setting up HTTPS certificates for backend..."
if [ ! -d .certs ]; then
    mkdir -p .certs
    # Generate self-signed certificate
    openssl req -x509 -newkey rsa:4096 -nodes \
        -keyout .certs/localhost-key.pem \
        -out .certs/localhost-cert.pem \
        -days 365 \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
    print_info "✅ Self-signed certificates created"
else
    print_info "Certificates already exist"
fi

# Stop existing PM2 processes
print_info "Stopping existing PM2 processes..."
pm2 delete all || true

# Start applications with PM2
print_info "Starting applications with PM2..."
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

print_info "✅ Application setup complete!"
print_info ""
print_info "Running services:"
pm2 list
print_info ""
print_info "View logs:"
print_info "  Backend:  pm2 logs eitherway-backend"
print_info "  Frontend: pm2 logs eitherway-frontend"
print_info ""
print_info "Next steps:"
print_info "1. Configure nginx: sudo cp deployment/nginx/eitherway.conf /etc/nginx/sites-available/"
print_info "2. Enable site: sudo ln -s /etc/nginx/sites-available/eitherway.conf /etc/nginx/sites-enabled/"
print_info "3. Run HTTPS setup: ./deployment/scripts/setup-https.sh"
