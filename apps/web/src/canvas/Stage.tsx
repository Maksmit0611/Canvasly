import { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, Stage as KonvaStage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement, Point } from '@canvas/shared';
import { useCanvasStore, type Tool } from '@/store/canvasStore';
import { useHistoryStore } from '@/store/historyStore';
import { createElement } from '@/lib/elementFactory';
import {
  boundsIntersect, constrainToAxis, hitBounds, normalizeBounds,
  screenToCanvas, unionBounds, type Bounds,
} from '@/lib/geometry';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/zoom';
import ElementRenderer from './ElementRenderer';
import SelectionLayer, { CURSOR_FOR_HANDLE, type HandleId } from './SelectionLayer';
import RemoteCursors from './RemoteCursors';
import type { RemotePresence } from '@/collab/useYjsRoom';
import { boundsTransform, resizeBounds } from './resize';

const DRAW_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text', 'frame'];

type Interaction =
  | { kind: 'none' }
  | { kind: 'draw'; id: string; origin: Point }
  | { kind: 'move'; origin: Point; startPositions: Map<string, Point> }
  | { kind: 'marquee'; origin: Point }
  | { kind: 'resize'; handle: HandleId; origin: Point; startBounds: Bounds; startElements: CanvasElement[] }
  | { kind: 'rotate'; center: Point; startAngles: Map<string, number>; startPointerAngle: number }
  | { kind: 'pan'; origin: Point; startScroll: Point };

interface Props {
  width: number;
  height: number;
  peers?: RemotePresence[];
  onCursorMove?: (point: Point | null) => void;
}

