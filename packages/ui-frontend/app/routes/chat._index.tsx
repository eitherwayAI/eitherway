import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChatFallback } from '~/components/chat/BaseChatFallback';
import { Chat } from '~/components/chat/Chat.client';
import { HeaderWithGlow } from '~/components/HeaderWithGlow';

export const meta: MetaFunction = () => {
  return [
    { title: "Eitherway - Don't just imagine it. Launch it." },
    {
      name: 'description',
      content:
        'Eitherway turns your ideas into fully working, monetizable mobile apps with a single prompt. No coding. No delays. Just build, publish, and earn — either way.',
    },
  ];
};

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const headers = new Headers();

  // Додаємо заголовки тільки для WASM файлів та SharedArrayBuffer
  if (url.pathname.endsWith('.wasm') || url.pathname.includes('action-runner')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return json({}, { headers });
};

export default function ChatPage() {
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
