import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.ts';
import { connectDB, disconnectDB } from './config/db.ts';
import { setupSimulationSockets } from './sockets/simulationSocket.ts';

// Load environment configuration if available
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

async function bootstrap() {
  // Connect to database (with automatic fallback to in-memory mode if offline)
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  setupSimulationSockets(io);

  server.listen(PORT, () => {
    console.log(`🚀 CitySim Server listening on http://localhost:${PORT}`);
    console.log(`📡 WebSocket endpoint ready for live simulation streaming.`);
    console.log(`🩺 Healthcheck: http://localhost:${PORT}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down CitySim server gracefully...');
    server.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
