import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { CustomerTokenPayload } from './customer-auth.guard';

/**
 * Reads the payload CustomerAuthGuard put on the request, so `/me` routes take
 * the customer id from the token instead of trusting the body or the path.
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerTokenPayload => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CustomerTokenPayload }>();

    // Only reachable if the route forgot CustomerAuthGuard.
    if (!request.user) {
      throw new UnauthorizedException('Missing customer token');
    }
    return request.user;
  },
);
