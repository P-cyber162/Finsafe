import ws from "ws";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";
import { env } from "../env.js";

neonConfig.webSocketConstructor = ws;

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = `${env.DATABASE_URL}`;

const schemaParam = new URL(connectionString).searchParams.get("schema");

const adapter = new PrismaNeon(
  { connectionString },
  schemaParam ? { schema: schemaParam } : undefined,
);
const prisma = global.prisma || new PrismaClient({ adapter });

if (env.NODE_ENV === "dev") {
  global.prisma = prisma;
}

export { prisma };
