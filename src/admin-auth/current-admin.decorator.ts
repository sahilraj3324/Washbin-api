import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminTokenPayload } from './admin-auth.guard';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminTokenPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AdminTokenPayload;
  },
);
