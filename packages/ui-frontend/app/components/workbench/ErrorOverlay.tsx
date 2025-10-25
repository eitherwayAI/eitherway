/**
 * ErrorOverlay Component
 * Displays a user-friendly overlay when preview errors occur
 * Provides one-click automatic fixing via direct agent WebSocket communication
 */
import { useState } from 'react';

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
   * Build AI-powered fix prompt with systematic diagnostic approach
   */
  const buildFixPrompt = (errorData: ErrorData): string => {
    const fileInfo = errorData.file ? `${errorData.file}:${errorData.line}:${errorData.column}` : 'unknown file';
    const errorMsg = errorData.message || 'Build error occurred';
    const stack = errorData.stack || '';

    return `🔧 AUTO-FIX MODE: Build Error Detected

ERROR:
${errorMsg}
File: ${fileInfo}

${stack ? `Stack Trace:\n${stack}\n\n` : ''}⚠️ MANDATORY DIAGNOSTIC PROTOCOL - FOLLOW EXACTLY:

STEP 1 (REQUIRED): READ THE FILE
Execute this command FIRST: either-view ${errorData.file || 'src/App.jsx'}
You MUST read the file before proceeding. Do NOT skip this step.

STEP 2 (REQUIRED): IDENTIFY ROOT CAUSE
${errorMsg.includes('Failed to resolve import') || errorMsg.includes('Cannot resolve') ? `
⚡ MISSING PACKAGE ERROR DETECTED
The package is not installed. You MUST:
1. Extract package name from error message
2. Run: bash command "npm install <package-name>"
3. Verify package.json contains the new package
Do NOT just remove the import - install the package!
` : ''}${errorMsg.includes('Unexpected token') || errorMsg.includes('expected') || errorMsg.includes('SyntaxError') ? `
⚡ SYNTAX ERROR DETECTED
Invalid JavaScript/JSX syntax at line ${errorData.line || 'unknown'}.
Common causes: missing ), }, ], >, comma, semicolon
You MUST use either-line-replace to fix the EXACT line shown.
` : ''}${errorMsg.includes('Cannot find module') || errorMsg.includes('does not exist') ? `
⚡ MISSING FILE ERROR
Required file doesn't exist. You MUST:
1. Check if path is correct
2. Create the file with either-write if needed
` : ''}
STEP 3 (REQUIRED): APPLY FIX
Execute the appropriate tool:
- Missing package → bash command "npm install <package>"
- Syntax error → either-line-replace on the exact line
- Missing file → either-write to create it
- Wrong import → Fix the import statement

STEP 4 (REQUIRED): REPORT
After fixing, explain in 1-2 sentences:
- What was wrong
- What you did to fix it
Keep it concise - user is waiting.

🚨 CRITICAL RULES:
1. You MUST use either-view FIRST - no exceptions
2. For packages: npm install is MANDATORY (don't just delete imports)
3. Fix ONLY the error - no refactoring, no extras
4. Use the EXACT tools mentioned above
5. Be fast - user needs the preview working NOW

Execute STEP 1 now: either-view ${errorData.file || 'src/App.jsx'}`;
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

      // Progress: Step 2 - Dispatching auto-fix to chat
      setFixProgress({ step: 2, message: 'Sending to AI...' });

      // Dispatch event to chat to send auto-fix prompt
      // This will make it stream in real-time in the chat UI
      window.dispatchEvent(new CustomEvent('chat:send-auto-fix', {
        detail: { prompt: fixPrompt }
      }));

      console.log('[ErrorOverlay] Auto-fix request sent to chat');

      // Listen for fix completion via file updates
      const handleFileUpdate = () => {
        console.log('[ErrorOverlay] Files updated - fix in progress');
        setFixProgress({ step: 3, message: 'AI is applying fixes...' });
      };

      const handlePreviewLoad = (event: MessageEvent) => {
        if (event.data.type === 'PREVIEW_LOADED') {
          console.log('[ErrorOverlay] ✅ Preview loaded successfully after fix!');
          setFixProgress({ step: 4, message: 'Fix verified!' });

          // Show success briefly then clear overlay
          setTimeout(() => {
            setFixing(false);
            setFixProgress({ step: 0, message: '' });
            onResolved();
          }, 1500);

          // Clean up listeners
          window.removeEventListener('webcontainer:file-updated', handleFileUpdate);
          window.removeEventListener('message', handlePreviewLoad);
        }
      };

      window.addEventListener('webcontainer:file-updated', handleFileUpdate);
      window.addEventListener('message', handlePreviewLoad);

      // Timeout if fix takes too long
      setTimeout(() => {
        setFixing(false);
        setFixProgress({ step: 0, message: '' });
        if (fixAttempts >= 2) {
          setFailedPermanently(true);
        }
        // Clean up listeners
        window.removeEventListener('webcontainer:file-updated', handleFileUpdate);
        window.removeEventListener('message', handlePreviewLoad);
      }, 60000); // 60 second timeout

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
            <p className="text-sm text-gray-400">
              Automatic fix attempts didn't resolve this issue. Please describe the problem in the chat.
            </p>
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
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Auto-Fix
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
