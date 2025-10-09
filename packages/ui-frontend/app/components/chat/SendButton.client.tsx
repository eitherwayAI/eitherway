import { AnimatePresence, cubicBezier, motion } from 'framer-motion';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export function SendButton({ show, isStreaming, onClick }: SendButtonProps) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className="absolute flex justify-center  items-center top-[18px] right-[22px] p-1 hover:brightness-94 color-white bg-black rounded-md w-[34px] h-[34px] transition-theme"
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          onClick={(event) => {
            event.preventDefault();
            onClick?.(event);
          }}
        >
          <div className="text-lg">
            {!isStreaming ? (
              <img
                width={40}
                height={40}
                className="min-w-[40px] min-h-[40px] rotate-90"
                src="/icons/chat/sendMessage.svg"
                alt="Send message"
              />
            ) : (
              <img
                width={40}
                height={40}
                className="min-w-[40px] min-h-[40px] "
                src="/icons/chat/stopStreaming.svg"
                alt="Stop streaming"
              />
            )}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
