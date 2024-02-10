import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FilesModule } from './files/files.module';
@Module({
  imports: [FilesModule],
  controllers: [AppController],
})
export class AppModule {}
