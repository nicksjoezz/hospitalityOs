import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { FxService } from './fx.service';

@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  /** Live rate lookup for the UI, e.g. /fx/rate?from=USD&to=NGN. */
  @Get('rate')
  async rate(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) {
      throw new BadRequestException('from and to are required');
    }
    const rate = await this.fx.getRate(from, to);
    return { from: from.toUpperCase(), to: to.toUpperCase(), rate };
  }
}
