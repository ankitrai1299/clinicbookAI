import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';
import { startReminderCron } from './cron/reminder.cron.js';
import { logWhatsAppStartupInfo } from './modules/whatsapp/whatsapp.diagnostics.js';

const app = createApp();
let server: ReturnType<typeof app.listen> | null = null;

const shutdown = async (signal: NodeJS.Signals) => {
  if (!server) {
    await disconnectDatabase();
    process.exit(0);
  }

  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });

  await disconnectDatabase();
  console.info(`Received ${signal}. Server shut down gracefully.`);
  process.exit(0);
};

const startServer = async () => {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    console.info(`ClinicBook AI backend listening on port ${env.PORT}`);
    // WhatsApp binding/observability banner (clinic, webhook URL, signature).
    void logWhatsAppStartupInfo();
  });

  startReminderCron();

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

void startServer().catch(async (error) => {
  console.error('Failed to start backend server', error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});