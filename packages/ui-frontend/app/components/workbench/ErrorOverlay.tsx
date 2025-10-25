/**
 * ErrorOverlay Component
 * Displays a user-friendly overlay when preview errors occur
 * Provides one-click automatic fixing
 */
import { useState, useEffect } from 'react';

interface ErrorData {
  message: string;
  stack?: string;
  source: string;
  timestamp: number;
  url?: string;
  file?: string;
  line?: number;
  column?: number;
}

interface ErrorOverlayProps {
  error: ErrorData;
  sessionId: string;
  onResolved: () => void;
}

export function ErrorOverlay({ error, sessionId, onResolved }: ErrorOverlayProps) {
  const [fixing, setFixing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [fixAttempts, setFixAttempts] = useState(0);
  const [failedPermanently, setFailedPermanently] = useState(false);
  const [fixProgress, setFixProgress] = useState<{step: number; message: string}>({ step: 0, message: '' });

  /**
   * Attempt to automatically fix the error
   */
  const handleFix = async () => {
    if (fixAttempts >= 3) {
      setFailedPermanently(true);
      return;
    }

    setFixing(true);
    setFixAttempts(prev => prev + 1);

    try {
      // Progress: Step 1 - Analyzing error
      setFixProgress({ step: 1, message: 'Analyzing error...' });
      console.log('[ErrorOverlay] Sending fix request for session:', sessionId);

      await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX

      const apiUrl = `/api/sessions/${sessionId}/fix-error`;
      console.log('[ErrorOverlay] Sending fix request to:', apiUrl);
      console.log('[ErrorOverlay] Session ID:', sessionId);
      console.log('[ErrorOverlay] Error data:', error);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error }),
      });

      console.log('[ErrorOverlay] Response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorData;
        const responseText = await response.text();
        console.error('[ErrorOverlay] Response text:', responseText);

        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }

        console.error('[ErrorOverlay] Fix request failed:', errorData);

        if (response.status === 400 && errorData.canRetry === false) {
          setFailedPermanently(true);
          setFixing(false);
          return;
        }

        throw new Error(errorData.error || `Fix request failed (${response.status})`);
      }

      console.log('[ErrorOverlay] Fix request sent successfully');

      // Progress: Step 2 - Generating fix
      setFixProgress({ step: 2, message: 'Generating fix with AI...' });

      // Progress: Step 3 - Applying changes
      setTimeout(() => {
        setFixProgress({ step: 3, message: 'Applying changes...' });
      }, 2000);

      // Progress: Step 4 - Verifying
      setTimeout(() => {
        setFixProgress({ step: 4, message: 'Verifying fix...' });
      }, 5000);

      // Wait for resolution - the preview will reload via HMR when files are updated
      // If error persists after 30 seconds, stop trying
      const timeout = setTimeout(() => {
        setFixing(false);
        setFixProgress({ step: 0, message: '' });
        console.log('[ErrorOverlay] Fix timeout - error may still be present');
      }, 30000);

      // Listen for successful preview reload
      const handlePreviewLoaded = () => {
        clearTimeout(timeout);
        setFixing(false);
        setFixProgress({ step: 0, message: '' });
        onResolved();
        console.log('[ErrorOverlay] Preview reloaded successfully - error resolved');
      };

      window.addEventListener('message', handlePreviewLoaded);

      return () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handlePreviewLoaded);
      };
    } catch (err) {
      console.error('[ErrorOverlay] Error during fix attempt:', err);
      setFixing(false);
      setFixProgress({ step: 0, message: '' });
    }
  };

  return (
    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-eitherway-elements-background-depth-2 rounded-lg p-8 max-w-md mx-4 border border-eitherway-elements-borderColor shadow-2xl">
        {fixing ? (
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-lg font-medium text-white">{fixProgress.message || 'Fixing...'}</p>
            <p className="text-sm text-gray-400 mt-2">
              {fixAttempts === 1 ? 'First attempt' : fixAttempts === 2 ? 'Second attempt' : 'Final attempt'}
            </p>
            {fixProgress.step > 0 && (
              <div className="mt-4 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-500 ease-out"
                  style={{ width: `${(fixProgress.step / 4) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        ) : failedPermanently ? (
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold mb-2 text-white">
              Need Manual Attention
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Automatic fix attempts didn't resolve this issue. Please describe the problem in the chat.
            </p>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {showDetails ? 'Hide' : 'Show'} error details
            </button>
            {showDetails && (
              <div className="mt-4 p-4 bg-gray-900 rounded text-left text-xs overflow-auto max-h-40 font-mono">
                <div className="text-red-400 mb-2">{error.message}</div>
                {error.file && (
                  <div className="text-gray-500 mb-2">
                    {error.file}:{error.line}:{error.column}
                  </div>
                )}
                {error.stack && (
                  <pre className="text-gray-600 whitespace-pre-wrap">{error.stack}</pre>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-5xl mb-4">🐛</div>
            <h3 className="text-xl font-semibold mb-2 text-white">
              Build Error Detected
            </h3>
            <p className="text-sm text-gray-400 mb-6 max-w-md">
              Your app has a build error that's preventing it from running. Click below to let AI fix it automatically.
            </p>

            <button
              onClick={handleFix}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg mb-3 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Auto-Fix
            </button>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              {showDetails ? '▼ Hide error details' : '▶ Show error details'}
            </button>

            {showDetails && (
              <div className="mt-4 p-4 bg-gray-900 rounded text-left text-xs overflow-auto max-h-40 font-mono border border-gray-800">
                <div className="text-red-400 font-semibold mb-2">{error.message}</div>
                {error.file && (
                  <div className="text-blue-400 mb-2">
                    📄 {error.file}
                    {error.line > 0 && <span className="text-gray-500"> (line {error.line}{error.column > 0 && `:${error.column}`})</span>}
                  </div>
                )}
                {error.stack && (
                  <pre className="text-gray-500 whitespace-pre-wrap mt-2 pt-2 border-t border-gray-800">{error.stack}</pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
