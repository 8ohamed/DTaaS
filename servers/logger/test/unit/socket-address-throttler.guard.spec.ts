import { describe, expect, it } from '@jest/globals';
import { getSocketTracker } from 'src/socket-address-throttler.guard';

describe('SocketAddressThrottlerGuard', () => {
  it('tracks the actual socket address', () => {
    expect(getSocketTracker({ socket: { remoteAddress: '172.20.0.5' } })).toBe(
      '172.20.0.5',
    );
  });

  it('ignores spoofable forwarded request fields', () => {
    expect(
      getSocketTracker({
        socket: { remoteAddress: '172.20.0.5' },
        ip: '198.51.100.10',
        ips: ['203.0.113.10'],
      }),
    ).toBe('172.20.0.5');
  });

  it('falls back when the socket address is missing', () => {
    expect(getSocketTracker({})).toBe('unknown');
  });
});
