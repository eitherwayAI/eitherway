/**
 * Deployment & Download Modals
 *
 * Modern modals for deployment to Netlify, Vercel, GitHub and downloading project files
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// TYPES

interface DeploymentPanelProps {
  appId: string;
  sessionId: string;
  userId: string;
  initialTab?: 'deploy' | 'download';
  onClose?: () => void;
}

type DeployProvider = 'netlify' | 'vercel' | 'github';

interface DeployResult {
  provider: DeployProvider;
  siteId?: string;
  deployId?: string;
  siteUrl: string;
  adminUrl?: string;
  deployUrl?: string;
  projectId?: string;
  projectName?: string;
  repoUrl?: string;
  repoName?: string;
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

// DEPLOY MODAL (MULTI-PROVIDER)

function DeployModal({ appId, sessionId, userId, onClose }: Omit<DeploymentPanelProps, 'initialTab'>) {
  const [provider, setProvider] = useState<DeployProvider>('netlify');

  // Netlify state
  const [netlifyToken, setNetlifyToken] = useState('');
  const [siteName, setSiteName] = useState('');

  // Vercel state (now GitHub-integrated)
  const [vercelToken, setVercelToken] = useState('');
  const [vercelProjectName, setVercelProjectName] = useState('');

  // GitHub state
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoVisibility, setRepoVisibility] = useState<'public' | 'private'>('public');

  // Shared state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deployment status (persistent)
  const [deploymentStatus, setDeploymentStatus] = useState<{
    netlify: any | null;
    vercel: any | null;
    github: any | null;
  }>({
    netlify: null,
    vercel: null,
    github: null,
  });
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Fetch deployment status on mount
  useEffect(() => {
    const fetchDeploymentStatus = async () => {
      try {
        const response = await fetch(`/api/apps/${appId}/deploy/status`);
        const data = await response.json();
        if (data.success) {
          setDeploymentStatus(data.deployments);
        }
      } catch (error) {
        console.error('Failed to fetch deployment status:', error);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchDeploymentStatus();
  }, [appId]);

  const handleNetlifyDeploy = async () => {
    if (!netlifyToken) {
      setError('Please enter your Netlify access token');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      // Validate token
      const validateResponse = await fetch('/api/netlify/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token: netlifyToken }),
      });

      const validateData = await validateResponse.json();
      if (!validateResponse.ok || !validateData.success) {
        setError(`Token validation failed: ${validateData.error || 'Invalid token'}`);
        setIsDeploying(false);
        return;
      }

      // Deploy to Netlify
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

      setDeployResult({ provider: 'netlify', ...deployData.data });
      setIsDeploying(false);
      await refetchDeploymentStatus();
    } catch (error: any) {
      setError(`Failed to deploy: ${error.message}`);
      setIsDeploying(false);
    }
  };

  const handleVercelDeploy = async () => {
    if (!vercelToken) {
      setError('Please enter your Vercel access token');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      // First, validate and save the Vercel token
      const validateResponse = await fetch('/api/vercel/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token: vercelToken }),
      });

      const validateData = await validateResponse.json();
      if (!validateResponse.ok || !validateData.success) {
        setError(`Token validation failed: ${validateData.error || 'Invalid token'}`);
        setIsDeploying(false);
        return;
      }

      // Deploy to Vercel using REST API (no GitHub required)
      const deployResponse = await fetch('/api/vercel/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          userId,
          sessionId,
          projectName: vercelProjectName || undefined,
        }),
      });

      const deployData = await deployResponse.json();
      if (!deployResponse.ok || !deployData.success) {
        setError(`Deployment failed: ${deployData.error || 'Unknown error'}`);
        setIsDeploying(false);
        return;
      }

      setDeployResult({
        provider: 'vercel',
        siteUrl: deployData.data.deploymentUrl,
        deployUrl: deployData.data.inspectorUrl,
        projectId: deployData.data.deploymentId,
      });
      setIsDeploying(false);
      await refetchDeploymentStatus();
    } catch (error: any) {
      setError(`Failed to deploy: ${error.message}`);
      setIsDeploying(false);
    }
  };

  const handleGithubDeploy = async () => {
    if (!githubToken) {
      setError('Please enter your GitHub access token');
      return;
    }
    if (!repoName) {
      setError('Please enter a repository name');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      // Validate token
      const validateResponse = await fetch('/api/github/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token: githubToken }),
      });

      const validateData = await validateResponse.json();
      if (!validateResponse.ok || !validateData.success) {
        setError(`Token validation failed: ${validateData.error || 'Invalid token'}`);
        setIsDeploying(false);
        return;
      }

      // Create GitHub repo and push code
      const deployResponse = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          userId,
          sessionId,
          repo: repoName,
          visibility: repoVisibility,
          description: `EitherWay App - ${repoName}`,
        }),
      });

      const deployData = await deployResponse.json();
      if (!deployResponse.ok || !deployData.success) {
        setError(`Repository creation failed: ${deployData.error || 'Unknown error'}`);
        setIsDeploying(false);
        return;
      }

      setDeployResult({
        provider: 'github',
        siteUrl: deployData.data.htmlUrl,
        repoUrl: deployData.data.htmlUrl,
        repoName: deployData.data.fullName,
      });
      setIsDeploying(false);
      await refetchDeploymentStatus();
    } catch (error: any) {
      setError(`Failed to create repository: ${error.message}`);
      setIsDeploying(false);
    }
  };

  const handleDeploy = () => {
    if (provider === 'netlify') handleNetlifyDeploy();
    else if (provider === 'vercel') handleVercelDeploy();
    else if (provider === 'github') handleGithubDeploy();
  };

  const canDeploy = () => {
    if (provider === 'netlify') return !!netlifyToken;
    if (provider === 'vercel') return !!vercelToken;
    if (provider === 'github') return !!githubToken && !!repoName;
    return false;
  };

  const isAlreadyDeployed = () => {
    if (provider === 'netlify') return !!deploymentStatus.netlify;
    if (provider === 'vercel') return !!deploymentStatus.vercel;
    if (provider === 'github') return !!deploymentStatus.github;
    return false;
  };

  const getDeploymentInfo = () => {
    if (provider === 'netlify') return deploymentStatus.netlify;
    if (provider === 'vercel') return deploymentStatus.vercel;
    if (provider === 'github') return deploymentStatus.github;
    return null;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const refetchDeploymentStatus = async () => {
    try {
      const response = await fetch(`/api/apps/${appId}/deploy/status`);
      const data = await response.json();
      if (data.success) {
        setDeploymentStatus(data.deployments);
      }
    } catch (error) {
      console.error('Failed to refetch deployment status:', error);
    }
  };

  const getCurrentProviderResult = () => {
    if (!deployResult) return null;
    if (deployResult.provider === provider) return deployResult;
    return null;
  };

  const hasSuccessForCurrentProvider = () => {
    return !!getCurrentProviderResult();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-black rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Deploy</h2>
            <p className="text-sm text-gray-400 mt-1">Choose your deployment platform</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white opacity-80 hover:opacity-100 transition-opacity"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="px-6 pt-4 flex gap-2 border-b border-gray-800 relative">
          <button
            onClick={() => setProvider('netlify')}
            className={`flex-1 px-4 py-2 rounded-t-lg font-medium text-sm transition-all relative border border-b-0 border-gray-800 ${
              provider === 'netlify'
                ? 'bg-black text-[#00c7b7] z-10 translate-y-[-1px]'
                : 'bg-transparent text-gray-400 hover:text-[#00c7b7] z-0 translate-y-[1px]'
            }`}
          >
            Netlify
          </button>
          <button
            onClick={() => setProvider('vercel')}
            className={`flex-1 px-4 py-2 rounded-t-lg font-medium text-sm transition-all relative border border-b-0 border-gray-800 ${
              provider === 'vercel'
                ? 'bg-black text-white z-10 translate-y-[-1px]'
                : 'bg-transparent text-gray-400 hover:text-gray-300 z-0 translate-y-[1px]'
            }`}
          >
            Vercel
          </button>
          <button
            onClick={() => setProvider('github')}
            className={`flex-1 px-4 py-2 rounded-t-lg font-medium text-sm transition-all relative border border-b-0 border-gray-800 ${
              provider === 'github'
                ? 'bg-black text-purple-400 z-10 translate-y-[-1px]'
                : 'bg-transparent text-gray-400 hover:text-purple-400 z-0 translate-y-[1px]'
            }`}
          >
            GitHub
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[340px]">
          {/* Deployment Status (if already deployed) */}
          {!loadingStatus && isAlreadyDeployed() && getDeploymentInfo() && !hasSuccessForCurrentProvider() && (
            <div className="mb-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-emerald-300 mb-1.5">
                    Already deployed to {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </h3>
                  <div className="space-y-2">
                    {getDeploymentInfo().deploymentUrl && (
                      <div>
                        <p className="text-xs text-emerald-200/60 mb-0.5">Production URL:</p>
                        <a
                          href={getDeploymentInfo().deploymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-emerald-300 hover:text-emerald-200 break-all transition-colors inline-flex items-center gap-1"
                        >
                          {getDeploymentInfo().deploymentUrl}
                          <svg
                            className="w-3.5 h-3.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </div>
                    )}
                    {getDeploymentInfo().completedAt && (
                      <p className="text-xs text-emerald-200/60">
                        Deployed on {formatDate(getDeploymentInfo().completedAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Just Deployed Success Message (inline) */}
          {hasSuccessForCurrentProvider() && getCurrentProviderResult() && (
            <div className="mb-5">
              <div
                className={`bg-black border rounded-xl p-5 ${
                  provider === 'netlify'
                    ? 'border-[#00c7b7]'
                    : provider === 'vercel'
                      ? 'border-gray-700'
                      : 'border-purple-500'
                }`}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      provider === 'netlify'
                        ? 'bg-[#00c7b7]/20'
                        : provider === 'vercel'
                          ? 'bg-white/20'
                          : 'bg-purple-500/20'
                    }`}
                  >
                    <svg
                      className={`w-6 h-6 ${
                        provider === 'netlify'
                          ? 'text-[#00c7b7]'
                          : provider === 'vercel'
                            ? 'text-white'
                            : 'text-purple-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3
                      className={`text-lg font-semibold mb-1 ${
                        provider === 'netlify'
                          ? 'text-[#00c7b7]'
                          : provider === 'vercel'
                            ? 'text-white'
                            : 'text-purple-400'
                      }`}
                    >
                      {getCurrentProviderResult()!.provider === 'github'
                        ? 'Repository Created!'
                        : 'Deployment Successful!'}
                    </h3>
                    <p
                      className={`text-sm ${
                        provider === 'netlify'
                          ? 'text-[#00c7b7]/80'
                          : provider === 'vercel'
                            ? 'text-gray-300'
                            : 'text-purple-400/80'
                      }`}
                    >
                      {getCurrentProviderResult()!.provider === 'netlify' && 'Your site is now live on Netlify'}
                      {getCurrentProviderResult()!.provider === 'vercel' && 'Your site is now live on Vercel'}
                      {getCurrentProviderResult()!.provider === 'github' && 'Your code is now on GitHub'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div
                    className={`bg-black border rounded-lg p-3 ${
                      provider === 'netlify'
                        ? 'border-[#00c7b7]/30'
                        : provider === 'vercel'
                          ? 'border-gray-700'
                          : 'border-purple-500/30'
                    }`}
                  >
                    <p
                      className={`text-xs font-medium mb-1.5 ${
                        provider === 'netlify'
                          ? 'text-[#00c7b7]/60'
                          : provider === 'vercel'
                            ? 'text-gray-400'
                            : 'text-purple-400/60'
                      }`}
                    >
                      {getCurrentProviderResult()!.provider === 'github' ? 'Repository URL' : 'Production URL'}
                    </p>
                    <a
                      href={getCurrentProviderResult()!.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm break-all transition-colors inline-flex items-center gap-1.5 ${
                        provider === 'netlify'
                          ? 'text-[#00c7b7] hover:text-[#00b3a6]'
                          : provider === 'vercel'
                            ? 'text-white hover:text-gray-300'
                            : 'text-purple-400 hover:text-purple-300'
                      }`}
                    >
                      {getCurrentProviderResult()!.siteUrl}
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>

                  {getCurrentProviderResult()!.adminUrl && (
                    <div
                      className={`bg-black border rounded-lg p-3 ${
                        provider === 'netlify'
                          ? 'border-[#00c7b7]/30'
                          : provider === 'vercel'
                            ? 'border-gray-700'
                            : 'border-purple-500/30'
                      }`}
                    >
                      <p
                        className={`text-xs font-medium mb-1.5 ${
                          provider === 'netlify'
                            ? 'text-[#00c7b7]/60'
                            : provider === 'vercel'
                              ? 'text-gray-400'
                              : 'text-purple-400/60'
                        }`}
                      >
                        {getCurrentProviderResult()!.provider === 'netlify' ? 'Netlify Admin' : 'Dashboard'}
                      </p>
                      <a
                        href={getCurrentProviderResult()!.adminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-sm break-all transition-colors inline-flex items-center gap-1.5 ${
                          provider === 'netlify'
                            ? 'text-[#00c7b7] hover:text-[#00b3a6]'
                            : provider === 'vercel'
                              ? 'text-white hover:text-gray-300'
                              : 'text-purple-400 hover:text-purple-300'
                        }`}
                      >
                        {getCurrentProviderResult()!.adminUrl}
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => window.open(getCurrentProviderResult()!.siteUrl, '_blank')}
                    className={`flex-1 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm border ${
                      provider === 'netlify'
                        ? 'bg-gradient-to-r from-[#00c7b7] to-[#00a896] hover:from-[#00b3a6] hover:to-[#009688] text-white border-[#00c7b7]'
                        : provider === 'vercel'
                          ? 'bg-white hover:opacity-90 text-black border-gray-700'
                          : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-500'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    {getCurrentProviderResult()!.provider === 'github' ? 'Open Repository' : 'Open Site'}
                  </button>
                  <button
                    onClick={() => setDeployResult(null)}
                    className="px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg font-medium transition-colors text-sm border border-gray-700"
                  >
                    Deploy Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Netlify Form */}
          {provider === 'netlify' && !hasSuccessForCurrentProvider() && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Access Token *</label>
                <input
                  type="password"
                  value={netlifyToken}
                  onChange={(e) => setNetlifyToken(e.target.value)}
                  placeholder="Enter your Netlify access token"
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00c7b7] focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Generate a token{' '}
                  <a
                    href="https://app.netlify.com/user/applications/personal"
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
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00c7b7] focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">Leave empty for auto-generated name</p>
              </div>
            </div>
          )}

          {/* Vercel Form */}
          {provider === 'vercel' && !hasSuccessForCurrentProvider() && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Vercel Token *</label>
                <input
                  type="password"
                  value={vercelToken}
                  onChange={(e) => setVercelToken(e.target.value)}
                  placeholder="Enter your Vercel access token"
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Generate a token{' '}
                  <a
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:underline"
                  >
                    here
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Project Name <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vercelProjectName}
                  onChange={(e) => setVercelProjectName(e.target.value)}
                  placeholder="my-vercel-project"
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">Custom project name (auto-generated if not provided)</p>
              </div>
            </div>
          )}

          {/* GitHub Form */}
          {provider === 'github' && !hasSuccessForCurrentProvider() && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Access Token *</label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="Enter your GitHub personal access token"
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Generate a token with repo scope{' '}
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:underline"
                  >
                    here
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Repository Name *</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-awesome-repo"
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Visibility</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRepoVisibility('public')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      repoVisibility === 'public'
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-black border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Public
                  </button>
                  <button
                    onClick={() => setRepoVisibility('private')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      repoVisibility === 'private'
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-black border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Private
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && !hasSuccessForCurrentProvider() && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
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
          {!hasSuccessForCurrentProvider() && (
            <button
              onClick={handleDeploy}
              disabled={isDeploying || !canDeploy()}
              className={`mt-6 w-full py-3 rounded-xl font-medium transition-all text-sm flex items-center justify-center gap-2 border ${
                provider === 'netlify'
                  ? 'bg-gradient-to-r from-[#00c7b7] to-[#00a896] hover:opacity-100 disabled:hover:opacity-80 opacity-80 text-white shadow-lg shadow-[#00c7b7]/20 border-[#00c7b7] disabled:bg-black disabled:border-gray-800 disabled:from-black disabled:to-black disabled:shadow-none disabled:cursor-not-allowed disabled:text-white'
                  : provider === 'vercel'
                    ? 'bg-white hover:opacity-100 disabled:hover:opacity-80 opacity-80 text-black border-gray-700 disabled:bg-black disabled:border-gray-800 disabled:cursor-not-allowed disabled:text-white'
                    : 'bg-purple-600 hover:opacity-100 disabled:hover:opacity-80 opacity-80 text-white border-purple-500 disabled:bg-black disabled:border-gray-800 disabled:cursor-not-allowed disabled:text-white'
              }`}
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
                  <span>{provider === 'github' ? 'Creating repository...' : 'Deploying...'}</span>
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
                  <span>
                    {isAlreadyDeployed() ? (
                      <>
                        {provider === 'netlify' && 'Deploy Again to Netlify'}
                        {provider === 'vercel' && 'Deploy Again to Vercel'}
                        {provider === 'github' && 'Create New Repository'}
                      </>
                    ) : (
                      <>
                        {provider === 'netlify' && 'Deploy to Netlify'}
                        {provider === 'vercel' && 'Deploy to Vercel'}
                        {provider === 'github' && 'Create Repository'}
                      </>
                    )}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Info Box */}
          {!hasSuccessForCurrentProvider() && (
            <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
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
                    <li>
                      •{' '}
                      {provider === 'github'
                        ? 'Token needs repo creation permissions'
                        : 'Your token needs deployment permissions'}
                    </li>
                    <li>
                      •{' '}
                      {provider === 'github'
                        ? 'Files will be committed to the repository'
                        : 'Build process will run automatically'}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
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
        className="bg-black rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-800"
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
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white opacity-80 hover:opacity-100 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Export Options Section */}
          <div className="bg-black border border-gray-800 rounded-xl p-5 mb-4">
            <h3 className="text-base font-semibold text-white mb-4">Export Options</h3>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={includeNodeModules}
                  onChange={(e) => setIncludeNodeModules(e.target.checked)}
                  className="w-5 h-5 bg-black border-2 border-gray-700 rounded cursor-pointer appearance-none checked:bg-blue-600 checked:border-blue-600 transition-colors"
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
