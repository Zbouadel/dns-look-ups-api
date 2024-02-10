import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EVENTS, POST_FINISH, POST_RECEIVE, POST_TERMINATE, Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { AppController } from './app.controller';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const tusServer = new Server({
    path: '/files',
    datastore: new FileStore({ directory: './files' })
  });

  tusServer.on(EVENTS.POST_FINISH, ((req, res, upload) => {
    console.log("🚀 ~ tusServer.on ~ upload:", upload)
    const myController = app.get(AppController);
    myController.convertFileToJsonArray(`./files/${upload.id}`);
  }))

  app.use('/files', (req, res, next) => {
    tusServer.handle(req, res);
  });

  await app.listen(3003);
}
bootstrap();
