import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';

// ─── DTO ──────────────────────────────────────────────────────────────────────

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

// ─── AuthController ───────────────────────────────────────────────────────────
// Minimal authentication: email + password → JWT.
//
// Users are created out-of-band (CLI or migration seed) in v1.
// No signup flow, no password reset — those are future auth features.

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('PRISMA') private readonly db: PrismaClient,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<{ token: string; expiresIn: string }> {
    const user = await this.db.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });

    // Always compare to prevent username enumeration timing attacks.
    // Use a static hash if user not found so bcrypt time is constant.
    const hashToCompare =
      user?.hashedPassword ??
      '$2a$10$invalidhashpaddingtoensureconstanttimexxxxxxxxxxxxxxxxxxx';

    const valid = await bcrypt.compare(body.password, hashToCompare);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      orgId: user.organizationId,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);
    return { token, expiresIn: '7d' };
  }
}
