/**
 * Deployment & Download Modals
 *
 * Modern modals for deployment to Netlify and downloading project files
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface DeploymentPanelProps {
  appId: string;
  sessionId: string;
  userId: string;
  initialTab?: 'deploy' | 'download';
  onClose?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeploymentPanel({ appId, sessionId, userId, initialTab = 'deploy', onClose }: DeploymentPanelProps) {
  return (
    <AnimatePresence>
      {initialTab === 'deploy' ? (
        <DeployModal appId={appId} sessionId={sessionId} userId={userId} onClose={onClose} />
      ) : (
        <DownloadModal appId={appId} sessionId={sessionId} userId={userId} onClose={onClose} />
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// DEPLOY MODAL (NETLIFY ONLY)
// ============================================================================

function DeployModal({ appId, sessionId, userId, onClose }: Omit<DeploymentPanelProps, 'initialTab'>) {
  const [netlifyToken, setNetlifyToken] = useState('');
  const [siteName, setSiteName] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  const handleDeploy = async () => {
    if (!netlifyToken) {
      alert('Please enter your Netlify access token');
      return;
    }

    setIsDeploying(true);

    try {
      // Step 1: Validate and save the token
      console.log('[Deploy] Validating Netlify token...');
      const validateResponse = await fetch('/api/netlify/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          token: netlifyToken
        })
      });

      const validateData = await validateResponse.json();

      if (!validateResponse.ok || !validateData.success) {
        alert(`Token validation failed: ${validateData.error || 'Invalid token'}`);
        setIsDeploying(false);
        return;
      }

      console.log('[Deploy] Token validated successfully!');

      // Step 2: Deploy to Netlify
      console.log('[Deploy] Starting deployment...');
      const deployResponse = await fetch('/api/netlify/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          userId,
          sessionId,
          siteName: siteName || undefined,
          deployTitle: siteName ? `Deploy ${siteName}` : 'Deploy from EitherWay',
          includeNodeModules: false
        })
      });

      const deployData = await deployResponse.json();

      if (!deployResponse.ok || !deployData.success) {
        alert(`Deployment failed: ${deployData.error || 'Unknown error'}`);
        setIsDeploying(false);
        return;
      }

      console.log('[Deploy] Deployment successful!', deployData.data);

      // Show success message with site URL
      const siteUrl = deployData.data.siteUrl || deployData.data.deployUrl;
      alert(`🎉 Deployment successful!\n\nYour site is live at:\n${siteUrl}\n\nAdmin URL:\n${deployData.data.adminUrl}`);

      // Optionally open the site in a new tab
      if (siteUrl) {
        window.open(siteUrl, '_blank');
      }

    } catch (error: any) {
      console.error('Deployment error:', error);
      alert(`Failed to deploy: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Deploy</h2>
            <p className="text-sm text-gray-400 mt-1">Choose where to deploy your application</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Web Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Web</h3>

            {/* Netlify Card */}
            <div className="bg-[#0e0e0e] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start gap-4">
                {/* Netlify Icon */}
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0 p-2">
                  <img
                    src="https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/netlify-icon.png"
                    alt="Netlify"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-white">Netlify</h4>
                  </div>

                  <p className="text-sm text-gray-400 mb-4">
                    Deploy your application to Netlify's global edge network with automatic SSL and CDN.
                  </p>

                  {/* Form Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Access Token *
                      </label>
                      <input
                        type="password"
                        value={netlifyToken}
                        onChange={(e) => setNetlifyToken(e.target.value)}
                        placeholder="Enter your Netlify access token"
                        className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00c7b7] focus:border-transparent"
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        Generate a token{' '}
                        <a
                          href="https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#authentication"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00c7b7] hover:underline"
                        >
                          here
                        </a>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Site Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        placeholder="my-awesome-site"
                        className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00c7b7] focus:border-transparent"
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        Leave empty for auto-generated name
                      </p>
                    </div>
                  </div>

                  {/* Deploy Button */}
                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying || !netlifyToken}
                    className="mt-4 w-full py-2.5 bg-gradient-to-r from-[#00c7b7] to-[#00a896] hover:from-[#00b3a6] hover:to-[#009688] disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {isDeploying ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Deploying...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span>Deploy to Netlify</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-blue-300 mb-1">Before deploying</h4>
                <ul className="text-xs text-blue-200/80 space-y-1">
                  <li>• Ensure your application is production-ready</li>
                  <li>• Your Netlify token needs deploy permissions</li>
                  <li>• Build process will run automatically</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </ModalOverlay>
  );
}

// ============================================================================
// DOWNLOAD MODAL
// ============================================================================

function DownloadModal({ appId, sessionId, userId, onClose }: Omit<DeploymentPanelProps, 'initialTab'>) {
  const [includeNodeModules, setIncludeNodeModules] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async () => {
    setIsExporting(true);

    try {
      const response = await fetch(`/api/apps/${appId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          includeNodeModules
        })
      });

      if (response.ok) {
        // Download ZIP file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `app-${appId}-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          alert(`Export failed: ${data.error || data.message || 'Unknown error'}`);
        } else {
          const text = await response.text();
          alert(`Export failed: ${text || `HTTP ${response.status}`}`);
        }
      }
    } catch (error: any) {
      console.error('Export error:', error);
      alert(`Failed to export: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Download</h2>
            <p className="text-sm text-gray-400 mt-1">Export your project files</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Export Options Section */}
          <div className="bg-[#0e0e0e] border border-gray-800 rounded-xl p-5 mb-4">
            <h3 className="text-base font-semibold text-white mb-4">Export Options</h3>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={includeNodeModules}
                  onChange={(e) => setIncludeNodeModules(e.target.checked)}
                  className="w-5 h-5 bg-[#1a1a1a] border-2 border-gray-700 rounded cursor-pointer appearance-none checked:bg-blue-600 checked:border-blue-600 transition-colors"
                />
                {includeNodeModules && (
                  <svg
                    className="w-3 h-3 text-white absolute pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                  Include node_modules
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  By default, node_modules and .env files are excluded for security and file size reasons.
                </p>
              </div>
            </label>
          </div>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/20"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Preparing download...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download ZIP</span>
              </>
            )}
          </button>

          {/* What's Included Section */}
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-emerald-300 mb-2">What's Included</h4>
                <ul className="text-xs text-emerald-200/80 space-y-1.5">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">•</span>
                    <span>All application source files</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">•</span>
                    <span>README with setup instructions</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">•</span>
                    <span>Configuration files (package.json, etc.)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">•</span>
                    <span>Compressed for faster download</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </ModalOverlay>
  );
}

// ============================================================================
// MODAL OVERLAY COMPONENT
// ============================================================================

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      {children}
    </motion.div>
  );
}
