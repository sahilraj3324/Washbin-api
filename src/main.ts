import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

let cachedHandler: RequestHandler | undefined;

/** Builds the app without binding a port, so serverless can reuse it. */
export async function createApp(): Promise<INestApplication> {
  // abortOnError:false so a failed module init rejects instead of calling
  // process.exit(1), letting bootstrap() report the reason.
  const app = await NestFactory.create(AppModule, { abortOnError: false });

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Washbin API')
    .setDescription('Washbin API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );

  return app;
}

function startupErrorBody(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return {
    status: 'startup_failed',
    error: message,
    envVarsPresent: {
      MONGODB_URI: Boolean(process.env.MONGODB_URI),
      MONGODB_DB_NAME: Boolean(process.env.MONGODB_DB_NAME),
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      JWT_EXPIRES_IN_SECONDS: Boolean(process.env.JWT_EXPIRES_IN_SECONDS),
      FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
      FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    },
  };
}

function sendStartupError(error: unknown, res: ServerResponse): void {
  const body = startupErrorBody(error);
  const stack = error instanceof Error ? error.stack : undefined;

  new Logger('Bootstrap').error(`Startup failed: ${body.error}`, stack);
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

async function getServerlessHandler(): Promise<RequestHandler> {
  if (!cachedHandler) {
    const app = await createApp();
    await app.init();
    cachedHandler = app.getHttpAdapter().getInstance() as RequestHandler;
  }

  return cachedHandler;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const server = await getServerlessHandler();
    server(req, res);
  } catch (error) {
    sendStartupError(error, res);
  }
}

/**
 * If startup fails the process would normally exit, which a platform can only
 * report as an opaque 500. Serve the reason on every route instead.
 */
function serveStartupError(error: unknown, port: number): void {
  const body = startupErrorBody(error);
  const stack = error instanceof Error ? error.stack : undefined;

  new Logger('Bootstrap').error(`Startup failed: ${body.error}`, stack);

  http
    .createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body, null, 2));
    })
    .listen(port, '0.0.0.0');
}

async function bootstrap() {
  // Vercel injects PORT and runs dist/main.js as the server entrypoint.
  const port = Number(process.env.PORT ?? 3000);

  try {
    const app = await createApp();
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    serveStartupError(error, port);
  }
}

if (require.main === module) {
  void bootstrap();
}
