/**
 * Deployment & Download Modals
 *
 * Modern modals for deployment to Netlify and downloading project files
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// TYPES

interface DeploymentPanelProps {
  appId: string;
  sessionId: string;
  userId: string;
  initialTab?: 'deploy' | 'download';
  onClose?: () => void;
}

// MAIN COMPONENT

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

// DEPLOY MODAL (NETLIFY ONLY)

interface DeployResult {
  siteId: string;
  deployId: string;
  siteUrl: string;
  adminUrl: string;
  deployUrl: string;
}

function DeployModal({ appId, sessionId, userId, onClose }: Omit<DeploymentPanelProps, 'initialTab'>) {
  const [netlifyToken, setNetlifyToken] = useState('');
  const [siteName, setSiteName] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!netlifyToken) {
      setError('Please enter your Netlify access token');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      // Step 1: Validate and save the token
      console.log('[Deploy] Validating Netlify token...');
      const validateResponse = await fetch('/api/netlify/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          token: netlifyToken,
        }),
      });

      const validateData = await validateResponse.json();

      if (!validateResponse.ok || !validateData.success) {
        setError(`Token validation failed: ${validateData.error || 'Invalid token'}`);
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
          includeNodeModules: false,
        }),
      });

      const deployData = await deployResponse.json();

      if (!deployResponse.ok || !deployData.success) {
        setError(`Deployment failed: ${deployData.error || 'Unknown error'}`);
        setIsDeploying(false);
        return;
      }

      console.log('[Deploy] Deployment successful!', deployData.data);

      setDeployResult(deployData.data);
      setIsDeploying(false);
    } catch (error: any) {
      console.error('Deployment error:', error);
      setError(`Failed to deploy: ${error.message}`);
      setIsDeploying(false);
    }
  };

  // Show success view if deployment completed
  if (deployResult) {
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
          {/* Success Header */}
          <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Deployment Successful!</h2>
                <p className="text-sm text-gray-400 mt-0.5">Your site is now live on Netlify</p>
              </div>
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

          {/* Success Content */}
          <div className="p-6">
            {/* URLs Section */}
            <div className="space-y-3 mb-6">
              <div className="bg-[#0e0e0e] border border-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-[#00c7b7] flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-400 mb-1">Production URL</p>
                    <a
                      href={deployResult.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#00c7b7] hover:text-[#00b3a6] break-all transition-colors"
                    >
                      {deployResult.siteUrl}
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-[#0e0e0e] border border-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-400 mb-1">Netlify Admin</p>
                    <a
                      href={deployResult.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 break-all transition-colors"
                    >
                      {deployResult.adminUrl}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => window.open(deployResult.siteUrl, '_blank')}
                className="flex-1 py-3 bg-gradient-to-r from-[#00c7b7] to-[#00a896] hover:from-[#00b3a6] hover:to-[#009688] text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#00c7b7]/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Open Site
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
              >
                Close
              </button>
            </div>

            {/* Deploy Info */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Deploy ID: {deployResult.deployId}</span>
                <span>Site ID: {deployResult.siteId.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        </motion.div>
      </ModalOverlay>
    );
  }

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
                      <label className="block text-sm font-medium text-gray-300 mb-2">Access Token *</label>
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
                      <label className="block text-sm font-medium text-gray-300 mb-2">Site Name (Optional)</label>
                      <input
                        type="text"
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        placeholder="my-awesome-site"
                        className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00c7b7] focus:border-transparent"
                      />
                      <p className="mt-1.5 text-xs text-gray-500">Leave empty for auto-generated name</p>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <div className="flex gap-2">
                        <svg
                          className="w-5 h-5 text-red-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    </div>
                  )}

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
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Deploying...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
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
              <svg
                className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
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

// DOWNLOAD MODAL

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
          includeNodeModules,
        }),
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
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Preparing download...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Download ZIP</span>
              </>
            )}
          </button>

          {/* What's Included Section */}
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg
                className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
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

// MODAL OVERLAY COMPONENT

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
