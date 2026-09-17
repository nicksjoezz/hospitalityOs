import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import {
  registerHotelSchema,
  RegisterHotelDto,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/decorators';
import { PlatformService } from './platform.service';

/** Public, unauthenticated tenant onboarding + plan discovery. */
@Controller('platform')
export class RegistrationController {
  constructor(private readonly platform: PlatformService) {}

  @Public()
  @Get('plans/public')
  publicPlans() {
    return this.platform.listPublicPlans();
  }

  /** Find-your-hotel search by name (root landing page). */
  @Public()
  @Get('find-hotels')
  findHotels(@Query('q') q: string) {
    return this.platform.searchHotels(q ?? '');
  }

  /** Resolve a per-hotel login slug to its name, for the scoped login page. */
  @Public()
  @Get('hotel/:slug')
  hotelBySlug(@Param('slug') slug: string) {
    return this.platform.hotelBySlug(slug);
  }

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerHotelSchema)) dto: RegisterHotelDto,
    @Ip() ip: string,
  ) {
    return this.platform.register(dto, ip);
  }
}
