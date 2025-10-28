/**
 * ErrorOverlay Component v2.0
 * Displays a user-friendly overlay when preview errors occur
 * Provides one-click automatic fixing with comprehensive context
 *
 * Key improvements:
 * - Pre-injects file content (no need for agent to use either-view)
 * - Provides project file list for context
 * - Simplified, crystal-clear prompt (30 lines vs 120)
 * - Better error classification
 */
import { useState, useEffect } from 'react';
import { getWebContainerUnsafe } from '~/lib/webcontainer';

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
  isFixing?: boolean; // Track if auto-fix is already in progress from Preview
}

export function ErrorOverlay({ error, sessionId, onResolved, isFixing = false }: ErrorOverlayProps) {
  const [fixing, setFixing] = useState(isFixing); // Initialize with parent state
  const [fixAttempts, setFixAttempts] = useState(0);
  const [failedPermanently, setFailedPermanently] = useState(false);
  const [fixProgress, setFixProgress] = useState<{step: number; message: string}>({
    step: isFixing ? 3 : 0,  // If already fixing, start at step 3 (AI processing)
    message: isFixing ? 'AI is analyzing the error...' : ''
  });

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
   * Sync local fixing state with parent isFixing prop
   */
  useEffect(() => {
    if (isFixing && !fixing) {
      setFixing(true);
      setFixProgress({ step: 3, message: 'AI is analyzing the error...' });
      console.log('[ErrorOverlay] Auto-fix already in progress from parent');
    }
  }, [isFixing, fixing]);

  /**
   * Normalize file path to be relative (strip absolute path prefixes)
   */
  const normalizeFilePath = (filePath: string): string => {
    // Remove leading slashes and common absolute path prefixes
    let normalized = filePath
      .replace(/^\/+/, '') // Remove leading slashes
      .replace(/^home\/project\/+/, '') // Remove 'home/project/' prefix
      .replace(/\/+/g, '/'); // Replace multiple slashes with single slash

    console.log(`[ErrorOverlay] Path normalization: "${filePath}" -> "${normalized}"`);
    return normalized;
  };

  /**
   * Read file content from WebContainer
   */
  const readFileFromWebContainer = async (filePath: string): Promise<string | null> => {
    try {
      const wc = await getWebContainerUnsafe();
      const sessionRoot = `__session_${sessionId}__`;
      const normalizedPath = normalizeFilePath(filePath);
      const fullPath = `${sessionRoot}/${normalizedPath}`;

      console.log(`[ErrorOverlay] Reading file from: ${fullPath}`);
      const fileContent = await wc.fs.readFile(fullPath, 'utf-8');
      return fileContent;
    } catch (error) {
      console.warn(`[ErrorOverlay] Failed to read file ${filePath}:`, error);
      return null;
    }
  };

  /**
   * Get list of project files from WebContainer
   */
  const getProjectFiles = async (): Promise<string[]> => {
    try {
      const wc = await getWebContainerUnsafe();
      const sessionRoot = `__session_${sessionId}__`;
      const files: string[] = [];

      const walkDir = async (dir: string, prefix: string = '') => {
        try {
          const entries = await wc.fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            // Skip node_modules and hidden files
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
              await walkDir(`${dir}/${entry.name}`, relativePath);
            } else {
              files.push(relativePath);
            }
          }
        } catch (e) {
          // Directory read failed, skip
        }
      };

      await walkDir(sessionRoot);
      return files;
    } catch (error) {
      console.warn('[ErrorOverlay] Failed to get project files:', error);
      return [];
    }
  };

  /**
   * Classify error type for better handling
   */
  const classifyError = (errorMsg: string): 'syntax' | 'import' | 'runtime' | 'missing-file' | 'other' => {
    const lowerMsg = errorMsg.toLowerCase();

    if (lowerMsg.includes('unexpected token') ||
        lowerMsg.includes('expected') || // Matches "Expected" or "expected"
        lowerMsg.includes('syntaxerror') ||
        lowerMsg.includes('unexpected end of input') ||
        lowerMsg.includes('missing') ||
        lowerMsg.includes('unterminated')) {
      return 'syntax';
    }
    if (lowerMsg.includes('failed to resolve import') ||
        lowerMsg.includes('cannot resolve') ||
        lowerMsg.includes('cannot find module')) {
      return 'import';
    }
    if (lowerMsg.includes('does not exist') || lowerMsg.includes('not found')) {
      return 'missing-file';
    }
    if (lowerMsg.includes('is not a function') ||
        lowerMsg.includes('undefined') ||
        lowerMsg.includes('cannot read prop')) {
      return 'runtime';
    }
    return 'other';
  };

  /**
   * Build AI-powered fix prompt v2.0 - Simplified with embedded context
   */
  const buildFixPrompt = async (errorData: ErrorData): Promise<string> => {
    const fileInfo = errorData.file ? `${errorData.file}:${errorData.line}:${errorData.column}` : 'unknown file';
    const errorMsg = errorData.message || 'Build error occurred';
    const errorType = classifyError(errorMsg);

    // BUGFIX: Wrap async operations in try-catch to prevent component crashes
    let fileContent: string | null = null;
    let projectFiles: string[] = [];

    try {
      // Read the error file content
      fileContent = errorData.file ? await readFileFromWebContainer(errorData.file) : null;

      // Get project files list
      projectFiles = await getProjectFiles();
    } catch (error) {
      console.error('[ErrorOverlay] Failed to gather context (WebContainer may not be ready):', error);
      // Continue with fallback prompt - don't crash the component
    }

    // Build context section
    const fileSection = fileContent
      ? `📄 FILE CONTENT (${errorData.file}):
\`\`\`
${fileContent}
\`\`\``
      : `⚠️ Could not read file: ${errorData.file}
You will need to use either-view to read it.`;

    const projectContext = projectFiles.length > 0
      ? `📁 PROJECT FILES:
${projectFiles.slice(0, 20).join('\n')}${projectFiles.length > 20 ? `\n... and ${projectFiles.length - 20} more files` : ''}`
      : '';

    // Build error-specific guidance
    let guidance = '';
    switch (errorType) {
      case 'syntax':
        guidance = `🎯 THIS IS A SYNTAX ERROR
⚠️ CRITICAL: Line ${errorData.line} has a syntax error, BUT there may be MORE syntax errors in the file!
Scan the ENTIRE file for ALL syntax errors:
- Missing closing tags: >, />, }, ), ]
- Unclosed strings or template literals
- Missing commas in arrays/objects
- Typos in function names (e.g., "createRoots" should be "createRoot")
Fix ALL syntax errors you find in ONE edit to avoid multiple rebuild cycles.`;
        break;

      case 'import':
        guidance = `🎯 THIS IS AN IMPORT ERROR
The import statement is wrong. Check:
1. Is the import path correct? (check PROJECT FILES above)
2. Is it a named vs default import mismatch?
3. Does the imported file exist? If not, you may need to create it.`;
        break;

      case 'runtime':
        guidance = `🎯 THIS IS A RUNTIME ERROR
The code has a logic error. Common causes:
- Typo in function/variable name
- Wrong API usage (e.g., createRoots instead of createRoot)
- Missing imports`;
        break;

      case 'missing-file':
        guidance = `🎯 THIS IS A MISSING FILE ERROR
The file doesn't exist. You need to create it with either-write.`;
        break;

      default:
        guidance = `🎯 ERROR TYPE: ${errorType}
Analyze the error and fix accordingly.`;
    }

    return `🔧 AUTO-FIX REQUEST

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🐛 ERROR DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: ${fileInfo}
Message: ${errorMsg}

${guidance}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTEXT PROVIDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${fileSection}

${projectContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${fileContent
  ? `The file content is provided above. Fix the error using either-line-replace.`
  : `Read the file first with either-view, then fix the error.`}

${errorType === 'syntax' ? '⚠️ IMPORTANT: Scan the ENTIRE file for ALL syntax errors, not just the one at the error line!' : ''}
${errorType === 'import' ? '⚠️ IMPORTANT: Check if the imported file exists in PROJECT FILES. If not, you may need to create it.' : ''}

🎯 PROACTIVE ERROR DETECTION:
After fixing this file, use either-view to check OTHER project files for errors:
${projectFiles.filter(f => f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.ts')).slice(0, 10).map(f => `- ${f}`).join('\n')}

If you find syntax errors, import errors, or other issues in these files, FIX THEM ALL in this same response.
This prevents the user from having to click "AI Auto-Fix" multiple times.

Fix the issue quickly and thoroughly. The user is waiting for the preview to work.`;
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

      // Progress: Step 2 - Building context
      setFixProgress({ step: 2, message: 'Reading file and gathering context...' });

      // Build the fix prompt with embedded context (async now)
      const fixPrompt = await buildFixPrompt(error);
      console.log('[ErrorOverlay] Fix prompt generated with embedded context');

      // Log prompt for testing/debugging
      if (import.meta.env.DEV) {
        console.log('[ErrorOverlay] 📋 Generated Prompt:\n', fixPrompt);
        console.log('[ErrorOverlay] 📊 Prompt Stats:', {
          length: fixPrompt.length,
          errorType: classifyError(error.message),
          hasFileContent: fixPrompt.includes('FILE CONTENT'),
          hasProjectFiles: fixPrompt.includes('PROJECT FILES'),
          hasErrorGuidance: fixPrompt.includes('🎯'),
        });

        // Dispatch event for test harness
        window.dispatchEvent(new CustomEvent('autofixer:prompt-generated', {
          detail: { prompt: fixPrompt, error, sessionId }
        }));
      }

      // Progress: Step 3 - Dispatching auto-fix to chat
      setFixProgress({ step: 3, message: 'Sending to AI...' });

      // Dispatch event to chat to send auto-fix prompt
      // This will make it stream in real-time in the chat UI
      window.dispatchEvent(new CustomEvent('chat:send-auto-fix', {
        detail: { prompt: fixPrompt }
      }));

      console.log('[ErrorOverlay] Auto-fix request sent to chat');

      // Listen for fix completion via file updates
      const handleFileUpdate = () => {
        console.log('[ErrorOverlay] Files updated - fix in progress');
        setFixProgress({ step: 4, message: 'AI is applying fixes...' });
      };

      const handlePreviewLoad = (event: MessageEvent) => {
        if (event.data.type === 'PREVIEW_LOADED') {
          console.log('[ErrorOverlay] ✅ Preview loaded successfully after fix!');
          setFixProgress({ step: 5, message: 'Fix verified!' });

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
                  style={{ width: `${(fixProgress.step / 5) * 100}%` }}
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
