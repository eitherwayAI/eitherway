#!/bin/bash
# Setup HTTPS certificates for local development using mkcert

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$PROJECT_ROOT/.certs"

echo "🔐 Setting up HTTPS for local development..."

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "❌ mkcert is not installed."
    echo ""
    echo "Please install mkcert first:"
    echo ""
    echo "  macOS:   brew install mkcert"
    echo "  Linux:   curl -JLO \"https://dl.filippo.io/mkcert/latest?for=linux/amd64\""
    echo "           chmod +x mkcert-v*-linux-amd64"
    echo "           mkdir -p ~/.local/bin"
    echo "           mv mkcert-v*-linux-amd64 ~/.local/bin/mkcert"
    echo "           export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "  Windows: choco install mkcert  OR  scoop install mkcert"
    echo ""
    exit 1
fi

# Try to install local CA (may require sudo)
echo "📝 Installing local CA..."
if mkcert -install 2>/dev/null; then
    echo "✓ Local CA installed successfully"
else
    echo "⚠️  Could not install local CA (requires sudo on some systems)"
    echo "   Certificates will still be generated, but browsers may show security warnings."
    echo "   You can accept these warnings for localhost during development."
fi

# Create certificates directory
mkdir -p "$CERTS_DIR"

# Generate certificates for localhost
echo "🔑 Generating certificates for localhost..."
cd "$CERTS_DIR"
mkcert -key-file localhost-key.pem -cert-file localhost-cert.pem localhost 127.0.0.1 ::1

echo ""
echo "✅ HTTPS setup complete!"
echo ""
echo "Certificates stored in: $CERTS_DIR"
echo "  - Certificate: localhost-cert.pem"
echo "  - Key:         localhost-key.pem"
echo ""
echo "Your backend will now serve over HTTPS when you start the server."
echo ""
echo "ℹ️  Note: If your browser shows a security warning, click 'Advanced' > 'Proceed to localhost'"
echo "   This is normal for self-signed certificates in development."
echo ""
