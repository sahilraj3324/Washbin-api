import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { USER_TYPES, UserPrincipal, UserType } from './user-principal';

interface AnyTokenPayload {
  sub: string;
  type: string;
}

/**
 * Accepts either a customer or a partner token.
 *
 * Notifications and device tokens belong to both kinds of account, so these
 * routes cannot use one of the type-specific guards. The token's own `type`
 * claim decides which account the caller is, so a customer still cannot read
 * a partner's rows.
 */
@Injectable()
export class AnyUserAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AnyTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AnyTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!USER_TYPES.includes(payload.type as UserType)) {
      throw new UnauthorizedException('Unrecognised token type');
    }

    const principal: UserPrincipal = {
      id: payload.sub,
      userType: payload.type as UserType,
    };

    (request as Request & { user: UserPrincipal }).user = principal;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }
}
