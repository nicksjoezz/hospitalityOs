import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createPlatformAdminSchema,
  CreatePlatformAdminDto,
  platformLoginSchema,
  PlatformLoginDto,
  refreshSchema,
  RefreshDto,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CurrentPlatformAdmin,
  Platform,
  PlatformPrincipal,
  Public,
} from '../common/decorators';
import { PlatformAuthService } from './platform-auth.service';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(platformLoginSchema)) dto: PlatformLoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Platform()
  @Get('me')
  me(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return { admin };
  }

  @Platform()
  @Get('admins')
  listAdmins() {
    return this.auth.listAdmins();
  }

  @Platform()
  @Post('admins')
  createAdmin(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(createPlatformAdminSchema)) dto: CreatePlatformAdminDto,
  ) {
    return this.auth.createAdmin(admin.role, dto);
  }
}
