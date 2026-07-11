import { describe, expect, it } from 'vitest';
import { scanMarketDefinition } from '../handlers/scanMarket';
import { checkAuthenticated, checkNoScanInProgress } from '../checks';
import { makeActionContext } from './fixtures';
import type { ActionRequest } from '../types';
import type { ScanMarketPayload } from '../handlers/scanMarket';

const request: ActionRequest<ScanMarketPayload> = {
  kind: 'scan_market',
  vintedAccountId: null,
  payload: {},
};

describe('scanMarketDefinition', () => {
  it('has the expected kind and checks', () => {
    expect(scanMarketDefinition.kind).toBe('scan_market');
    expect(scanMarketDefinition.checks).toEqual([checkAuthenticated, checkNoScanInProgress]);
  });

  it('has an execute() - dispatches the GitHub Actions workflow, not the extension', () => {
    expect(scanMarketDefinition.execute).toBeDefined();
  });

  it('buildPreview returns a stable summary with no invented details', () => {
    const preview = scanMarketDefinition.buildPreview(request, makeActionContext());
    expect(preview.summary).toBe('Scanner le marché Vinted pour de nouvelles opportunités');
    expect(preview.details).toEqual({});
  });
});
