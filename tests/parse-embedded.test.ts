import { describe, expect, it } from 'bun:test';
import { normalizeHeadingSectionTarget } from '../src/parse-embedded';

describe('normalizeHeadingSectionTarget', () => {
  it('matches observed Obsidian bookmark normalization for special separators', () => {
    const input = 'T!e@s#t$ %h^e&a*d(i)n-g+ _w=i[t]h{ } ;e"x:t\'r,a. >c?h/a\\r`s~';
    const expected = 'T!e@s t$ %h e&a*d(i)n-g+ _w=i[t]h{ } ;e"x t\'r,a. >c?h/a r`s~';
    expect(normalizeHeadingSectionTarget(input)).toBe(expected);
  });
});
