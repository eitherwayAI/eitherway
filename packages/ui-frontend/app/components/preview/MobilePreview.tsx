/**
 * Mobile Preview Component
 *
 * iPhone 17 Pro Max Preview with PWA Validation
 * - Device: iPhone 17 Pro Max (430×932 logical pixels, 3x retina)
 * - Orientation: Portrait/Landscape toggle
 * - PWA Status: Real-time validation display
 */

import { useState, useEffect } from 'react';

// TYPES

interface PWAValidationResult {
  status: 'passed' | 'failed' | 'warning';
  overall_score: number;
  manifest_score: number;
  service_worker_score: number;
  icons_score: number;
  manifest_valid: boolean;
  service_worker_registered: boolean;
  icons_valid: boolean;
  is_https: boolean;
  has_viewport_meta: boolean;
  offline_ready: boolean;
  validation_errors: string[];
  manifest_errors: string[];
  manifest_warnings: string[];
  service_worker_errors: string[];
}

interface MobilePreviewProps {
  previewUrl: string;
  appId: string;
  sessionId: string;
  onClose?: () => void;
}

// CONSTANTS

const IPHONE_17_PRO_MAX = {
  name: 'iPhone 17 Pro Max',
  width: 430, // Logical pixels (portrait)
  height: 932, // Logical pixels (portrait)
  pixelRatio: 3.0,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  borderRadius: 60,
  notchHeight: 30,
};

// MOBILE PREVIEW COMPONENT

