import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserPrincipal } from './user-principal';

/** Reads the principal AnyUserAuthGuard put on the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: UserPrincipal }>();

    // Only reachable if the route forgot AnyUserAuthGuard.
    if (!request.user) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return request.user;
  },
);
