/**
 * ErrorOverlay Component
 * Displays a user-friendly overlay when preview errors occur
 * Provides one-click automatic fixing via direct agent WebSocket communication
 */
import { useState } from 'react';
import { streamFromWebSocket } from '~/utils/websocketClient';

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
   * Cycling motivational phrases for fix attempts
   */
  const getMotivationalPhrase = (attemptNumber: number): string => {
    const phrases = [
      "Analyzing the issue...",
      "Finding the root cause...",
      "Diving deeper into the code...",
      "Exploring alternative solutions...",
      "Double-checking the fix...",
      "Almost there...",
      "One more try...",
    ];
    return phrases[attemptNumber % phrases.length];
  };

  /**
   * Build fix prompt from error data
   */
  const buildFixPrompt = (errorData: ErrorData): string => {
    const fileInfo = errorData.file
      ? `\nFILE: ${errorData.file}:${errorData.line}:${errorData.column}`
      : '';

    const stackInfo = errorData.stack
      ? `\n\nSTACK TRACE:\n${errorData.stack}`
      : '';

    return `The preview encountered a build error. Please fix it immediately.

ERROR:
${errorData.message}${fileInfo}${stackInfo}

Please identify and fix the issue. Common causes:
- Missing dependencies (run npm install)
- Wrong import paths
- Syntax errors
- Missing files
- Configuration issues
- Type errors

Fix now without asking me anything.`;
  };

  /**
   * Attempt to automatically fix the error by triggering the agent via WebSocket
   */
  const handleFix = async () => {
    if (fixAttempts >= 3) {
      setFailedPermanently(true);
      return;
    }

    const currentAttempt = fixAttempts;
    setFixing(true);
    setFixAttempts(prev => prev + 1);

    try {
      // Progress: Step 1 - Show motivational phrase
      setFixProgress({ step: 1, message: getMotivationalPhrase(currentAttempt) });
      console.log('[ErrorOverlay] Starting AI fix for session:', sessionId);
      console.log('[ErrorOverlay] Error data:', error);

      await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX

      // Build the fix prompt
      const fixPrompt = buildFixPrompt(error);
      console.log('[ErrorOverlay] Fix prompt:', fixPrompt);

      // Progress: Step 2 - Triggering AI agent
      setFixProgress({ step: 2, message: 'AI agent is analyzing...' });

      let agentStartedFixing = false;

      // Trigger the agent via WebSocket (same as sending a chat message)
      await streamFromWebSocket({
        prompt: fixPrompt,
        sessionId,
        onChunk: (chunk) => {
          // Agent is responding - we're making progress
          if (!agentStartedFixing) {
            agentStartedFixing = true;
            setFixProgress({ step: 3, message: 'AI is applying fixes...' });
          }
        },
        onPhase: (phase) => {
          console.log('[ErrorOverlay] Agent phase:', phase);
          if (phase === 'code-writing') {
            setFixProgress({ step: 3, message: 'Writing code fixes...' });
          } else if (phase === 'building') {
            setFixProgress({ step: 4, message: 'Building and testing...' });
          }
        },
        onFilesUpdated: (files) => {
          console.log('[ErrorOverlay] Files updated, triggering preview reload:', files);
          setFixProgress({ step: 4, message: 'Reloading preview...' });

          // Dispatch event to trigger Preview component reload
          window.dispatchEvent(new CustomEvent('webcontainer:file-updated'));

          // Give the preview time to reload
          setTimeout(() => {
            setFixing(false);
            setFixProgress({ step: 0, message: '' });
            // onResolved will be called when preview loads successfully
          }, 2000);
        },
        onComplete: () => {
          console.log('[ErrorOverlay] Agent finished processing fix');

          // If files weren't updated via onFilesUpdated, still finish gracefully
          setTimeout(() => {
            setFixing(false);
            setFixProgress({ step: 0, message: '' });
          }, 2000);
        },
        onError: (errorMsg) => {
          console.error('[ErrorOverlay] Agent error:', errorMsg);
          setFixing(false);
          setFixProgress({ step: 0, message: '' });

          // Don't mark as permanently failed on first error
          if (fixAttempts >= 2) {
            setFailedPermanently(true);
          }
        },
      });

    } catch (err) {
      console.error('[ErrorOverlay] Error during fix attempt:', err);
      setFixing(false);
      setFixProgress({ step: 0, message: '' });

      // Don't mark as permanently failed unless we've tried multiple times
      if (fixAttempts >= 2) {
        setFailedPermanently(true);
      }
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
              {getMotivationalPhrase(fixAttempts - 1)}
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