export default function Stage({ width, height, peers = [], onCursorMove }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'none' });
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const elements = useCanvasStore((s) => s.elements);
  const elementOrder = useCanvasStore((s) => s.elementOrder);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const zoom = useCanvasStore((s) => s.zoom);
  const scrollX = useCanvasStore((s) => s.scrollX);
  const scrollY = useCanvasStore((s) => s.scrollY);
  const editingTextId = useCanvasStore((s) => s.editingTextId);

  // Space+drag pans, matching the H tool without leaving the current tool.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pointerCanvasPos = useCallback((): Point | null => {
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return screenToCanvas(p, zoom, scrollX, scrollY);
  }, [zoom, scrollX, scrollY]);

  const handleStagePointerDown = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      const store = useCanvasStore.getState();
      const pos = pointerCanvasPos();
      if (!pos) return;

      const isMiddle = e.evt.button === 1;
      const wantsPan = spaceHeld || isMiddle || store.activeTool === 'pan';

      if (wantsPan) {
        e.evt.preventDefault();
        setInteraction({
          kind: 'pan',
          origin: { x: e.evt.clientX, y: e.evt.clientY },
          startScroll: { x: store.scrollX, y: store.scrollY },
        });
        return;
      }

      if (DRAW_TOOLS.includes(store.activeTool)) {
        const type = store.activeTool as CanvasElement['type'];
        const isBox = ['rectangle', 'ellipse', 'diamond', 'frame'].includes(type);
        const element = createElement(type, pos, {
          zIndex: store.elementOrder.length,
          ...(type === 'text' ? { width: 200, height: 32, plainText: '' } : {}),
          ...(isBox ? { textAlign: 'center', verticalAlign: 'middle' } : {}),
        });
        store.addElement(element);
        setInteraction({ kind: 'draw', id: element.id, origin: pos });
        return;
      }

      // Select tool on empty canvas begins a marquee.
      if (e.target === e.target.getStage()) {
        if (!e.evt.shiftKey) store.clearSelection();
        setInteraction({ kind: 'marquee', origin: pos });
        setMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 });
      }
    },
    [pointerCanvasPos, spaceHeld],
  );

  const handleElementPointerDown = useCallback(
    (element: CanvasElement) => (e: KonvaEventObject<PointerEvent>) => {
      const store = useCanvasStore.getState();
      if (store.activeTool !== 'select' || spaceHeld || element.locked) return;

      e.cancelBubble = true;
      const pos = pointerCanvasPos();
      if (!pos) return;

      const alreadySelected = store.selectedIds.includes(element.id);
      let ids = store.selectedIds;

      if (e.evt.shiftKey) {
        store.toggleSelection(element.id);
        ids = useCanvasStore.getState().selectedIds;
      } else if (!alreadySelected) {
        store.select([element.id]);
        ids = [element.id];
      }

      const startPositions = new Map<string, Point>();
      for (const id of ids) {
        const el = useCanvasStore.getState().elements[id];
        if (el && !el.locked) startPositions.set(id, { x: el.x, y: el.y });
      }

      setInteraction({ kind: 'move', origin: pos, startPositions });
    },
    [pointerCanvasPos, spaceHeld],
  );

  const handleHandlePointerDown = useCallback(
    (handle: HandleId, e: KonvaEventObject<PointerEvent>) => {
      e.cancelBubble = true;
      const store = useCanvasStore.getState();
      const pos = pointerCanvasPos();
      if (!pos) return;

      const selected = store.selectedElements();
      const startBounds = unionBounds(selected.map(hitBounds));
      if (!startBounds) return;

      if (handle === 'rotate') {
        const center = {
          x: startBounds.x + startBounds.width / 2,
          y: startBounds.y + startBounds.height / 2,
        };
        setInteraction({
          kind: 'rotate',
          center,
          startAngles: new Map(selected.map((el) => [el.id, el.angle])),
          startPointerAngle: Math.atan2(pos.y - center.y, pos.x - center.x),
        });
        return;
      }

      setInteraction({
        kind: 'resize',
        handle,
        origin: pos,
        startBounds,
        startElements: selected.map((el) => ({ ...el })),
      });
    },
    [pointerCanvasPos],
  );

  const handlePointerMove = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      // Broadcast the pointer even when idle, so peers see it move.
      if (onCursorMove) onCursorMove(pointerCanvasPos());

      if (interaction.kind === 'none') return;
      const store = useCanvasStore.getState();

      if (interaction.kind === 'pan') {
        store.setScroll(
          interaction.startScroll.x + (e.evt.clientX - interaction.origin.x),
          interaction.startScroll.y + (e.evt.clientY - interaction.origin.y),
        );
        return;
      }

      const pos = pointerCanvasPos();
      if (!pos) return;

      switch (interaction.kind) {
        case 'draw': {
          const el = store.elements[interaction.id];
          if (!el) return;
          const point = e.evt.shiftKey ? constrainToAxis(interaction.origin, pos) : pos;

          if (el.type === 'freedraw') {
            store.updateElements(
              [el.id],
              { points: [...(el.points ?? []), { x: pos.x - el.x, y: pos.y - el.y }] },
              { history: false },
            );
          } else if (el.type === 'line' || el.type === 'arrow') {
            store.updateElements(
              [el.id],
              {
                points: [
                  { x: 0, y: 0 },
                  { x: point.x - interaction.origin.x, y: point.y - interaction.origin.y },
                ],
                width: point.x - interaction.origin.x,
                height: point.y - interaction.origin.y,
              },
              { history: false },
            );
          } else {
            store.updateElements(
              [el.id],
              { width: point.x - interaction.origin.x, height: point.y - interaction.origin.y },
              { history: false },
            );
          }
          return;
        }

        case 'move': {
          const raw = { x: pos.x - interaction.origin.x, y: pos.y - interaction.origin.y };
          const delta = e.evt.shiftKey
            ? Math.abs(raw.x) >= Math.abs(raw.y)
              ? { x: raw.x, y: 0 }
              : { x: 0, y: raw.y }
            : raw;

          for (const [id, start] of interaction.startPositions) {
            store.updateElements([id], { x: start.x + delta.x, y: start.y + delta.y }, { history: false });
          }
          return;
        }

        case 'marquee': {
          const box = {
            x: interaction.origin.x,
            y: interaction.origin.y,
            width: pos.x - interaction.origin.x,
            height: pos.y - interaction.origin.y,
          };
          setMarquee(box);

          const normalized = normalizeBounds(box);
          store.select(
            store.orderedElements()
              .filter((el) => !el.locked && boundsIntersect(hitBounds(el), normalized))
              .map((el) => el.id),
          );
          return;
        }

        case 'resize': {
          const next = resizeBounds(
            interaction.startBounds,
            interaction.handle,
            pos.x - interaction.origin.x,
            pos.y - interaction.origin.y,
            e.evt.shiftKey,
          );
          const t = boundsTransform(interaction.startBounds, next);

          for (const el of interaction.startElements) {
            store.updateElements(
              [el.id],
              {
                x: next.x + (el.x - t.originX) * t.scaleX,
                y: next.y + (el.y - t.originY) * t.scaleY,
                width: el.width * t.scaleX,
                height: el.height * t.scaleY,
                ...(el.points
                  ? { points: el.points.map((p) => ({ x: p.x * t.scaleX, y: p.y * t.scaleY })) }
                  : {}),
              },
              { history: false },
            );
          }
          return;
        }

        case 'rotate': {
          const current = Math.atan2(pos.y - interaction.center.y, pos.x - interaction.center.x);
          let delta = current - interaction.startPointerAngle;
          // Shift snaps rotation to 15-degree steps.
          if (e.evt.shiftKey) {
            const step = Math.PI / 12;
            delta = Math.round(delta / step) * step;
          }
          for (const [id, startAngle] of interaction.startAngles) {
            store.updateElements([id], { angle: startAngle + delta }, { history: false });
          }
          return;
        }
      }
    },
    [interaction, pointerCanvasPos],
  );

  /**
   * Live dragging writes with `history: false` so a gesture does not flood the
   * stack; this records one entry for the whole gesture on release.
   */
  const commitGesture = useCallback(
    (label: string, before: Map<string, Partial<CanvasElement>>) => {
      const store = useCanvasStore.getState();
      const after = new Map<string, Partial<CanvasElement>>();

      for (const [id, prev] of before) {
        const el = store.elements[id];
        if (!el) continue;
        const snapshot: Record<string, unknown> = {};
        for (const key of Object.keys(prev)) {
          snapshot[key] = (el as unknown as Record<string, unknown>)[key];
        }
        after.set(id, snapshot as Partial<CanvasElement>);
      }

      // Nothing actually moved — a plain click, not a drag.
      const changed = [...before].some(
        ([id, prev]) => JSON.stringify(prev) !== JSON.stringify(after.get(id)),
      );
      if (!changed) return;

      useHistoryStore.getState().push({
        label,
        undo: () => {
          for (const [id, prev] of before) {
            store.applyCommands([{ op: 'update', ids: [id], patch: prev }], 'user');
          }
        },
        redo: () => {
          for (const [id, next] of after) {
            store.applyCommands([{ op: 'update', ids: [id], patch: next }], 'user');
          }
        },
      });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    const store = useCanvasStore.getState();

    if (interaction.kind === 'move') {
      const before = new Map<string, Partial<CanvasElement>>();
      for (const [id, start] of interaction.startPositions) before.set(id, { x: start.x, y: start.y });
      commitGesture('Move', before);
    }

    if (interaction.kind === 'resize') {
      const before = new Map<string, Partial<CanvasElement>>();
      for (const el of interaction.startElements) {
        before.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, points: el.points });
      }
      commitGesture('Resize', before);
    }

    if (interaction.kind === 'rotate') {
      const before = new Map<string, Partial<CanvasElement>>();
      for (const [id, angle] of interaction.startAngles) before.set(id, { angle });
      commitGesture('Rotate', before);
    }

    if (interaction.kind === 'draw') {
      const el = store.elements[interaction.id];

      // A click with no drag leaves a zero-size shape; drop it rather than
      // leaving an invisible element behind. Freedraw carries its extent in
      // `points`, not width/height, so it is judged on point count instead —
      // measuring it by width/height would discard every stroke.
      const isEmpty = el
        ? el.type === 'freedraw'
          ? (el.points?.length ?? 0) < 2
          : el.type !== 'text' && Math.abs(el.width) < 2 && Math.abs(el.height) < 2
        : false;

      if (el && isEmpty) {
        store.deleteElements([el.id]);
      } else if (el) {
        // Give freedraw a real bounding box so selection and export work.
        if (el.type === 'freedraw' && el.points) {
          const xs = el.points.map((p) => p.x);
          const ys = el.points.map((p) => p.y);
          store.updateElements(
            [el.id],
            { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
            { history: false },
          );
        }
        // Normalise so width/height are positive after a right-to-left drag.
        const n = normalizeBounds({ x: el.x, y: el.y, width: el.width, height: el.height });
        if (el.type !== 'line' && el.type !== 'arrow' && el.type !== 'freedraw') {
          store.updateElements([el.id], n, { history: false });
        }
        store.setTool('select');
        store.select([el.id]);
        // Text tools and freshly drawn boxes are ready for typing immediately.
        if (el.type === 'text' || ['rectangle', 'ellipse', 'diamond', 'frame'].includes(el.type)) {
          store.setEditingTextId(el.id);
        }
      }
    }

    if (interaction.kind === 'marquee') setMarquee(null);
    setInteraction({ kind: 'none' });
  }, [interaction, commitGesture]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const store = useCanvasStore.getState();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (e.evt.ctrlKey || e.evt.metaKey) {
      if (!pointer) return;
      const factor = Math.exp(-e.evt.deltaY * 0.01);
      store.zoomBy(factor, pointer);
      return;
    }

    if (e.evt.shiftKey) store.pan(-e.evt.deltaY, 0);
    else store.pan(-e.evt.deltaX, -e.evt.deltaY);
  }, []);

  const handleDoubleClick = useCallback(
    (element: CanvasElement) => (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      // Only text-bearing elements have an editor/rendering surface.
      if (element.type === 'text' || ['rectangle', 'ellipse', 'diamond', 'frame'].includes(element.type)) {
        useCanvasStore.getState().setEditingTextId(element.id);
      }
    },
    [],
  );

  const cursor =
    interaction.kind === 'pan' || spaceHeld || activeTool === 'pan'
      ? 'grab'
      : interaction.kind === 'resize'
        ? CURSOR_FOR_HANDLE[interaction.handle]
        : activeTool === 'select'
          ? 'default'
          : 'crosshair';

  const ordered = elementOrder
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => Boolean(el) && !el!.isDeleted);
  const selected = selectedIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => Boolean(el) && !el!.isDeleted);

  return (
    <KonvaStage
      ref={stageRef}
      width={width}
      height={height}
      scaleX={zoom}
      scaleY={zoom}
      x={scrollX}
      y={scrollY}
      style={{ cursor, touchAction: 'none' }}
      onPointerdown={handleStagePointerDown}
      onPointermove={handlePointerMove}
      onPointerup={handlePointerUp}
      onPointercancel={handlePointerUp}
      onPointerleave={() => onCursorMove?.(null)}
      onWheel={handleWheel}
      data-testid="canvas-stage"
    >
      <Layer>
        {ordered
          // Text elements are drawn by the DOM overlay while editing; shapes
          // stay rendered, with their canvas label hidden by the shape renderer.
          .filter((element) => element.id !== editingTextId || element.type !== 'text')
          .map((element) => (
          <ElementRenderer
            key={element.id}
            element={element}
            zoom={zoom}
            isSelected={selectedIds.includes(element.id)}
            elementsById={elements}
            onPointerDown={handleElementPointerDown(element)}
            onDoubleClick={handleDoubleClick(element)}
          />
        ))}
      </Layer>

      {/* Chrome lives on its own layer so redrawing it never touches content. */}
      <Layer listening={interaction.kind === 'none' || interaction.kind === 'resize'}>
        <SelectionLayer
          selected={selected}
          zoom={zoom}
          marquee={marquee}
          onHandlePointerDown={handleHandlePointerDown}
        />
        <RemoteCursors peers={peers} zoom={zoom} />
      </Layer>
    </KonvaStage>
  );
}

export { MIN_ZOOM, MAX_ZOOM };
