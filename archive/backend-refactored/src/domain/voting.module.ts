/**
 * Voting Domain Module
 * Provides voting services and interfaces
 */

import { Module } from '@nestjs/common';
import { VotingService } from './services/voting.service';

@Module({
  providers: [
    {
      provide: 'IVotingService',
      useClass: VotingService,
    },
    VotingService,
  ],
  exports: [
    'IVotingService',
    VotingService,
  ],
})
export class VotingModule {}