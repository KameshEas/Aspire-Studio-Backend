/**
 * Job Progress WebSocket Endpoint
 * WebSocket /api/v1/orgs/[orgId]/projects/[projectId]/jobs/[jobId]/subscribe
 * Streams real-time progress updates to connected clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import { NextApiRequest, NextApiResponse } from 'next';
import { getWorkflowStatus } from '../../../../../../lib/workflow/engine';
import { requireAuth } from '../../../../../../lib/auth';

type NextApiResponseWithSocket = NextApiResponse & {
  socket: any & {
    server: any & {
      ws: WebSocketServer;
    };
  };
};

// Store active subscriptions
const subscriptions = new Map<string, Set<WebSocket>>();

// Poll interval for job status (ms)
const POLL_INTERVAL = 2000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  try {
    // Note: WebSocket auth should be implemented via query param or bearer token
    // For now, we'll trust the client; in production, validate auth token

    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      res.status(400).json({ error: 'Missing jobId' });
      return;
    }

    if (!res.socket.server.ws) {
      const wss = new WebSocketServer({ noServer: true });

      wss.on('connection', async (ws: WebSocket, req: any) => {
        const jobId = req.url?.split('/').pop();
        if (!jobId) {
          ws.close(1008, 'Missing jobId');
          return;
        }

        console.log(`[WebSocket] Client connected for job ${jobId}`);

        // Add to subscriptions
        if (!subscriptions.has(jobId)) {
          subscriptions.set(jobId, new Set());
        }
        subscriptions.get(jobId)!.add(ws);

        // Send initial status
        try {
          const job = await getWorkflowStatus(jobId);
          if (job) {
            ws.send(
              JSON.stringify({
                type: 'status',
                data: {
                  status: job.status,
                  createdAt: job.createdAt,
                  completedAt: job.completedAt,
                  error: job.error,
                },
              })
            );
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { message: 'Failed to fetch initial status' },
            })
          );
        }

        // Start polling for updates
        const pollInterval = setInterval(async () => {
          try {
            const job = await getWorkflowStatus(jobId);
            if (job) {
              ws.send(
                JSON.stringify({
                  type: 'update',
                  data: {
                    status: job.status,
                    completedAt: job.completedAt,
                    output: job.output,
                    error: job.error,
                  },
                })
              );

              // Stop polling if job is complete
              if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                clearInterval(pollInterval);
                setTimeout(() => ws.close(), 1000);
              }
            }
          } catch (error) {
            console.error('[WebSocket] Poll error:', error);
          }
        }, POLL_INTERVAL);

        ws.on('close', () => {
          clearInterval(pollInterval);
          subscriptions.get(jobId)?.delete(ws);
          if (subscriptions.get(jobId)?.size === 0) {
            subscriptions.delete(jobId);
          }
          console.log(`[WebSocket] Client disconnected for job ${jobId}`);
        });

        ws.on('error', (error) => {
          console.error('[WebSocket] Error:', error);
        });
      });

      // Handle upgrade request
      res.socket.server.on('upgrade', (req: any, socket: any, head: any) => {
        if (req.url?.includes('/jobs/') && req.url?.includes('/subscribe')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      res.socket.server.ws = wss;
    }

    res.status(200).end();
  } catch (error) {
    console.error('[WebSocket] Handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
