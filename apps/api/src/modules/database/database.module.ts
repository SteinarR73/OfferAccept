import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { prisma } from '@offeracept/database';

// Exported so all modules can inject the PrismaClient via DI.
// Marked @Global so it does not need to be re-imported per module.

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA',
      useValue: prisma,
    },
  ],
  exports: ['PRISMA'],
})
export class DatabaseModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await prisma.$disconnect();
  }
}
