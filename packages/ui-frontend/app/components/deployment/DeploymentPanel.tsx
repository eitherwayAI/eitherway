/**
 * Deployment Panel Component
 *
 * Handles GitHub Pages deployment and ZIP export with real-time status tracking.
 */

import { useState, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface Deployment {
  id: string;
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';
  deployment_url: string | null;
  repository_url: string | null;
  branch: string;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface DeploymentPanelProps {
  appId: string;
  sessionId: string;
  userId: string;
  initialTab?: 'deploy' | 'export' | 'history';
  onClose?: () => void;
}

// ============================================================================
// DEPLOYMENT PANEL COMPONENT
// ============================================================================

export function DeploymentPanel({ appId, sessionId, userId, initialTab = 'deploy', onClose }: DeploymentPanelProps) {
  const [activeTab, setActiveTab] = useState<'deploy' | 'export' | 'history'>(initialTab);

  // Deploy tab state
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('gh-pages');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDirectory, setOutputDirectory] = useState('dist');
  const [isDeploying, setIsDeploying] = useState(false);

  // History state
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [includeNodeModules, setIncludeNodeModules] = useState(false);

  /**
   * Load deployment history
   */
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/apps/${appId}/deploy/history?limit=10`);
      const data = await response.json();
      if (data.success) {
        setDeployments(data.deployments);
      }
    } catch (error) {
      console.error('Failed to load deployment history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  /**
   * Deploy to GitHub Pages
   */
  const handleDeploy = async () => {
    if (!repositoryUrl) {
      alert('Please enter a GitHub repository URL');
      return;
    }

    setIsDeploying(true);

    try {
      const response = await fetch(`/api/apps/${appId}/deploy/github-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          repositoryUrl,
          branch,
          buildCommand,
          outputDirectory
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Deployment started! Check the history tab for progress.');
        setActiveTab('history');
        loadHistory();
      } else {
        alert(`Deployment failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Deployment error:', error);
      alert(`Failed to start deployment: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  /**
   * Export to ZIP
   */
  const handleExport = async () => {
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
        // Check if response is JSON before parsing
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

  /**
   * Load history when switching to history tab
   */
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full my-4 flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Deploy & Export</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('deploy')}
            className={`flex-1 py-3 px-6 font-medium transition-colors ${
              activeTab === 'deploy'
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            GitHub Pages
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-3 px-6 font-medium transition-colors ${
              activeTab === 'export'
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            Export ZIP
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 px-6 font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Deploy Tab */}
          {activeTab === 'deploy' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  GitHub Repository URL *
                </label>
                <input
                  type="text"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  placeholder="https://github.com/username/repo.git"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The GitHub repository where your app will be deployed
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="gh-pages"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Deployment branch (usually 'gh-pages')
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Build Command
                </label>
                <input
                  type="text"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="npm run build"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Command to build your application
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Output Directory
                </label>
                <input
                  type="text"
                  value={outputDirectory}
                  onChange={(e) => setOutputDirectory(e.target.value)}
                  placeholder="dist"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Directory containing built files
                </p>
              </div>

              <button
                onClick={handleDeploy}
                disabled={isDeploying || !repositoryUrl}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isDeploying ? 'Deploying...' : 'Deploy to GitHub Pages'}
              </button>

              <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">📋 Requirements</h4>
                <ul className="text-xs text-blue-300 space-y-1">
                  <li>• Repository must exist on GitHub</li>
                  <li>• You must have push access to the repository</li>
                  <li>• Git must be configured with authentication</li>
                  <li>• Build command must generate static files</li>
                </ul>
              </div>
            </div>
          )}

          {/* Export Tab */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-800 rounded-lg">
                <h3 className="text-lg font-semibold text-white mb-4">Export Options</h3>

                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="includeNodeModules"
                    checked={includeNodeModules}
                    onChange={(e) => setIncludeNodeModules(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="includeNodeModules" className="ml-2 text-sm text-gray-300">
                    Include node_modules
                  </label>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                  By default, node_modules and .env files are excluded for security and file size reasons.
                </p>
              </div>

              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Exporting...</span>
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

              <div className="mt-6 p-4 bg-green-900/20 border border-green-700 rounded-lg">
                <h4 className="text-sm font-semibold text-green-400 mb-2">📦 What's Included</h4>
                <ul className="text-xs text-green-300 space-y-1">
                  <li>• All application source files</li>
                  <li>• README with setup instructions</li>
                  <li>• Configuration files (package.json, etc.)</li>
                  <li>• Compressed for faster download</li>
                </ul>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {isLoadingHistory ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading history...
                </div>
              ) : deployments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p>No deployments yet</p>
                </div>
              ) : (
                deployments.map((deployment) => (
                  <div key={deployment.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={deployment.status} />
                        <span className="text-sm text-gray-400">
                          {new Date(deployment.created_at).toLocaleString()}
                        </span>
                      </div>
                      {deployment.duration_ms && (
                        <span className="text-xs text-gray-500">
                          {(deployment.duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {deployment.repository_url && (
                      <p className="text-sm text-gray-300 mb-2">{deployment.repository_url}</p>
                    )}

                    {deployment.deployment_url && deployment.status === 'success' && (
                      <a
                        href={deployment.deployment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <span>{deployment.deployment_url}</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}

                    {deployment.error_message && (
                      <p className="text-sm text-red-400 mt-2">{deployment.error_message}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: Deployment['status'] }) {
  const colors = {
    pending: 'bg-gray-700 text-gray-300',
    building: 'bg-yellow-900 text-yellow-200',
    deploying: 'bg-blue-900 text-blue-200',
    success: 'bg-green-900 text-green-200',
    failed: 'bg-red-900 text-red-200',
    cancelled: 'bg-gray-700 text-gray-400'
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}
