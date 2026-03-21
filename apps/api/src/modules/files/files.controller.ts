import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsInt, IsPositive, MaxLength, IsHexadecimal, Length } from 'class-validator';
import { Request } from 'express';
import { FileService } from './file.service';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class PresignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  mime!: string;

  @IsInt()
  @IsPositive()
  size!: number;
}

class CompleteUploadDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @IsHexadecimal()
  @Length(64, 64)
  sha256!: string;  // lowercase hex SHA-256 of the uploaded file content
}

// ─── FilesController ──────────────────────────────────────────────────────────
// Routes under /api/v1/files
//
// POST /files/presign       — validate, create PENDING record, return presigned URL
// POST /files/complete      — confirm upload; verify hash; mark READY
// GET  /files/:id/download  — return presigned GET URL (1-hour TTL)
//
// All routes require JWT. organizationId and userId come from the JWT payload;
// they are never accepted from the request body (prevents cross-org attacks).
//
// The presigned upload URL returned by /presign must NOT be logged or cached.
// It contains time-limited AWS S3 credentials and expires in 5 minutes.

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly fileService: FileService) {}

  @Post('presign')
  async presign(
    @Body() dto: PresignDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const { fileId, uploadUrl, expiresAt } = await this.fileService.generatePresignUrl(
      req.user.orgId,
      req.user.sub,   // uploadedByUserId — always from verified JWT, never request body
      dto.filename,
      dto.mime,
      dto.size,
    );

    return { fileId, uploadUrl, expiresAt };
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Body() dto: CompleteUploadDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const file = await this.fileService.completeUpload(
      req.user.orgId,
      dto.fileId,
      dto.sha256,
    );

    return {
      id: file.id,
      filename: file.filename,
      mime: file.mime,
      size: file.size,
      sha256: file.sha256,
      status: file.status,
      createdAt: file.createdAt,
    };
    // s3Key is intentionally omitted from the response — callers get download URLs
    // via GET /files/:id/download, never the raw storage key.
  }

  @Get(':id/download')
  async download(
    @Param('id') fileId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const url = await this.fileService.getDownloadUrl(req.user.orgId, fileId);
    // Return the URL in the response body — client uses it to fetch the file directly
    // from S3. The URL expires after 1 hour.
    return { url };
  }
}
