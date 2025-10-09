import type { Message } from 'ai';
import React from 'react';
import { classNames } from '~/utils/classNames';
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
            const { role, content } = message;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;

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
                    <UserMessage content={content} />
                  ) : (
                    <AssistantMessage
                      content={content}
                      isStreaming={isStreaming && isLast}
                      phase={isLast ? currentPhase : null}
                      reasoningText={isLast ? reasoningText : ''}
                      thinkingDuration={isLast ? thinkingDuration : null}
                      fileOperations={isLast ? fileOperations : []}
                      tokenUsage={isLast ? tokenUsage : null}
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
