import type { CanvasElement } from '@canvas/shared';

const round = (value: number): number => Math.round(value);

/**
 * A compact structured description of a board, suitable for a prompt.
 *
 * Kept terse on purpose: a typical board must stay within a few thousand
 * tokens, so this reports shape, position, text and connections rather than
 * every styling field.
 */
export function serializeCanvasForLLM(elements: readonly CanvasElement[]): string {
  const live = elements.filter((el) => !el.isDeleted);
  if (live.length === 0) return 'The canvas is empty.';

  const byId = new Map(live.map((el) => [el.id, el]));
  const label = (el: CanvasElement): string => el.plainText?.trim().split('\n')[0] ?? '';

  const lines = live.map((el, index) => {
    const parts = [
      `${index + 1}. ${el.type}`,
      `at (${round(el.x)}, ${round(el.y)})`,
      `size ${round(Math.abs(el.width))}x${round(Math.abs(el.height))}`,
    ];

    const text = label(el);
    if (text) parts.push(`text: "${text.slice(0, 120)}"`);

    if (el.strokeColor !== '#1e1e1e') parts.push(`stroke ${el.strokeColor}`);
    if (el.backgroundColor !== 'transparent') parts.push(`fill ${el.backgroundColor}`);

    // Connections are the part a model most needs to reason about structure.
    if (el.boundStartId || el.boundEndId) {
      const from = el.boundStartId ? byId.get(el.boundStartId) : undefined;
      const to = el.boundEndId ? byId.get(el.boundEndId) : undefined;
      const name = (target: CanvasElement | undefined): string =>
        target ? `${target.type}${label(target) ? ` "${label(target).slice(0, 40)}"` : ''}` : 'nothing';
      parts.push(`connects ${name(from)} -> ${name(to)}`);
    }

    return parts.join(', ');
  });

  return [`Canvas with ${live.length} element(s):`, ...lines].join('\n');
}
