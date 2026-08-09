import { describe, expect, it } from 'vitest';
import { buildScanFailureState, SCAN_UNEXPECTED_ERROR_MESSAGE } from '../scanFailureState';

describe('buildScanFailureState', () => {
  it('marks the scan as done (so isScanning becomes false)', () => {
    const state = buildScanFailureState('history-1');
    expect(state.done).toBe(true);
  });

  it('carries the historyId through unchanged', () => {
    expect(buildScanFailureState('history-1').historyId).toBe('history-1');
    expect(buildScanFailureState(null).historyId).toBeNull();
  });

  it('never reports a fake result (opportunitiesFound/failedSearches stay null)', () => {
    const state = buildScanFailureState('history-1');
    expect(state.opportunitiesFound).toBeNull();
    expect(state.failedSearches).toBeNull();
  });

  it('shows a clean French message, never a raw technical error', () => {
    const state = buildScanFailureState('history-1');
    expect(state.error).toBe(SCAN_UNEXPECTED_ERROR_MESSAGE);
    expect(state.error).not.toMatch(/error|exception|undefined|null|\[object/i);
  });
});
