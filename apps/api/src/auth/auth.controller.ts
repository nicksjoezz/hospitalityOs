import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  loginSchema,
  LoginDto,
  refreshSchema,
  RefreshDto,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AllowSuspended, CurrentUser, Public, AuthUser } from '../common/decorators';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.id);
    return { ok: true };
  }

  @AllowSuspended()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const hotel = await this.auth.hotelContext(user.hotelId);
    return { user, hotel };
  }
}
