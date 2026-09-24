import { app } from "./app.js";
import { redisClient } from "./config/redis.js";
import { prisma } from "./config/prisma.js";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let isShuttingDown = false;

const gracefulShutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Received kill signal, shutting down gracefully...");

  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log("Closed out remaining connections");
      resolve();
    });
  });

  try {
    await prisma.$disconnect();
    console.log("Prisma disconnected");

    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("Redis disconnected!");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

process.on("uncaughtException", (error) => {
  console.error("UncaughtException:", error);
  gracefulShutdown();
});
process.on("unhandledRejection", (error) => {
  console.error("UnhandledRejection", error);
  gracefulShutdown();
});
