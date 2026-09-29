import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PartnerTokenPayload } from './partner-auth.guard';

/**
 * Reads the payload PartnerAuthGuard put on the request, so `/me` routes take
 * the partner id from the token instead of trusting the body or the path.
 */
export const CurrentPartner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PartnerTokenPayload => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: PartnerTokenPayload }>();

    // Only reachable if the route forgot PartnerAuthGuard.
    if (!request.user) {
      throw new UnauthorizedException('Missing partner token');
    }
    return request.user;
  },
);
