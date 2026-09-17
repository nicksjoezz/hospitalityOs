import { Global, Module } from '@nestjs/common';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';

@Global()
@Module({
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