export function MobilePreview({ previewUrl, appId, sessionId, onClose }: MobilePreviewProps) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pwaValidation, setPwaValidation] = useState<PWAValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showPwaDetails, setShowPwaDetails] = useState(false);

  const width = orientation === 'portrait' ? IPHONE_17_PRO_MAX.width : IPHONE_17_PRO_MAX.height;
  const height = orientation === 'portrait' ? IPHONE_17_PRO_MAX.height : IPHONE_17_PRO_MAX.width;

  // Scale factor to fit on screen (max 90% of viewport)
  const scale = Math.min((window.innerWidth * 0.5) / width, (window.innerHeight * 0.85) / height, 1);

  /**
   * Run PWA validation
   */
  const runPWAValidation = async () => {
    setIsValidating(true);
    try {
      const response = await fetch(`/api/apps/${appId}/preview/pwa/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: sessionId,
          url: previewUrl,
        }),
      });

      const data = await response.json();
      if (data.success && data.validation) {
        setPwaValidation({
          status: data.validation.status,
          overall_score: data.validation.overall_score,
          manifest_score: data.validation.manifest_score,
          service_worker_score: data.validation.service_worker_score,
          icons_score: data.validation.icons_score,
          manifest_valid: data.validation.manifest_valid,
          service_worker_registered: data.validation.service_worker_registered,
          icons_valid: data.validation.icons_valid,
          is_https: data.validation.is_https,
          has_viewport_meta: data.validation.has_viewport_meta,
          offline_ready: data.validation.offline_ready,
          validation_errors: data.validation.validation_errors,
          manifest_errors: data.validation.manifest_errors,
          manifest_warnings: data.validation.manifest_warnings,
          service_worker_errors: data.validation.service_worker_errors,
        });
      }
    } catch (error: any) {
      console.error('PWA validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    const loadLatestValidation = async () => {
      try {
        const response = await fetch(`/api/apps/${appId}/preview/pwa/latest`);
        const data = await response.json();
        if (data.success && data.validation) {
          setPwaValidation(data.validation);
        }
      } catch (error) {
        console.error('Failed to load latest validation:', error);
      }
    };

    loadLatestValidation();
  }, [appId]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] flex overflow-hidden">
        {/* Left Panel - Device Preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-900 to-gray-800">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between w-full max-w-2xl">
            <div>
              <h2 className="text-2xl font-bold text-white">{IPHONE_17_PRO_MAX.name}</h2>
              <p className="text-sm text-gray-400">
                {width}×{height} @ {IPHONE_17_PRO_MAX.pixelRatio}x
              </p>
            </div>

            <div className="flex gap-2">
              {/* Orientation Toggle */}
              <button
                onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {orientation === 'portrait' ? 'Portrait' : 'Landscape'}
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Device Frame */}
          <div
            className="relative bg-black rounded-[3rem] shadow-2xl border-[14px] border-gray-800 transition-all duration-500 ease-in-out"
            style={{
              width: `${width}px`,
              height: `${height}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
            {/* Notch (portrait only) */}
            {orientation === 'portrait' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-10"></div>
            )}

            {/* Screen */}
            <div className="absolute inset-0 overflow-hidden rounded-[2.5rem]">
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Mobile Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>

            {/* Home Indicator (bottom bar) */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full"></div>
          </div>
        </div>

        {/* Right Panel - PWA Validation */}
        <div className="w-96 bg-gray-800 p-6 overflow-y-auto border-l border-gray-700">
          <h3 className="text-xl font-bold text-white mb-4">PWA Validation</h3>

          {/* Validate Button */}
          <button
            onClick={runPWAValidation}
            disabled={isValidating}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors mb-6"
          >
            {isValidating ? 'Validating...' : 'Run PWA Check'}
          </button>

          {/* Validation Results */}
          {pwaValidation && (
            <div className="space-y-4">
              {/* Overall Score */}
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-400">Overall Score</span>
                  <span
                    className={`text-2xl font-bold ${
                      pwaValidation.overall_score >= 90
                        ? 'text-green-400'
                        : pwaValidation.overall_score >= 60
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}
                  >
                    {pwaValidation.overall_score}/100
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      pwaValidation.overall_score >= 90
                        ? 'bg-green-500'
                        : pwaValidation.overall_score >= 60
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${pwaValidation.overall_score}%` }}
                  ></div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    pwaValidation.status === 'passed'
                      ? 'bg-green-900 text-green-200'
                      : pwaValidation.status === 'warning'
                        ? 'bg-yellow-900 text-yellow-200'
                        : 'bg-red-900 text-red-200'
                  }`}
                >
                  {pwaValidation.status.toUpperCase()}
                </div>
              </div>

              {/* Component Scores */}
              <div className="space-y-2">
                <ScoreBar label="Manifest" score={pwaValidation.manifest_score} max={40} />
                <ScoreBar label="Service Worker" score={pwaValidation.service_worker_score} max={30} />
                <ScoreBar label="Icons" score={pwaValidation.icons_score} max={20} />
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                <CheckItem label="HTTPS Enabled" checked={pwaValidation.is_https} />
                <CheckItem label="Manifest Valid" checked={pwaValidation.manifest_valid} />
                <CheckItem label="Service Worker" checked={pwaValidation.service_worker_registered} />
                <CheckItem label="Icons Valid" checked={pwaValidation.icons_valid} />
                <CheckItem label="Viewport Meta" checked={pwaValidation.has_viewport_meta} />
                <CheckItem label="Offline Ready" checked={pwaValidation.offline_ready} />
              </div>

              {/* Errors & Warnings */}
              {(pwaValidation.validation_errors.length > 0 ||
                pwaValidation.manifest_errors.length > 0 ||
                pwaValidation.service_worker_errors.length > 0) && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Errors</h4>
                  <ul className="text-xs text-red-300 space-y-1">
                    {[
                      ...pwaValidation.validation_errors,
                      ...pwaValidation.manifest_errors,
                      ...pwaValidation.service_worker_errors,
                    ].map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pwaValidation.manifest_warnings.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-2">Warnings</h4>
                  <ul className="text-xs text-yellow-300 space-y-1">
                    {pwaValidation.manifest_warnings.map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Details Toggle */}
              <button
                onClick={() => setShowPwaDetails(!showPwaDetails)}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                {showPwaDetails ? 'Hide' : 'Show'} Details
              </button>

              {showPwaDetails && (
                <div className="bg-gray-900 rounded-lg p-4 text-xs text-gray-300 font-mono">
                  <pre className="whitespace-pre-wrap overflow-x-auto">{JSON.stringify(pwaValidation, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {!pwaValidation && !isValidating && (
            <div className="text-center text-gray-500 mt-8">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p>Run PWA validation to check your app</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const percentage = (score / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>
          {score}/{max}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-5 h-5 rounded flex items-center justify-center ${checked ? 'bg-green-600' : 'bg-red-600'}`}>
        {checked ? (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <span className={checked ? 'text-green-400' : 'text-red-400'}>{label}</span>
    </div>
  );
}
