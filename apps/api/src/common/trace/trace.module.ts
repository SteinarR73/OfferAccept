import { Global, Module } from '@nestjs/common';
import { TraceContext } from './trace.context';

// ─── TraceModule ───────────────────────────────────────────────────────────────
// Global module that provides TraceContext as a singleton across the entire
// application. Marking it @Global() means any module can inject TraceContext
// without importing TraceModule explicitly.
//
// Imported once in AppModule. Not imported elsewhere.

@Global()
@Module({
  providers: [TraceContext],
  exports: [TraceContext],
})
export class TraceModule {}
