#!/bin/bash
#
# EitherWay Deployment Setup Script
# Run this on Ubuntu VM to set up the entire application
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
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
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root. It will use sudo when needed."
    exit 1
fi

# Check if running on Ubuntu
if [ ! -f /etc/os-release ] || ! grep -q "Ubuntu" /etc/os-release; then
    print_error "This script is designed for Ubuntu. Other distributions may not work."
    exit 1
fi

print_info "Starting EitherWay deployment setup..."

# Update system packages
print_info "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install required system packages
print_info "Installing required packages..."
sudo apt install -y \
    git \
    curl \
    build-essential \
    nginx \
    certbot \
    python3-certbot-nginx \
    postgresql-client

# Install Node.js 20.x
print_info "Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

print_info "Node.js version: $(node -v)"
print_info "npm version: $(npm -v)"

# Install pnpm
print_info "Installing pnpm..."
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi

# Install PM2
print_info "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Setup PM2 startup script
print_info "Configuring PM2 to start on boot..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Install Docker
print_info "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    print_warning "You may need to log out and back in for Docker permissions to take effect"
fi

# Install Docker Compose
print_info "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

print_info "Docker version: $(docker --version)"
print_info "Docker Compose version: $(docker-compose --version)"

print_info "✅ System setup complete!"
print_info ""
print_info "Next steps:"
print_info "1. Clone the repository to /home/ubuntu/eitherway"
print_info "2. Run the database setup script: ./deployment/scripts/setup-database.sh"
print_info "3. Run the application setup script: ./deployment/scripts/setup-app.sh"
print_info "4. Run the HTTPS setup script: ./deployment/scripts/setup-https.sh"
