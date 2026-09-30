import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AdminTokenPayload {
  sub: string;
  type: 'admin';
  email: string;
  role: string;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AdminTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Token is not an admin token');
    }

    (request as Request & { user: AdminTokenPayload }).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }
}
