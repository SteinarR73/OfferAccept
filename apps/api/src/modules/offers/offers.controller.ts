import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Inject,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';
import { OffersService } from './services/offers.service';
import { SendOfferService } from './services/send-offer.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { SetRecipientDto } from './dto/set-recipient.dto';
import { AddDocumentDto } from './dto/add-document.dto';

// ─── OffersController ─────────────────────────────────────────────────────────
// All endpoints require JWT authentication.
// Org scope is enforced implicitly: every service call passes user.orgId.
// Controllers stay thin — no business logic here.

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly sendOfferService: SendOfferService,
    @Inject('PRISMA') private readonly db: PrismaClient,
  ) {}

  // GET /offers?page=1&pageSize=20
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.offersService.list(user.orgId, page, Math.min(pageSize, 100));
  }

  // GET /offers/:id
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.offersService.findOne(id, user.orgId);
  }

  // POST /offers — create draft
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateOfferDto, @CurrentUser() user: JwtPayload) {
    const offer = await this.offersService.create(user.orgId, user.sub, body);
    return { offerId: offer.id, status: offer.status };
  }

  // PATCH /offers/:id — update draft fields
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOfferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offersService.update(id, user.orgId, body);
  }

  // PUT /offers/:id/recipient — set or replace recipient
  @Put(':id/recipient')
  @HttpCode(HttpStatus.OK)
  async setRecipient(
    @Param('id') id: string,
    @Body() body: SetRecipientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offersService.setRecipient(id, user.orgId, body);
  }

  // POST /offers/:id/documents — attach document metadata
  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  async addDocument(
    @Param('id') id: string,
    @Body() body: AddDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.offersService.addDocument(id, user.orgId, body);
  }

  // DELETE /offers/:id/documents/:docId
  @Delete(':id/documents/:docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.offersService.removeDocument(id, user.orgId, docId);
  }

  // POST /offers/:id/send — freeze + tokenize + send email
  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Load the sending user's name/email for the snapshot and email template
    const sender = await this.db.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { name: true, email: true },
    });

    const result = await this.sendOfferService.send(
      id,
      user.orgId,
      sender.name,
      sender.email,
    );

    return {
      offerId: id,
      status: 'SENT',
      snapshotId: result.snapshotId,
      sentAt: result.sentAt.toISOString(),
      deliveryAttemptId: result.deliveryAttemptId,
      deliveryOutcome: result.deliveryOutcome,
    };
  }

  // POST /offers/:id/resend — re-send the offer link with a fresh signing token
  //
  // Allowed only when the offer is SENT and the recipient token is not invalidated.
  // Generates a new signing token (old link is superseded).
  // Email content is sourced from the frozen OfferSnapshot, not the mutable offer.
  // Creates a new OfferDeliveryAttempt for audit trail regardless of outcome.
  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  async resend(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.sendOfferService.resend(id, user.orgId, user.sub);
    return {
      offerId: id,
      deliveryAttemptId: result.deliveryAttemptId,
      deliveryOutcome: result.deliveryOutcome,
    };
  }

  // GET /offers/:id/delivery — delivery attempt history for an offer
  //
  // Returns all delivery attempts newest-first, plus the current delivery state
  // derived from the most recent attempt.
  @Get(':id/delivery')
  async getDelivery(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sendOfferService.getDeliveryHistory(id, user.orgId);
  }

  // POST /offers/:id/revoke
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.sendOfferService.revoke(id, user.orgId);
    return { revoked: true };
  }
}
