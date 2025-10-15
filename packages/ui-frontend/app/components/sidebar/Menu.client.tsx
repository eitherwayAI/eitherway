import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { getDb, deleteById, getAll, chatId, type ChatHistoryItem } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useStore } from '@nanostores/react';
import { sidebarStore, openSidebar, closeSidebar } from '~/lib/stores/sidebar';
import { clearSession } from '~/utils/sessionManager';
import { BACKEND_URL } from '~/config/api';
import { authStore } from '~/lib/stores/auth';
import { useWalletConnection } from '~/lib/web3/hooks';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-150px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent = { type: 'delete'; item: ChatHistoryItem } | null;

export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const sidebar = useStore(sidebarStore);
  const open = sidebar.isOpen;
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);

  // Get authenticated user info
  const user = useStore(authStore.user);
  const { isConnected, address } = useWalletConnection();
  // Prioritize wallet address (email auth is mostly mock)
  const userId = (isConnected && address ? address : user?.email) || null;

  const loadEntries = useCallback(async () => {
    try {
      // Only load if user is authenticated
      if (!userId) {
        console.log('No authenticated user, skipping history load');
        setList([]);
        return;
      }

      // First get user ID from the authenticated user's identifier (wallet address or email)
      const userResponse = await fetch(`${BACKEND_URL}/api/users?email=${encodeURIComponent(userId)}`);
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user');
      }
      const backendUser = await userResponse.json();

      // Then fetch sessions for this user
      const sessionsResponse = await fetch(`${BACKEND_URL}/api/sessions?userId=${backendUser.id}&limit=50`);
      if (!sessionsResponse.ok) {
        throw new Error('Failed to fetch sessions');
      }
      const { sessions } = await sessionsResponse.json();

      // Transform backend sessions to match ChatHistoryItem format
      const transformedList = sessions.map((session: any) => ({
        id: session.id,
        urlId: session.id,
        description: session.title || 'Untitled Chat',
        timestamp: new Date(session.created_at).getTime(),
      }));

      setList(transformedList);
    } catch (error) {
      console.error('Failed to load chat history:', error);
      toast.error('Failed to load chat history');
    }
  }, [userId]);

  const deleteItem = useCallback(
    async (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();

      try {
        const response = await fetch(`${BACKEND_URL}/api/sessions/${item.id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete session');
        }

        // Reload the list
        await loadEntries();

        // If we just deleted the current session, clear it and navigate home
        const currentSessionId = localStorage.getItem('currentSessionId');
        if (currentSessionId === item.id) {
          localStorage.removeItem('currentSessionId');
          window.location.pathname = '/';
        }

        toast.success('Chat deleted successfully');
      } catch (error) {
        toast.error('Failed to delete conversation');
        logger.error(error);
      }
    },
    [loadEntries],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open, loadEntries]);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (event.pageX < enterThreshold) {
        openSidebar();
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        closeSidebar();
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <motion.div
      ref={menuRef}
      initial="closed"
      animate={open ? 'open' : 'closed'}
      variants={menuVariants}
      className="flex flex-col bg-eitherway-elements-background-depth-2 side-menu z-10 fixed top-0 w-[350px] h-full border-r rounded-r-3xl border-eitherway-elements-borderColor shadow-xl shadow-eitherway-elements-sidebar-dropdownShadow text-sm"
    >
      <div className="flex items-center h-[var(--header-height)]">{/* Placeholder */}</div>
      <div className="flex-1 flex flex-col bg-eitherway-elements-background-depth-2 h-full w-full overflow-hidden">
        <div className="p-4">
          <button
            onClick={() => {
              // Clear session to start fresh conversation
              clearSession();
              // Navigate to chat page
              window.location.href = '/chat';
            }}
            className="flex gap-2 items-center bg-white/10 text-eitherway-elements-sidebar-buttonText hover:bg-white/20 rounded-md p-2 transition-theme w-full"
          >
            <span className="inline-block i-eitherway:chat text-white scale-110" />
            Start new chat
          </button>
        </div>
        <div className="text-eitherway-elements-textPrimary font-medium pl-6 pr-5 my-2">Your Chats</div>
        <div className={`flex-1 pl-4 pr-5 pb-5 ${list.length > 0 ? 'overflow-auto' : 'overflow-hidden'}`}>
          {list.length === 0 && (
            <div className="pl-2 text-eitherway-elements-textTertiary">No previous conversations</div>
          )}
          <DialogRoot open={dialogContent !== null}>
            {binDates(list).map(({ category, items }) => (
              <div key={category} className="mt-4 first:mt-0 space-y-1">
                <div className="text-eitherway-elements-textTertiary sticky top-0 z-1 bg-eitherway-elements-background-depth-2 pl-2 pt-2 pb-1">
                  {category}
                </div>
                {items.map((item) => (
                  <HistoryItem key={item.id} item={item} onDelete={() => setDialogContent({ type: 'delete', item })} />
                ))}
              </div>
            ))}
            <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
              {dialogContent?.type === 'delete' && (
                <>
                  <DialogTitle>Delete Chat?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>{dialogContent.item.description}</strong>.
                      </p>
                      <p className="mt-1">Are you sure you want to delete this chat?</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-eitherway-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={closeDialog}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={(event) => {
                        deleteItem(event, dialogContent.item);
                        closeDialog();
                      }}
                    >
                      Delete
                    </DialogButton>
                  </div>
                </>
              )}
            </Dialog>
          </DialogRoot>
        </div>
        <div className="flex items-center border-t border-eitherway-elements-borderColor p-4">
          <ThemeSwitch className="ml-auto" />
        </div>
      </div>
    </motion.div>
  );
}
