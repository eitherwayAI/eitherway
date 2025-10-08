# HTTPS Setup for WebContainer Development

## Why HTTPS is Required

WebContainer previews run on HTTPS domains (e.g., `https://...webcontainer-api.io`). When your backend API runs on HTTP (`http://localhost:3001`), browsers block these requests as **mixed content** (HTTPS → HTTP), causing:

- ❌ `net::ERR_FAILED` on all `/api/proxy-cdn` and `/api/proxy-api` calls
- ❌ Failed API requests (CoinGecko, etc.)
- ❌ Failed CDN asset loading (images, scripts, fonts)
- ❌ YouTube and other third-party embeds may fail to load

**Solution:** Run the backend on HTTPS in development so the preview can make secure requests.

---

## Quick Setup (One-Time)

### 1. Install mkcert

**mkcert** creates locally-trusted development certificates.

#### macOS
```bash
brew install mkcert
```

#### Linux (Debian/Ubuntu)
```bash
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo cp mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

#### Windows
```bash
# Using Chocolatey
choco install mkcert

# Or using Scoop
scoop bucket add extras
scoop install mkcert
```

Full installation guide: https://github.com/FiloSottile/mkcert#installation

### 2. Run the Setup Script

```bash
npm run setup:https
```

This will:
1. Install the local CA (certificate authority) on your system
2. Generate `localhost-cert.pem` and `localhost-key.pem` in `.certs/`
3. Configure your system to trust these certificates

**That's it!** The backend will automatically detect the certificates and use HTTPS.

---

## How It Works

### Auto-Detection

Both the **backend** (Fastify) and **frontend** (Vite) automatically detect HTTPS certificates:

**Backend (`packages/ui-server/src/server.ts`):**
- Checks for `.certs/localhost-cert.pem` and `.certs/localhost-key.pem`
- If found → starts with `https://localhost:3001`
- If not found → falls back to `http://localhost:3001`

**Frontend (`packages/ui-frontend/vite.config.ts`):**
- Checks for the same certificate files
- Updates the `/api` proxy target to match the backend protocol
- Sets `secure: false` to trust self-signed certificates

### Runtime Shim (`packages/ui-server/src/cdn-rewriter.ts`)

When serving HTML files to WebContainer previews, the server:
1. Computes `serverOrigin` from `x-forwarded-proto` and `host` headers
2. Injects a runtime shim that uses this **exact origin** (not synthesized from the preview hostname)
3. Proxies all external fetches through `/api/proxy-cdn` or `/api/proxy-api`

**Before the fix:**
```javascript
// ❌ BAD: Synthesizes a fake origin from preview hostname + port
var serverOrigin = window.location.protocol + '//' + window.location.hostname + ':3001';
// Results in: https://k03e2...webcontainer-api.io:3001 (doesn't exist!)
```

**After the fix:**
```javascript
// ✅ GOOD: Uses exact backend origin provided by server
var serverOrigin = "https://localhost:3001";
// Works because backend is actually serving HTTPS
```

---

## Verification

### 1. Start the Backend

```bash
npm run server
```

You should see:
```
✓ HTTPS certificates found - server will use HTTPS
🚀 EitherWay UI Server running on https://localhost:3001
🔐 HTTPS enabled - WebContainer previews will work without mixed content issues
```

### 2. Start the Frontend

```bash
npm run ui
```

### 3. Test in Browser

Open the browser console (DevTools → Network tab) and verify:

✅ **No requests to** `https://<webcontainer-host>:3001/...`
✅ **All proxy calls go to** `https://localhost:3001/api/proxy-*`
✅ **API calls route to** `/api/proxy-api?url=https://api.coingecko.com/...`
✅ **CDN calls route to** `/api/proxy-cdn?url=...`
✅ **No** `net::ERR_FAILED` or mixed content warnings

---

## Troubleshooting

### "mkcert: command not found"

Install mkcert first (see [Install mkcert](#1-install-mkcert) above).

### Certificates Generated but Backend Still Uses HTTP

1. Check that certificates exist:
   ```bash
   ls -la .certs/
   ```
   You should see `localhost-cert.pem` and `localhost-key.pem`.

2. Restart the backend:
   ```bash
   npm run server
   ```

3. If it still uses HTTP, check file permissions:
   ```bash
   chmod 644 .certs/*.pem
   ```

### Browser Shows "NET::ERR_CERT_AUTHORITY_INVALID"

The local CA wasn't installed. Re-run:
```bash
mkcert -install
```

Then restart your browser.

### Mixed Content Errors Still Appear

1. Verify backend is using HTTPS (check startup logs)
2. Verify frontend proxy is targeting HTTPS:
   ```bash
   # In vite.config.ts, check that backendTarget shows https://
   ```
3. Hard refresh the browser (Cmd/Ctrl + Shift + R)
4. Clear browser cache

---

## Production Deployment

**Do not use mkcert certificates in production!**

For production:
- Use a reverse proxy (Caddy, Traefik, Nginx) with Let's Encrypt
- Or use a cloud provider's managed HTTPS (Cloudflare, AWS ALB, etc.)
- The `x-forwarded-proto` header will be set by your proxy/load balancer
- The backend already reads this header to compute the correct `serverOrigin`

---

## Security Notes

- ✅ mkcert certificates are **only trusted on your local machine**
- ✅ They are **not** valid on the internet
- ✅ `.certs/` is ignored by git (see `.gitignore`)
- ✅ `*.pem` files are globally ignored
- ⚠️ **Never commit** private keys or certificates to version control

---

## Alternative: Cloudflare Tunnel (Public HTTPS for Testing)

If you need to test on a real device or share a preview:

```bash
# Install cloudflared
brew install cloudflared  # macOS
# See https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Tunnel your backend
cloudflared tunnel --url https://localhost:3001
```

This gives you a public `https://...trycloudflare.com` URL that you can use for testing.

---

## Summary

✅ **One command** to set up HTTPS: `npm run setup:https`
✅ **Auto-detection** in both backend and frontend
✅ **Zero config** after initial setup
✅ **WebContainer previews** work without mixed content issues
✅ **CoinGecko, YouTube, CDNs** all load correctly

For questions or issues, see the main README or file an issue.
