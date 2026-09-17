import { Module } from '@nestjs/common';
import { NightAuditService } from './night-audit.service';
import { NightAuditController } from './night-audit.controller';

@Module({
  controllers: [NightAuditController],
  providers: [NightAuditService],
})
export class NightAuditModule {}
