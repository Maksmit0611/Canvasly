import { useEffect, useRef, type CSSProperties } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { Placeholder } from '@tiptap/extension-placeholder';
import { useCanvasStore } from '@/store/canvasStore';
import { useEditorStore } from '@/store/editorStore';
import { canvasToScreen } from '@/lib/geometry';
import { toPlainText, type RichTextNode } from '../richTextLayout';

export const richTextExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  TextStyle,
  Color,
  FontFamily,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({ placeholder: 'Type something…' }),
];

/**
 * A TipTap editor positioned over the canvas at the element's exact screen
 * position. Canvas cannot edit text, so editing happens in the DOM and the
 * result is serialised back onto the canvas.
 */
export default function RichTextOverlay() {
  const editingTextId = useCanvasStore((s) => s.editingTextId);
  const zoom = useCanvasStore((s) => s.zoom);
  const scrollX = useCanvasStore((s) => s.scrollX);
  const scrollY = useCanvasStore((s) => s.scrollY);
  const element = useCanvasStore((s) => (s.editingTextId ? s.elements[s.editingTextId] : undefined));

  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor(
    {
      extensions: richTextExtensions,
      content: (element?.richText as RichTextNode | undefined) ?? element?.plainText ?? '',
      editorProps: {
        attributes: { class: 'canvasly-richtext focus:outline-none' },
      },
      // Keeps the ribbon's active-mark highlighting in sync with the caret.
      onTransaction: () => useEditorStore.getState().bumpRevision(),
    },
    [editingTextId],
  );

  // Publish the instance so the ribbon can drive it.
  useEffect(() => {
    useEditorStore.getState().setEditor(editor ?? null);
    return () => useEditorStore.getState().setEditor(null);
  }, [editor]);

  // Focus as soon as the overlay appears, so typing starts immediately.
  // `isDestroyed` matters: useEditor tears the instance down when its deps
  // change, and touching `.commands` on a destroyed editor throws.
  useEffect(() => {
    if (editor && !editor.isDestroyed && editingTextId) editor.commands.focus('end');
  }, [editor, editingTextId]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !element) return;

    const commit = (): void => {
      if (editor.isDestroyed) return;
      const json = editor.getJSON() as RichTextNode;
      const measured = containerRef.current?.getBoundingClientRect();

      useCanvasStore.getState().updateElements(
        [element.id],
        {
          richText: json,
          plainText: toPlainText(json),
          // Text boxes can grow with their content; labels stay inside the
          // shape's existing geometry instead of resizing the shape itself.
          ...(element.type === 'text' && measured
            ? { height: Math.max(element.fontSize, measured.height / zoom) }
            : {}),
        },
        { label: 'Edit text' },
      );
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        commit();
        useCanvasStore.getState().setEditingTextId(null);
      }
    };

    const onPointerDownOutside = (e: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit();
        useCanvasStore.getState().setEditingTextId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    // Capture phase, so the canvas does not swallow the click first.
    window.addEventListener('pointerdown', onPointerDownOutside, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDownOutside, true);
    };
  }, [editor, element, zoom]);

  if (!editingTextId || !element || !editor || editor.isDestroyed) return null;

  const screen = canvasToScreen({ x: element.x, y: element.y }, zoom, scrollX, scrollY);
  const isShapeLabel = ['rectangle', 'ellipse', 'diamond', 'frame'].includes(element.type);
  const inset = Math.min(12, Math.max(4, Math.min(element.width, element.height) * 0.08));

  const style: CSSProperties = {
    position: 'absolute',
    left: screen.x,
    top: screen.y,
    width: (element.width > 0 ? element.width : 200) * zoom,
    minHeight: Math.max(element.height, element.fontSize) * zoom,
    ...(isShapeLabel
      ? {
          height: Math.max(element.height, element.fontSize) * zoom,
          boxSizing: 'border-box' as const,
          padding: inset * zoom,
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: element.verticalAlign === 'middle'
            ? 'center'
            : element.verticalAlign === 'bottom'
              ? 'flex-end'
              : 'flex-start',
        }
      : {}),
    transform: `rotate(${element.angle}rad)`,
    transformOrigin: 'top left',
    // Scaling the font by zoom is what keeps the overlay aligned with the
    // canvas rendering — without it the text visibly jumps on entering edit
    // mode, which is the classic bug in this phase.
    fontSize: element.fontSize * zoom,
    lineHeight: element.lineHeight,
    fontFamily: element.fontFamily,
    color: element.strokeColor,
    textAlign: element.textAlign,
    background: 'transparent',
    outline: '1px solid var(--accent)',
    zIndex: 10,
  };

  return (
    <div ref={containerRef} style={style} data-testid="richtext-overlay">
      <EditorContent editor={editor} style={isShapeLabel ? { width: '100%' } : undefined} />
    </div>
  );
}
