import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface CustomerTokenPayload {
  sub: string;
  type: string;
  phone: string;
}

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: CustomerTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<CustomerTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A partner token must not unlock customer routes, or vice versa.
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Token is not a customer token');
    }

    (request as Request & { user: CustomerTokenPayload }).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }
}
