import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FileService } from './file.service';
import { FileRepository } from './file.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [FilesController],
  providers: [FileService, FileRepository],
  exports: [FileService],
})
export class FilesModule {}
