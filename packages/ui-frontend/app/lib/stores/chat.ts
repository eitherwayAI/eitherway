import { map } from 'nanostores';

export type StreamingPhase = 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;

export const chatStore = map<{
  started: boolean;
  aborted: boolean;
  showChat: boolean;
  currentPhase: StreamingPhase;
}>({
  started: false,
  aborted: false,
  showChat: true,
  currentPhase: null,
});
