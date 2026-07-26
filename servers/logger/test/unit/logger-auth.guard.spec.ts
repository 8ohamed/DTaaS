import { describe, it, expect } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import LoggerAuthGuard from 'src/logger-auth.guard';
import Config from 'src/config/config.service';

function createContext(authorizationHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers:
          authorizationHeader === undefined
            ? {}
            : { authorization: authorizationHeader },
      }),
    }),
  } as unknown as ExecutionContext;
}

function createConfig(authToken: string): Config {
  return { getAuthToken: () => authToken } as Config;
}

describe('Logger auth guard', () => {
  it('allows requests when no auth token is configured', () => {
    const guard = new LoggerAuthGuard(createConfig(''));
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows requests with a matching bearer token', () => {
    const guard = new LoggerAuthGuard(createConfig('secret-token'));
    expect(guard.canActivate(createContext('Bearer secret-token'))).toBe(true);
  });

  it('rejects requests missing the authorization header', () => {
    const guard = new LoggerAuthGuard(createConfig('secret-token'));
    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with a mismatched bearer token', () => {
    const guard = new LoggerAuthGuard(createConfig('secret-token'));
    expect(() =>
      guard.canActivate(createContext('Bearer wrong-token')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects requests missing the Bearer prefix', () => {
    const guard = new LoggerAuthGuard(createConfig('secret-token'));
    expect(() => guard.canActivate(createContext('secret-token'))).toThrow(
      UnauthorizedException,
    );
  });
});
