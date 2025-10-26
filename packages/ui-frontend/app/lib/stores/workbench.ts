import { atom, map, type MapStore, type ReadableAtom, type WritableAtom, computed } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer/index';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { WORK_DIR } from '~/utils/constants';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import { sessionContext } from './sessionContext';

export interface ArtifactState {
  id: string;
  title: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'preview';

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);

  /**
   * Computed store for session-filtered files
   * Created once to prevent infinite re-renders
   */
  #filteredFiles = computed([this.#filesStore.files, sessionContext], (allFiles, session) => {
    const { currentSessionId } = session;

    console.log('[WorkbenchStore] Filtering files for session:', currentSessionId);
    console.log('[WorkbenchStore] All files:', Object.keys(allFiles));

    // If no active session, return empty file map
    if (!currentSessionId) {
      console.log('[WorkbenchStore] No active session, returning empty');
      return {};
    }

    // FilesStore paths: /home/project/__session_xxx__/src/App.jsx
    // We want to strip only the __session_xxx__ part: /home/project/src/App.jsx
    const sessionInfix = `__session_${currentSessionId}__/`;
    console.log('[WorkbenchStore] Looking for files with session infix:', sessionInfix);

    const filteredFiles: FileMap = {};

    for (const [filePath, dirent] of Object.entries(allFiles)) {
      // Only include files from the current session
      if (filePath.includes(sessionInfix)) {
        // Strip only the session infix, keeping /home/project/ prefix
        const normalizedPath = filePath.replace(sessionInfix, '');
        filteredFiles[normalizedPath] = dirent;
      }
    }

    return filteredFiles;
  });

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('preview');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];

  // deploy status
  isAppReadyForDeploy: WritableAtom<boolean> = import.meta.hot?.data.isAppReadyForDeploy ?? atom(false);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.isAppReadyForDeploy = this.isAppReadyForDeploy;
    }
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  /**
   * Get files filtered to current session only, with session infix removed
   *
   * This ensures the file viewer shows:
   * - Only files from the current session (not all __session_xxx__ directories)
   * - Paths with normalized format (/home/project/src/App.jsx instead of /home/project/__session_xxx__/src/App.jsx)
   */
  get files() {
    return this.#filteredFiles;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  /**
   * Convert a normalized path (/home/project/src/App.jsx) to full session path (/home/project/__session_xxx__/src/App.jsx)
   */
  #toSessionPath(normalizedPath: string): string {
    const { currentSessionId } = sessionContext.get();
    if (!currentSessionId) {
      // Fallback: return path as-is if no session (shouldn't happen)
      return normalizedPath;
    }
    // Insert __session_xxx__ after /home/project/
    return normalizedPath.replace(`${WORK_DIR}/`, `${WORK_DIR}/__session_${currentSessionId}__/`);
  }

  /**
   * Convert a full session path (/home/project/__session_xxx__/src/App.jsx) to normalized path (/home/project/src/App.jsx)
   */
  #fromSessionPath(fullPath: string): string {
    const { currentSessionId } = sessionContext.get();
    if (!currentSessionId) {
      return fullPath;
    }
    const sessionInfix = `__session_${currentSessionId}__/`;
    return fullPath.replace(sessionInfix, '');
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    // Convert stripped path to full session path for filesStore
    const fullPath = this.#toSessionPath(filePath);
    const originalContent = this.#filesStore.getFile(fullPath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    // Convert stripped path to full session path for filesStore
    const fullPath = this.#toSessionPath(filePath);
    await this.#filesStore.saveFile(fullPath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    // Convert stripped path to full session path for filesStore
    const fullPath = this.#toSessionPath(filePath);
    const file = this.#filesStore.getFile(fullPath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  abortAllActions() {}

  addArtifact({ messageId, title, id }: ArtifactCallbackData) {
    // Key artifacts by their artifact id, not message id, to allow multiple artifacts per message
    const artifact = this.#getArtifact(id);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(id)) {
      this.artifactIdList.push(id);
    }

    this.artifacts.setKey(id, { id, title, closed: false, runner: new ActionRunner(webcontainer) });
  }

  updateArtifact({ id }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(id);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(id, { ...artifact, ...state });
  }

  async addAction(data: ActionCallbackData) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    artifact.runner.addAction(data);
  }

  async runAction(data: ActionCallbackData) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    artifact.runner.runAction(data);
  }

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  /**
   * Manually register a preview URL (fallback when port event doesn't fire)
   */
  registerPreview(port: number, url: string) {
    this.#previewsStore.registerPreview(port, url);
  }
}

export const workbenchStore = new WorkbenchStore();
