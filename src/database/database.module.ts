import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const uri = config.get<string>('MONGODB_URI');

        if (!uri) {
          throw new Error('MONGODB_URI is not defined');
        }

        return {
          uri,
          dbName: config.get<string>('MONGODB_DB_NAME'),
          autoIndex: config.get<string>('NODE_ENV') !== 'production',
          retryAttempts: Number(
            config.get<string>('MONGODB_RETRY_ATTEMPTS') ?? 1,
          ),
          retryDelay: Number(
            config.get<string>('MONGODB_RETRY_DELAY_MS') ?? 1000,
          ),
          serverSelectionTimeoutMS: Number(
            config.get<string>('MONGODB_SERVER_SELECTION_TIMEOUT_MS') ?? 5000,
          ),
          connectionFactory: (connection: Connection) => {
            const logConnected = () =>
              logger.log(`MongoDB connected to database "${connection.name}"`);

            // The connection is already open by the time this factory runs, so
            // the initial 'connected' event fires before we can listen for it.
            if (connection.readyState === ConnectionStates.connected) {
              logConnected();
            }

            connection.on('connected', logConnected);
            connection.on('disconnected', () =>
              logger.warn('MongoDB disconnected'),
            );
            connection.on('error', (error: Error) =>
              logger.error(`MongoDB connection error: ${error.message}`),
            );
            return connection;
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
