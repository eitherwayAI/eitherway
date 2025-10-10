#!/bin/bash
#
# Database Setup Script
# Sets up PostgreSQL with Docker and runs migrations
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

# Load environment variables
source .env

print_info "Starting PostgreSQL with Docker..."

# Stop existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^eitherway-postgres$"; then
    print_info "Stopping existing PostgreSQL container..."
    docker compose down
fi

# Start PostgreSQL
print_info "Starting PostgreSQL container..."
docker compose up -d postgres

# Wait for PostgreSQL to be ready
print_info "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec eitherway-postgres pg_isready -U ${POSTGRES_USER} > /dev/null 2>&1; then
        print_info "PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "PostgreSQL failed to start after 30 seconds"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""

# Create pgcrypto extension
print_info "Creating pgcrypto extension..."
docker exec eitherway-postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true

# Run migrations
print_info "Running database migrations..."
for migration in packages/database/src/migrations/*.sql; do
    migration_name=$(basename "$migration")
    print_info "Running migration: $migration_name"

    docker exec -i eitherway-postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} < "$migration" || {
        print_warning "Migration $migration_name may have already been applied or encountered an error"
    }
done

print_info "✅ Database setup complete!"
print_info ""
print_info "Connection details:"
print_info "Host: localhost"
print_info "Port: ${POSTGRES_PORT}"
print_info "Database: ${POSTGRES_DB}"
print_info "User: ${POSTGRES_USER}"
