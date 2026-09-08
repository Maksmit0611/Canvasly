import { beforeEach, describe, expect, it } from 'vitest';
import {
  AA_CONTRAST, contrastRatio, fromHsl, getRecentColors, getSavedPalettes,
  isTransparent, meetsAA, normalizeColor, pushRecentColor, readableOn,
  savePalette, deletePalette, toHsl, toHslString, toRgbString,
} from './color';

beforeEach(() => localStorage.clear());

describe('normalizeColor', () => {
  it('accepts hex with and without the hash', () => {
    expect(normalizeColor('#ff0000')).toBe('#ff0000');
    expect(normalizeColor('ff0000')).toBe('#ff0000');
    expect(normalizeColor('#f00')).toBe('#ff0000');
  });

  it('accepts rgb() and hsl()', () => {
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
  });

  it('accepts CSS colour names', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
  });

  it('keeps the alpha channel when not fully opaque', () => {
    const result = normalizeColor('rgba(255, 0, 0, 0.5)');
    expect(result).toMatch(/^#ff0000[0-9a-f]{2}$/);
  });

  it('passes transparent through', () => {
    expect(normalizeColor('transparent')).toBe('transparent');
    expect(isTransparent('transparent')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(normalizeColor('not-a-colour')).toBeNull();
    expect(normalizeColor('')).toBeNull();
  });

  it('produces a value the element schema accepts', () => {
    const pattern = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    for (const input of ['#f00', 'rgb(1,2,3)', 'hsl(200,50%,50%)', 'teal']) {
      expect(normalizeColor(input)!).toMatch(pattern);
    }
  });
});

describe('format conversions agree', () => {
  it('hex, rgb and hsl describe the same colour', () => {
    expect(toRgbString('#ff0000')).toBe('rgb(255, 0, 0)');
    expect(toHslString('#ff0000')).toBe('hsl(0, 100%, 50%)');
  });

  it('round-trips through HSL', () => {
    for (const hex of ['#ff0000', '#5b5bd6', '#1e1e1e', '#84cc16']) {
      expect(fromHsl(toHsl(hex))).toBe(hex);
    }
  });

  it('all three input routes yield the same stored value', () => {
    // Typing hex, typing rgb, and an eyedropper result must converge.
    const viaHex = normalizeColor('#5b5bd6');
    const viaRgb = normalizeColor('rgb(91, 91, 214)');
    const viaDropper = normalizeColor('#5B5BD6');
    expect(viaRgb).toBe(viaHex);
    expect(viaDropper).toBe(viaHex);
  });
});

describe('contrast', () => {
  it('scores black on white at the maximum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('flags light grey text on white as below AA', () => {
    expect(meetsAA('#c4c4c7', '#ffffff')).toBe(false);
    expect(contrastRatio('#c4c4c7', '#ffffff')).toBeLessThan(AA_CONTRAST);
  });

  it('passes near-black on near-white', () => {
    expect(meetsAA('#1e1e1e', '#fbfbfb')).toBe(true);
  });

  it('picks a readable label colour for a swatch', () => {
    expect(readableOn('#1e1e1e')).toBe('#ffffff');
    expect(readableOn('#ffffff')).toBe('#1e1e1e');
  });
});

describe('recent colours', () => {
  it('stores most-recent first', () => {
    pushRecentColor('#ff0000');
    pushRecentColor('#00ff00');
    expect(getRecentColors()).toEqual(['#00ff00', '#ff0000']);
  });

  it('de-duplicates by moving an existing colour to the front', () => {
    pushRecentColor('#ff0000');
    pushRecentColor('#00ff00');
    pushRecentColor('#ff0000');
    expect(getRecentColors()).toEqual(['#ff0000', '#00ff00']);
  });

  it('caps the list at twelve', () => {
    for (let i = 0; i < 20; i++) {
      pushRecentColor(`#${i.toString(16).padStart(6, '0')}`);
    }
    expect(getRecentColors()).toHaveLength(12);
  });

  it('does not record transparent', () => {
    pushRecentColor('transparent');
    expect(getRecentColors()).toEqual([]);
  });

  it('survives a reload', () => {
    pushRecentColor('#123456');
    // A fresh read models the next page load.
    expect(getRecentColors()).toContain('#123456');
  });
});

describe('saved palettes', () => {
  it('saves, replaces by name, and deletes', () => {
    savePalette('Brand', ['#ff0000', '#00ff00']);
    expect(getSavedPalettes()).toHaveLength(1);

    savePalette('Brand', ['#0000ff']);
    expect(getSavedPalettes()).toHaveLength(1);
    expect(getSavedPalettes()[0]!.colors).toEqual(['#0000ff']);

    deletePalette('Brand');
    expect(getSavedPalettes()).toEqual([]);
  });
});
