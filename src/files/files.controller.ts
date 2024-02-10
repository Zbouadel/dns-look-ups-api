import { Controller, All } from '@nestjs/common';
import { EVENTS, POST_FINISH, POST_RECEIVE, POST_TERMINATE, Server } from '@tus/server';
import { FileStore } from '@tus/file-store';

const tusServer = new Server({
  path: '/files',
  datastore: new FileStore({ directory: './files' })
});

@Controller('files')
export class FilesController {
  
  @All()
  handleFileUpload(req, res) {
    tusServer.handle(req, res);
  }
}