import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowRight, Bold, Circle,
  Code, Diamond, Image as ImageIcon, Indent, Italic, List, ListOrdered, Minus,
  Outdent, RemoveFormatting, Square, StickyNote, Strikethrough, Type, Underline,
} from 'lucide-react';
import clsx from 'clsx';
import { useCanvasStore, type Tool } from '@/store/canvasStore';

const FONTS = ['Kalam', 'Inter', 'Georgia', 'Courier New', 'Comic Sans MS'];
const SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 40, 56, 72];

interface ButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}

function RibbonButton({ onClick, active, disabled, label, children }: ButtonProps) {
  return (
    <button
      type="button"
      // Mouse-down default would blur the editor and collapse the selection
      // before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx('flex h-7 w-7 items-center justify-center rounded disabled:opacity-30')}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3" style={{ borderRight: '1px solid var(--border)' }}>
      <div className="flex items-center gap-0.5">{children}</div>
      <span
        className="text-[10px] uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
    </div>
  );
}

interface Props {
  editor: Editor | null;
}

export default function Ribbon({ editor }: Props) {
  const [tab, setTab] = useState<'home' | 'insert'>('home');
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const elements = useCanvasStore((s) => s.elements);
  const setTool = useCanvasStore((s) => s.setTool);

  const selected = selectedIds.map((id) => elements[id]).filter(Boolean);
  const textSelected = selected.some((el) => el?.type === 'text');

  // Controls stay visible but disabled when they do not apply — a control that
  // vanishes is more disorienting than one that greys out.
  const disabled = !editor && !textSelected;

  const applyToSelection = (patch: Record<string, unknown>): void => {
    if (selectedIds.length === 0) return;
    useCanvasStore.getState().updateElements(selectedIds, patch, { label: 'Format text' });
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
      <div className="flex items-center gap-1 px-3 pt-1">
        {(['home', 'insert'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="rounded-t px-3 py-1 text-xs font-medium capitalize"
            style={
              tab === t
                ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'home' ? (
        <div className="flex items-stretch gap-1 px-2 py-2">
          <Group label="Font">
            <select
              value={selected[0]?.fontFamily ?? 'Kalam'}
              disabled={disabled}
              onChange={(e) => {
                editor?.chain().focus().setFontFamily(e.target.value).run();
                applyToSelection({ fontFamily: e.target.value });
              }}
              className="h-7 rounded px-1 text-xs disabled:opacity-30"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              aria-label="Font family"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <select
              value={selected[0]?.fontSize ?? 20}
              disabled={disabled}
              onChange={(e) => applyToSelection({ fontSize: Number(e.target.value) })}
              className="h-7 w-14 rounded px-1 text-xs disabled:opacity-30"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              aria-label="Font size"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Group>

          <Group label="Style">
            <RibbonButton
              label="Bold"
              disabled={!editor}
              active={editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={14} />
            </RibbonButton>
            <RibbonButton
              label="Italic"
              disabled={!editor}
              active={editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} />
            </RibbonButton>
            <RibbonButton
              label="Underline"
              disabled={!editor}
              active={editor?.isActive('underline')}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <Underline size={14} />
            </RibbonButton>
            <RibbonButton
              label="Strikethrough"
              disabled={!editor}
              active={editor?.isActive('strike')}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough size={14} />
            </RibbonButton>
            <RibbonButton
              label="Clear formatting"
              disabled={!editor}
              onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
            >
              <RemoveFormatting size={14} />
            </RibbonButton>
          </Group>

          <Group label="Paragraph">
            <select
              value={
                editor?.isActive('heading', { level: 1 })
                  ? 'h1'
                  : editor?.isActive('heading', { level: 2 })
                    ? 'h2'
                    : editor?.isActive('heading', { level: 3 })
                      ? 'h3'
                      : 'p'
              }
              disabled={!editor}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'p') editor?.chain().focus().setParagraph().run();
                else {
                  editor?.chain().focus()
                    .toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
                    .run();
                }
              }}
              className="h-7 rounded px-1 text-xs disabled:opacity-30"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              aria-label="Heading level"
            >
              <option value="p">Body</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>

            <RibbonButton
              label="Bullet list"
              disabled={!editor}
              active={editor?.isActive('bulletList')}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={14} />
            </RibbonButton>
            <RibbonButton
              label="Numbered list"
              disabled={!editor}
              active={editor?.isActive('orderedList')}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} />
            </RibbonButton>
            <RibbonButton
              label="Indent"
              disabled={!editor}
              onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
            >
              <Indent size={14} />
            </RibbonButton>
            <RibbonButton
              label="Outdent"
              disabled={!editor}
              onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
            >
              <Outdent size={14} />
            </RibbonButton>
          </Group>

          <Group label="Align">
            {([
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
              ['justify', AlignJustify],
            ] as const).map(([align, Icon]) => (
              <RibbonButton
                key={align}
                label={`Align ${align}`}
                disabled={disabled}
                active={editor?.isActive({ textAlign: align })}
                onClick={() => {
                  editor?.chain().focus().setTextAlign(align).run();
                  applyToSelection({ textAlign: align });
                }}
              >
                <Icon size={14} />
              </RibbonButton>
            ))}
          </Group>

          <Group label="Colour">
            <input
              type="color"
              value={selected[0]?.strokeColor?.slice(0, 7) ?? '#1e1e1e'}
              disabled={disabled}
              onChange={(e) => {
                editor?.chain().focus().setColor(e.target.value).run();
                applyToSelection({ strokeColor: e.target.value });
              }}
              className="h-7 w-7 cursor-pointer rounded disabled:opacity-30"
              aria-label="Text colour"
            />
          </Group>
        </div>
      ) : (
        <div className="flex items-stretch gap-1 px-2 py-2">
          <Group label="Shapes">
            {([
              ['rectangle', Square],
              ['ellipse', Circle],
              ['diamond', Diamond],
              ['line', Minus],
              ['arrow', ArrowRight],
            ] as const).map(([tool, Icon]) => (
              <RibbonButton key={tool} label={tool} onClick={() => setTool(tool as Tool)}>
                <Icon size={14} />
              </RibbonButton>
            ))}
          </Group>

          <Group label="Content">
            <RibbonButton label="Text box" onClick={() => setTool('text')}>
              <Type size={14} />
            </RibbonButton>
            <RibbonButton label="Sticky note" onClick={() => setTool('frame')}>
              <StickyNote size={14} />
            </RibbonButton>
            <RibbonButton label="Code block" disabled={!editor} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
              <Code size={14} />
            </RibbonButton>
          </Group>

          <Group label="Media">
            {/* Wired up in Phase 8, where uploads and PDF rendering arrive. */}
            <RibbonButton label="Image" disabled onClick={() => undefined}>
              <ImageIcon size={14} />
            </RibbonButton>
          </Group>
        </div>
      )}
    </div>
  );
}
