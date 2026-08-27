import { create } from 'zustand';
import type { Editor } from '@tiptap/react';

interface EditorState {
  /** The TipTap instance for the element currently being edited, if any. */
  editor: Editor | null;
  /** Bumped on every transaction so toolbars re-render with live mark state. */
  revision: number;
  setEditor: (editor: Editor | null) => void;
  bumpRevision: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  editor: null,
  revision: 0,
  setEditor: (editor) => set({ editor, revision: 0 }),
  bumpRevision: () => set((s) => ({ revision: s.revision + 1 })),
}));
