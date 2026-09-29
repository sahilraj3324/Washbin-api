import { Controller, Get, Inject } from '@nestjs/common';
import { Connection } from 'mongoose';
import { AppService } from './app.service';

/**
 * @nestjs/mongoose's default connection token, referenced literally rather than
 * via getConnectionToken(): that package is ESM and jest cannot require it, so
 * importing it here would make this controller untestable.
 */
const DATABASE_CONNECTION = 'DatabaseConnection';

const READY_STATES = [
  'disconnected',
  'connected',
  'connecting',
  'disconnecting',
];

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(DATABASE_CONNECTION) private readonly connection: Connection,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Reports what the running instance can see. Names only, never values. */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      node: process.version,
      env: process.env.NODE_ENV ?? null,
      database: {
        state: READY_STATES[this.connection.readyState] ?? 'unknown',
        name: this.connection.name ?? null,
      },
      envVarsPresent: {
        MONGODB_URI: Boolean(process.env.MONGODB_URI),
        MONGODB_DB_NAME: Boolean(process.env.MONGODB_DB_NAME),
        JWT_SECRET: Boolean(process.env.JWT_SECRET),
        JWT_EXPIRES_IN_SECONDS: Boolean(process.env.JWT_EXPIRES_IN_SECONDS),
      },
    };
  }
}
