/**
 * Worker Service Entry Point
 * Starts Bull queue processors for async workflow execution
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { getAllQueues, submitWorkflow } from '../lib/workflow/engine';
import { registerJobProcessors } from './processor';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function startWorker(): Promise<void> {
  try {
    console.log('[Worker] Starting job processor service...');
    console.log('[Worker] Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
    });

    // Initialize queues (from engine.ts)
    // This triggers lazy initialization of queue connections
    const queues = getAllQueues();

    // Register processors for all task queues
    await registerJobProcessors(queues);

    console.log(`[Worker] ✓ Job processors registered for ${queues.size} task queue(s)`);
    console.log('[Worker] Ready to process jobs. Listening for new work...');

    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    async function shutdown(): Promise<void> {
      console.log('[Worker] Received shutdown signal. Gracefully stopping...');
      try {
        for (const queue of queues.values()) {
          await queue.close();
        }
        console.log('[Worker] ✓ All queues closed');
        process.exit(0);
      } catch (error) {
        console.error('[Worker] Error during shutdown:', error);
        process.exit(1);
      }
    }

    // Keep worker alive
    setInterval(() => {
      // Periodic health check (optional)
    }, 60000);
  } catch (error) {
    console.error('[Worker] Failed to start:', error);
    process.exit(1);
  }
}

// Start worker if run directly
if (require.main === module) {
  startWorker().catch(console.error);
}

export { startWorker };
