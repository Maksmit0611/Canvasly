import { describe, expect, it } from 'vitest';
import {
  flattenBlocks, layoutRichText, toPlainText,
  type LayoutOptions, type RichTextNode, type StyledRun,
} from './richTextLayout';

/** Deterministic stand-in for canvas measurement: every glyph is 10 units wide. */
const measureText = (text: string, run: StyledRun): number =>
  text.length * (run.fontSize / 2);

const options = (over: Partial<LayoutOptions> = {}): LayoutOptions => ({
  width: 200,
  fontSize: 20,
  fontFamily: 'Inter',
  lineHeight: 1.4,
  align: 'left',
  color: '#1e1e1e',
  measureText,
  ...over,
});

const doc = (content: RichTextNode[]): RichTextNode => ({ type: 'doc', content });
const para = (content: RichTextNode[]): RichTextNode => ({ type: 'paragraph', content });
const text = (t: string, marks?: RichTextNode['marks']): RichTextNode => ({ type: 'text', text: t, marks });

describe('mixed marks in one paragraph', () => {
  const input = doc([
    para([
      text('plain '),
      text('bold', [{ type: 'bold' }]),
      text(' and '),
      text('red', [{ type: 'textStyle', attrs: { color: '#ff0000' } }]),
    ]),
  ]);

  it('preserves each mark on its own run', () => {
    const { lines } = layoutRichText(input, options({ width: 1000 }));
    const runs = lines.flatMap((l) => l.runs);

    const bold = runs.find((r) => r.text.trim() === 'bold');
    expect(bold?.bold).toBe(true);

    const red = runs.find((r) => r.text.trim() === 'red');
    expect(red?.color).toBe('#ff0000');

    const plain = runs.find((r) => r.text.trim() === 'plain');
    expect(plain?.bold).toBe(false);
    expect(plain?.color).toBe('#1e1e1e');
  });

  it('lays runs left to right without overlapping', () => {
    const { lines } = layoutRichText(input, options({ width: 1000 }));
    const runs = lines[0]!.runs;

    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.x).toBeGreaterThanOrEqual(runs[i - 1]!.x + runs[i - 1]!.width - 0.001);
    }
  });
});

describe('headings', () => {
  it('scales the font and forces bold', () => {
    const input = doc([{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }]);
    const run = layoutRichText(input, options({ width: 1000 })).lines[0]!.runs[0]!;

    expect(run.fontSize).toBe(40);
    expect(run.bold).toBe(true);
  });

  it('gives h2 a smaller size than h1', () => {
    const h1 = layoutRichText(
      doc([{ type: 'heading', attrs: { level: 1 }, content: [text('A')] }]),
      options(),
    ).lines[0]!.runs[0]!;
    const h2 = layoutRichText(
      doc([{ type: 'heading', attrs: { level: 2 }, content: [text('A')] }]),
      options(),
    ).lines[0]!.runs[0]!;

    expect(h2.fontSize).toBeLessThan(h1.fontSize);
  });
});

describe('lists', () => {
  it('emits a bullet marker per item at a hanging indent', () => {
    const input = doc([
      {
        type: 'bulletList',
        content: ['one', 'two', 'three'].map((t) => ({
          type: 'listItem',
          content: [para([text(t)])],
        })),
      },
    ]);

    const { lines } = layoutRichText(input, options({ width: 1000 }));
    expect(lines).toHaveLength(3);

    for (const line of lines) {
      expect(line.runs[0]!.text).toBe('•');
      // The marker hangs left of the text.
      expect(line.runs[0]!.x).toBeLessThan(line.runs[1]!.x);
    }
  });

  it('numbers ordered lists sequentially', () => {
    const input = doc([
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: ['a', 'b', 'c'].map((t) => ({ type: 'listItem', content: [para([text(t)])] })),
      },
    ]);

    const markers = layoutRichText(input, options({ width: 1000 })).lines.map((l) => l.runs[0]!.text);
    expect(markers).toEqual(['1.', '2.', '3.']);
  });

  it('respects a non-default start attribute', () => {
    const input = doc([
      {
        type: 'orderedList',
        attrs: { start: 5 },
        content: [{ type: 'listItem', content: [para([text('x')])] }],
      },
    ]);
    expect(layoutRichText(input, options()).lines[0]!.runs[0]!.text).toBe('5.');
  });

  it('indents a nested list further than its parent', () => {
    const input = doc([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              para([text('outer')]),
              { type: 'bulletList', content: [{ type: 'listItem', content: [para([text('inner')])] }] },
            ],
          },
        ],
      },
    ]);

    const blocks = flattenBlocks(input, options());
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.indent).toBeGreaterThan(blocks[0]!.indent);
  });
});

describe('line wrapping', () => {
  it('wraps at the width boundary', () => {
    // Each char is 10 wide at fontSize 20, so 200px fits 20 characters.
    const input = doc([para([text('aaaa bbbb cccc dddd eeee')])]);
    const { lines } = layoutRichText(input, options({ width: 200 }));

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.width).toBeLessThanOrEqual(200.001);
    }
  });

  it('keeps every word, in order, across the wrap', () => {
    const input = doc([para([text('alpha bravo charlie delta echo')])]);
    const { lines } = layoutRichText(input, options({ width: 200 }));

    const joined = lines
      .flatMap((l) => l.runs.map((r) => r.text))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    expect(joined).toBe('alpha bravo charlie delta echo');
  });

  it('advances y for each wrapped line', () => {
    const input = doc([para([text('alpha bravo charlie delta echo foxtrot')])]);
    const { lines } = layoutRichText(input, options({ width: 200 }));

    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]!.y).toBeGreaterThan(lines[i - 1]!.y);
    }
  });

  it('does not drop a word longer than the line', () => {
    const input = doc([para([text('supercalifragilisticexpialidocious')])]);
    const { lines } = layoutRichText(input, options({ width: 50 }));
    expect(lines.flatMap((l) => l.runs).length).toBeGreaterThan(0);
  });

  it('reports a total height covering every line', () => {
    const input = doc([para([text('alpha bravo charlie delta echo')])]);
    const result = layoutRichText(input, options({ width: 200 }));
    const last = result.lines[result.lines.length - 1]!;
    expect(result.height).toBeGreaterThanOrEqual(last.y + last.height - 0.001);
  });
});

describe('alignment', () => {
  it('centres and right-aligns relative to left', () => {
    const input = doc([para([text('hi')])]);
    const left = layoutRichText(input, options({ align: 'left' })).lines[0]!.runs[0]!.x;
    const center = layoutRichText(input, options({ align: 'center' })).lines[0]!.runs[0]!.x;
    const right = layoutRichText(input, options({ align: 'right' })).lines[0]!.runs[0]!.x;

    expect(center).toBeGreaterThan(left);
    expect(right).toBeGreaterThan(center);
  });
});

describe('edge cases', () => {
  it('handles an empty or missing document', () => {
    expect(layoutRichText(null, options()).lines).toEqual([]);
    expect(layoutRichText(doc([]), options()).lines).toEqual([]);
  });

  it('gives an empty paragraph a full line of height', () => {
    const { lines } = layoutRichText(doc([para([])]), options());
    expect(lines).toHaveLength(1);
    expect(lines[0]!.height).toBeGreaterThan(0);
  });
});

describe('toPlainText', () => {
  it('flattens nested content', () => {
    const input = doc([
      { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
      para([text('Hello '), text('world', [{ type: 'bold' }])]),
    ]);
    expect(toPlainText(input)).toBe('Title\nHello world');
  });

  it('returns an empty string for nothing', () => {
    expect(toPlainText(null)).toBe('');
  });
});
