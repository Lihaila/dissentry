import { describe, expect, it } from 'vitest';
import { friendlyError } from '../src/lib/providers';
import type { Profile } from '../src/lib/types';

const p = { handle: 'grok', baseUrl: 'https://api.x.ai/v1', modelId: 'grok-4.3' } as Profile;
const apiErr = (statusCode: number, responseBody: string, message = '') => Object.assign(new Error(message), { statusCode, responseBody });

describe('friendlyError', () => {
  it('reads xAI-style string errors and flags bad keys', () => {
    const m = friendlyError(apiErr(400, '{"code":"invalid-argument","error":"Incorrect API key provided."}'), p);
    expect(m).toMatch(/Authentication failed for @grok.*Incorrect API key/);
  });
  it('recognises Gemini key errors', () => {
    expect(friendlyError(apiErr(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}'), p)).toMatch(/Authentication failed/);
  });
  it('never returns an empty message', () => {
    expect(friendlyError(apiErr(500, ''), p)).toBe('HTTP 500 · https://api.x.ai/v1');
    expect(friendlyError(apiErr(502, 'Bad gateway'), p)).toBe('Bad gateway');
  });
  it('maps missing models', () => {
    expect(friendlyError(apiErr(404, '{"error":{"message":"The model `x` does not exist"}}'), p)).toMatch(/not found/);
  });
});
