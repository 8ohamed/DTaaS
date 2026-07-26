import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import Config from './config/config.service.js';

const BEARER_PREFIX = 'Bearer ';

function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function tokensMatch(expected: string, provided: string): boolean {
  return timingSafeEqual(hash(expected), hash(provided));
}

@Injectable()
export default class LoggerAuthGuard implements CanActivate {
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.config.getAuthToken();
    if (expectedToken === '') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorizationHeader = request.headers.authorization ?? '';
    const providedToken = authorizationHeader.startsWith(BEARER_PREFIX)
      ? authorizationHeader.slice(BEARER_PREFIX.length)
      : '';

    if (providedToken === '' || !tokensMatch(expectedToken, providedToken)) {
      throw new UnauthorizedException('Invalid or missing bearer token');
    }

    return true;
  }
}
