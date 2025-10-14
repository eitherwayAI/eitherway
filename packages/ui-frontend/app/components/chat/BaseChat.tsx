import type { Message } from 'ai';
import React, { type RefCallback, useState, useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { motion, AnimatePresence } from 'framer-motion';

import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { useWalletConnection } from '~/lib/web3/hooks';
import { ContentBlock1 } from '~/components/landing/ContentBlock1';
import { PricingBlock } from '~/components/landing/PricingBlock';
import { FaqBlock } from '~/components/landing/FaqBlockBlue';
import { LastBlock } from '~/components/landing/LastBlock';
import { Footer } from '~/components/landing/Footer';
import { AuthDialog } from '~/components/auth/AuthDialog';
import { brandKitStore } from '~/lib/stores/brandKit';
import { BACKEND_URL } from '~/config/api';

import styles from './BaseChat.module.scss';

interface BrandAsset {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Message[];
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  minTextareaHeight?: number;

  // Phase 2: Streaming indicators
  currentPhase?: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  reasoningText?: string;
  thinkingDuration?: number | null;
  fileOperations?: Array<{ operation: string; filePath: string }>;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;

  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
}

const EXAMPLE_PROMPTS = [{ text: 'Wallet' }, { text: 'Game' }, { text: 'Chat' }, { text: 'DeFi' }];

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages,
      input = '',
      minTextareaHeight = 131,

      // Phase 2: Streaming indicators
      currentPhase,
      reasoningText,
      thinkingDuration,
      fileOperations,
      tokenUsage,

      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
    },
    ref,
  ) => {
    const { isConnected } = useWalletConnection();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    console.log(chatStarted);

    const isPasswordVerified = () => {
      if (typeof window === 'undefined') {
        return false;
      }

      if (!isConnected) {
        return false;
      }

      const savedPassword = localStorage.getItem('daily_password_verified');

      if (!savedPassword) {
        return false;
      }

      try {
        const { timestamp } = JSON.parse(savedPassword);
        const now = new Date().getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        if (now - timestamp > sevenDays) {
          localStorage.removeItem('daily_password_verified');
          return false;
        }

        return true;
      } catch {
        localStorage.removeItem('daily_password_verified');
        return false;
      }
    };

    const handleAuthenticated = (message?: string) => {
      setIsAuthenticated(true);

      if (message && sendMessage) {
        const fakeEvent = {} as React.UIEvent;
        sendMessage(fakeEvent, message);
        setPendingMessage(null);
      }
    };

    const isUserAuthenticated = isAuthenticated || isPasswordVerified();

    const fetchBrandAssets = async () => {
      const { pendingBrandKitId } = brandKitStore.get();
      if (!pendingBrandKitId) {
        setBrandAssets([]);
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/api/brand-kits/${pendingBrandKitId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.brandKit?.assets) {
            setBrandAssets(data.brandKit.assets);
          }
        }
      } catch (err) {
        console.error('Failed to fetch brand assets:', err);
      }
    };

    const handleDeleteAsset = async (assetId: string) => {
      const { pendingBrandKitId } = brandKitStore.get();
      if (!pendingBrandKitId) return;

      try {
        const response = await fetch(`${BACKEND_URL}/api/brand-kits/${pendingBrandKitId}/assets/${assetId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          // Re-aggregate colors after deletion
          await fetch(`${BACKEND_URL}/api/brand-kits/${pendingBrandKitId}/aggregate-colors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });

          // Refresh assets
          await fetchBrandAssets();
        }
      } catch (err) {
        console.error('Failed to delete asset:', err);
      }
    };

    useEffect(() => {
      // Only show thumbnails before chat starts
      if (!chatStarted) {
        fetchBrandAssets();
      } else {
        // Clear thumbnails once chat has started
        setBrandAssets([]);
      }

      // Listen for brand kit updates from the modal
      const handleBrandKitUpdate = () => {
        if (!chatStarted) {
          fetchBrandAssets();
        }
      };

      window.addEventListener('brand-kit-updated', handleBrandKitUpdate);
      return () => window.removeEventListener('brand-kit-updated', handleBrandKitUpdate);
    }, [chatStarted]);

    useEffect(() => {
      if (!isConnected) {
        localStorage.removeItem('daily_password_verified');
        setIsAuthenticated(false);
      } else if (isConnected && !isUserAuthenticated && pendingMessage) {
        // wallet connected but not authenticated, reopen dialog for password
        setShowAuthDialog(true);
      }
    }, [isConnected, isUserAuthenticated, pendingMessage]);

    return (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          'relative flex flex-col min-h-[calc(100vh-128px)] w-full min-w-[320px] overflow-x-auto bg-eitherway-elements-background-depth-1',
        )}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex w-full flex-1 min-h-[calc(100vh-128px)]">
          <div className={classNames(styles.Chat, 'flex flex-col px-6 flex-grow')}>
            {!chatStarted && (
              <div id="intro" className="mt-[128px] max-[768px]:mt-[64px] max-w-chat mx-auto relative z-1">
                <h1
                  className="text-[64px] leading-[77px] max-[768px]:text-[32px] max-[768px]:leading-[38px] font-medium mb-6 max-[768px]:mb-4 font-syne"
                  style={{
                    color: '#ffffff',
                    letterSpacing: '-0.05em',
                    textAlign: 'left',
                  }}
                >
                  Don't just imagine it.
                  <br />
                  Launch it.
                </h1>
                <p
                  className="text-[16px] leading-[150%] max-[768px]:text-[14px] max-[768px]:leading-[140%] font-medium mb-4 max-[768px]:mb-3 font-montserrat"
                  style={{
                    color: '#ffffff',
                    textAlign: 'left',
                  }}
                >
                  Eitherway turns your ideas into fully working, monetizable mobile apps with a single prompt.{' '}
                  <span className="font-bold italic ">No coding. No delays.</span> Just build, publish, and earn —
                  either way.
                </p>
              </div>
            )}
            <div
              className={classNames('pt-6 flex-1', {
                'flex flex-col max-h-[calc(100vh-128px)]': chatStarted,
              })}
            >
              <ClientOnly>
                {() => {
                  return chatStarted ? (
                    <Messages
                      ref={messageRef}
                      scrollRef={scrollRef}
                      className="flex flex-col w-full flex-1 max-w-chat px-4 pb-6 mx-auto z-1 min-h-0"
                      messages={messages}
                      isStreaming={isStreaming}
                      currentPhase={currentPhase}
                      reasoningText={reasoningText}
                      thinkingDuration={thinkingDuration}
                      fileOperations={fileOperations}
                      tokenUsage={tokenUsage}
                    />
                  ) : null;
                }}
              </ClientOnly>
              <div
                id="auth-chat"
                className={classNames('relative w-full max-w-chat mx-auto z-prompt mt-6', {
                  'sticky bottom-0': chatStarted,
                })}
              >
                <div
                  className={classNames('relative rounded-lg overflow-hidden bg-black')}
                  style={{
                    background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.15) 100%)',
                    padding: '1px',
                  }}
                >
                  <div className="w-full h-full bg-black rounded-lg">
                    <textarea
                      ref={textareaRef}
                      className={`w-full pl-4  pt-4 rounded-lg placeholder:text-white/50 pr-16 focus:outline-none resize-none text-md text-eitherway-elements-textPrimary bg-black`}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          if (event.shiftKey) {
                            return;
                          }

                          event.preventDefault();

                          if (isUserAuthenticated) {
                            sendMessage?.(event);
                          } else {
                            setPendingMessage(input);
                            setShowAuthDialog(true);
                          }
                        }
                      }}
                      value={input}
                      onChange={(event) => {
                        handleInputChange?.(event);
                      }}
                      style={{
                        minHeight: minTextareaHeight,
                        maxHeight: TEXTAREA_MAX_HEIGHT,
                      }}
                      placeholder={chatStarted ? "Let's change..." : "Let's build..."}
                      translate="no"
                    />
                    <ClientOnly>
                      {() => (
                        <SendButton
                          show={(input.length > 0 && input.trim() !== '') || isStreaming}
                          isStreaming={isStreaming}
                          onClick={(event) => {
                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            if (isUserAuthenticated) {
                              sendMessage?.(event);
                            } else {
                              setPendingMessage(input);
                              setShowAuthDialog(true);
                            }
                          }}
                        />
                      )}
                    </ClientOnly>
                    <div className="flex justify-between text-sm p-4 pt-2">
                      <div className="flex gap-1 items-center">
                        <IconButton
                          title={isStreaming ? 'Brand Kit disabled while agent is working' : 'Open Brand Kit'}
                          disabled={isStreaming}
                          className="text-eitherway-elements-textTertiary hover:text-eitherway-elements-textPrimary"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('open-brand-kit'));
                          }}
                        >
                          <div className="i-ph:paperclip text-xl"></div>
                        </IconButton>
                        <IconButton
                          title="Enhance prompt"
                          disabled={input.length === 0 || enhancingPrompt}
                          className={classNames({
                            'opacity-100!': enhancingPrompt,
                            'text-eitherway-elements-item-contentAccent! pr-1.5 enabled:hover:bg-eitherway-elements-item-backgroundAccent!':
                              promptEnhanced,
                          })}
                          onClick={() => enhancePrompt?.()}
                        >
                          {enhancingPrompt ? (
                            <>
                              <img
                                src="/icons/chat/loader.svg"
                                alt="Loading"
                                className="w-5 h-5 text-eitherway-elements-loader-progress animate-spin"
                              />
                              <div className="ml-1.5">Enhancing prompt...</div>
                            </>
                          ) : (
                            <>
                              <div className="i-eitherway:stars text-xl"></div>
                              {promptEnhanced && <div className="ml-1.5">Prompt enhanced</div>}
                            </>
                          )}
                        </IconButton>
                      </div>
                      {input.length > 3 ? (
                        <div className="text-xs flex gap-1 items-center text-eitherway-elements-textTertiary">
                          Use <kbd className="kdb">Shift</kbd> + <kbd className="kdb">Return</kbd> for a new line
                        </div>
                      ) : null}
                    </div>

                    {/* Brand Kit Assets - Tiny Thumbnails */}
                    <AnimatePresence>
                      {brandAssets.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap gap-2 p-3 pt-2 border-t border-gray-700/50">
                            {brandAssets.map((asset) => {
                              const isImage = asset.mimeType.startsWith('image/');

                              return (
                                <motion.div
                                  key={asset.id}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  className="relative group"
                                >
                                  {/* Tiny square thumbnail */}
                                  <div className="w-12 h-12 bg-gray-800 rounded border border-gray-600 flex items-center justify-center overflow-hidden">
                                    {isImage ? (
                                      <img
                                        src={`${BACKEND_URL}/api/brand-assets/download/${encodeURIComponent(asset.storageKey)}`}
                                        alt={asset.fileName}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          // Fallback to icon if image fails to load
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    ) : null}
                                    <div className={isImage ? 'hidden' : 'text-gray-400 text-lg'}>
                                      {asset.mimeType.startsWith('video/') && <div className="i-ph:video" />}
                                      {(asset.mimeType.includes('font') || asset.fileName.match(/\.(ttf|otf|woff|woff2)$/i)) && (
                                        <div className="i-ph:text-aa" />
                                      )}
                                      {asset.mimeType.includes('zip') && <div className="i-ph:file-zip" />}
                                      {!asset.mimeType.startsWith('video/') &&
                                        !asset.mimeType.includes('font') &&
                                        !asset.fileName.match(/\.(ttf|otf|woff|woff2)$/i) &&
                                        !asset.mimeType.includes('zip') &&
                                        !isImage && <div className="i-ph:file" />}
                                    </div>
                                  </div>

                                  {/* Delete button (X on corner) */}
                                  <button
                                    onClick={() => handleDeleteAsset(asset.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={`Remove ${asset.fileName}`}
                                  >
                                    <div className="i-ph:x text-xs" />
                                  </button>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className=" pb-6">{/* Ghost Element */}</div>
                {!chatStarted && (
                  <div id="examples" className="flex flex-row items-center gap-4 w-full max-w-640px h-14 mx-auto">
                    {EXAMPLE_PROMPTS.map((examplePrompt, index) => {
                      return (
                        <button
                          key={index}
                          onClick={(event) => {
                            if (isUserAuthenticated) {
                              sendMessage?.(event, examplePrompt.text);
                            } else {
                              setPendingMessage(examplePrompt.text);
                              setShowAuthDialog(true);
                            }
                          }}
                          className="flex-1 h-14 bg-black border border-white/15 rounded-2xl cursor-pointer transition-all duration-200 font-montserrat text-sm text-white/75 text-center hover:text-white"
                        >
                          {examplePrompt.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>

        {!chatStarted && (
          <div className="w-full">
            <ContentBlock1 />
            <PricingBlock />
            <FaqBlock />
            <LastBlock />
            <Footer />
          </div>
        )}

        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
          onAuthenticated={handleAuthenticated}
          pendingMessage={pendingMessage}
        />
      </div>
    );
  },
);
