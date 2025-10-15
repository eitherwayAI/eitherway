import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChatFallback } from '~/components/chat/BaseChatFallback';
import { Chat } from '~/components/chat/Chat.client';
import { HeaderWithGlow } from '~/components/HeaderWithGlow';

export const meta: MetaFunction = () => {
  return [
    { title: 'EITHERWAY  - Chat with AI' },
    {
      name: 'description',
      content: 'Chat with AI to build your next app. Start building with EITHERWAY.',
    },
  ];
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const headers = new Headers();

  // Додаємо заголовки тільки для WASM файлів та SharedArrayBuffer
  if (url.pathname.endsWith('.wasm') || url.pathname.includes('action-runner')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return json({ id: params.id }, { headers });
}

export default function ChatPageWithId() {
  return (
    <ClientOnly fallback={<BaseChatFallback />}>
      {() => (
        <HeaderWithGlow>
          <Chat />
        </HeaderWithGlow>
      )}
    </ClientOnly>
  );
}
