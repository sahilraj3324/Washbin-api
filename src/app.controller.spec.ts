import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // The health route reads the mongoose connection; stub it out here.
        // Literal token rather than getConnectionToken(), because jest can't
        // load @nestjs/mongoose under this project's module settings.
        {
          provide: 'DatabaseConnection',
          useValue: { readyState: 1, name: 'test' },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports the database state', () => {
      expect(appController.getHealth()).toMatchObject({
        status: 'ok',
        database: { state: 'connected', name: 'test' },
      });
    });
  });
});
