import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface PartnerTokenPayload {
  sub: string;
  type: string;
  phone: string;
}

@Injectable()
export class PartnerAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: PartnerTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<PartnerTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A partner token must not unlock customer routes, or vice versa.
    if (payload.type !== 'partner') {
      throw new UnauthorizedException('Token is not a partner token');
    }

    (request as Request & { user: PartnerTokenPayload }).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }
}
