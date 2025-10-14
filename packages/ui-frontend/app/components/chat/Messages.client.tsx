import type { Message } from 'ai';
import React from 'react';
import { classNames } from '~/utils/classNames';
import { stripBrandKitContext } from '~/utils/brandKitUtils';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import styles from './BaseChat.module.scss';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  scrollRef?: (node: HTMLDivElement | null) => void;
  currentPhase?: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  reasoningText?: string;
  thinkingDuration?: number | null;
  fileOperations?: Array<{ operation: string; filePath: string }>;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
}

interface ExtendedMessage extends Message {
  metadata?: {
    reasoningText?: string;
    thinkingDuration?: number | null;
    fileOperations?: Array<{ operation: string; filePath: string }>;
    tokenUsage?: { inputTokens: number; outputTokens: number } | null;
    phase?: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  };
}

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const {
    id,
    isStreaming = false,
    messages = [],
    scrollRef,
    currentPhase,
    reasoningText,
    thinkingDuration,
    fileOperations,
    tokenUsage,
  } = props;

  return (
    <div
      id={id}
      ref={(node) => {
        if (ref) {
          if (typeof ref === 'function') {
            ref(node);
          } else {
            ref.current = node;
          }
        }

        if (scrollRef) {
          scrollRef(node);
        }
      }}
      className={classNames(
        props.className,
        styles.chatScroll,
        'border border-eitherway-elements-borderColor bg-black/90 backdrop-blur-[3px] rounded-lg overflow-y-auto overflow-x-hidden p-6',
      )}
    >
      {messages.length > 0
        ? messages.map((message, index) => {
            const { role, content } = message as ExtendedMessage;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;

            // Strip brand kit context from user messages (backend enriches prompts with brand context)
            const displayContent = isUserMessage ? stripBrandKitContext(content) : content;

            // For assistant messages, use saved metadata or current streaming state
            const extendedMessage = message as ExtendedMessage;
            const messageMetadata = extendedMessage.metadata || {};

            // Determine what to display based on whether this is the last (streaming) message or old message
            const displayReasoningText = isLast
              ? messageMetadata.reasoningText || reasoningText // Last message: prefer saved, fallback to streaming state
              : messageMetadata.reasoningText || ''; // Old message: only use saved

            const displayPhase = isLast ? currentPhase || messageMetadata.phase || null : messageMetadata.phase || null;

            const displayThinkingDuration = isLast
              ? (messageMetadata.thinkingDuration ?? thinkingDuration)
              : (messageMetadata.thinkingDuration ?? null);

            const displayFileOperations = isLast
              ? messageMetadata.fileOperations || fileOperations
              : messageMetadata.fileOperations || [];

            const displayTokenUsage = isLast
              ? messageMetadata.tokenUsage || tokenUsage
              : messageMetadata.tokenUsage || null;

            // Debug: Log what we're displaying for each message
            if (!isUserMessage) {
              console.log(`📖 [Render Message ${index}]`, {
                isLast,
                messageId: (message as any).id,
                hasMetadata: !!extendedMessage.metadata,
                metadataKeys: extendedMessage.metadata ? Object.keys(extendedMessage.metadata) : [],
                savedReasoning: messageMetadata.reasoningText?.length || 0,
                displayReasoning: displayReasoningText?.length || 0,
                streamingReasoning: reasoningText?.length || 0,
                // Show first 100 chars of reasoning
                savedReasoningPreview: messageMetadata.reasoningText?.substring(0, 100) || 'NONE',
                displayReasoningPreview: displayReasoningText?.substring(0, 100) || 'NONE',
              });
            }

            return (
              <div
                key={index}
                className={classNames('flex gap-4 relative', {
                  'p-4 bg-black/50 border border-eitherway-elements-borderColor rounded-lg': !isUserMessage,
                  'px-6 py-2 bg-white/10 rounded-lg ml-auto w-fit max-w-[60%]': isUserMessage,
                  'mt-4': !isFirst,
                })}
              >
                <div
                  className={classNames('grid grid-col-1', {
                    'w-full': !isUserMessage,
                    'w-fit': isUserMessage,
                  })}
                >
                  {isUserMessage ? (
                    <UserMessage content={displayContent} />
                  ) : (
                    <AssistantMessage
                      content={displayContent}
                      isStreaming={isStreaming && isLast}
                      phase={displayPhase}
                      reasoningText={displayReasoningText}
                      thinkingDuration={displayThinkingDuration}
                      fileOperations={displayFileOperations}
                      tokenUsage={displayTokenUsage}
                    />
                  )}
                </div>
              </div>
            );
          })
        : null}
    </div>
  );
});
