import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgRoleGuard, RequireOrgRole } from '../organizations/guards/org-role.guard';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto } from './dtos/create-webhook.dto';
import { UpdateWebhookDto } from './dtos/update-webhook.dto';

// ─── WebhooksController ────────────────────────────────────────────────────────
// Routes under /api/v1/webhooks
//
// All routes require JWT + ADMIN or OWNER role.
//
// POST   /webhooks                    — create endpoint. Secret returned ONCE in response.
// GET    /webhooks                    — list endpoints (no secret in response)
// PUT    /webhooks/:id                — update url, events, or enabled flag
// DELETE /webhooks/:id                — delete endpoint + delivery history
// POST   /webhooks/:id/test           — send a test.ping delivery to verify the endpoint
// POST   /webhooks/:id/rotate-secret  — invalidate old secret and issue a new one (returned ONCE)
//
// Events:
//   offer.accepted     — emitted when a recipient accepts an offer
//   certificate.issued — emitted when the AcceptanceCertificate is generated
//
// Signature header: X-OfferAccept-Signature: sha256=<HMAC-SHA256(secret, body)>
// Delivery ID header: X-OfferAccept-Delivery: <webhookEventId>
// Event header:       X-OfferAccept-Event: <event>

@Controller('webhooks')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@RequireOrgRole('ADMIN')
export class WebhooksController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWebhookDto, @CurrentUser() user: JwtPayload) {
    return this.webhookService.createEndpoint({
      organizationId: user.orgId,
      url: dto.url,
      events: dto.events,
    });
    // Secret is in the response — returned ONCE. Customer must store it securely.
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.webhookService.listEndpoints(user.orgId);
  }

  @Put(':id')
  async update(
    @Param('id') endpointId: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webhookService.updateEndpoint(endpointId, user.orgId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') endpointId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ deleted: boolean }> {
    await this.webhookService.deleteEndpoint(endpointId, user.orgId);
    return { deleted: true };
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async test(
    @Param('id') endpointId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ queued: boolean }> {
    await this.webhookService.testEndpoint(endpointId, user.orgId);
    return { queued: true };
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(
    @Param('id') endpointId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string; secret: string }> {
    // New secret returned ONCE — old secret is immediately invalidated.
    // The customer must update their webhook handler with the new secret.
    return this.webhookService.rotateSecret(endpointId, user.orgId);
  }
}
