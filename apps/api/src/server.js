import 'dotenv/config';
import express from 'express';
import app from './app.js';
import { env } from './config/env.js';
import { initializeNCFSequences } from './shared/utils/ncf.js';
import { prisma } from './config/db.js';

const PORT = env.PORT;

const server = express();

server.use('/api', app);

async function startServer() {
  try {
    await initializeNCFSequences();
    console.log('[Factos] NCF sequences initialized');
  } catch (error) {
    console.warn('[Factos] Failed to initialize NCF sequences:', error.message);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Factos] Database connected');
  } catch (error) {
    console.error('[Factos] Database connection failed:', error.message);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Factos] Servidor ejecutándose en http://0.0.0.0:${PORT}`);
    console.log(`[Factos] Environment: ${env.NODE_ENV}`);
  });
}

process.on('SIGTERM', async () => {
  console.log('[Factos] SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Factos] SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer().catch(console.error);