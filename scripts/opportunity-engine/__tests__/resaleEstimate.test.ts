import { describe, expect, it } from 'vitest';
import { computeResaleEstimate } from '../resaleEstimate';
import { MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE } from '../constants';
import { makeContext } from './fixtures';

describe('computeResaleEstimate', () => {
  it('returns null (never a fabricated number) below the minimum sample size', () => {
    const ctx = makeContext({ delistingSamples: [{ daysVisible: 10 }, { daysVisible: 20 }] });
    expect(computeResaleEstimate(ctx)).toBeNull();
  });

  it('returns a real day-range once enough delisting samples exist', () => {
    const samples = Array.from({ length: MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE + 2 }, (_, i) => ({
      daysVisible: 5 + i * 3,
    }));
    const ctx = makeContext({ delistingSamples: samples });
    const result = computeResaleEstimate(ctx);
    expect(result).not.toBeNull();
    expect(result!.minDays).toBeLessThanOrEqual(result!.maxDays);
    expect(result!.confidence).toBeLessThanOrEqual(90);
  });
});
