import { atom } from 'nanostores';

export type PreviewMode = 'desktop' | 'mobile';

export const previewModeStore = atom<PreviewMode>('desktop');
