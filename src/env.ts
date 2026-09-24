import { z, ZodError } from "zod";
import { env as loadEnv } from "custom-env";

// STAGGING
process.env.NODE_ENV = process.env.NODE_ENV || "dev";

// STAGE FLAGGING
const isDevelopment = process.env.NODE_ENV === "dev";
const isTest = process.env.NODE_ENV === "test";

if (isDevelopment) {
  loadEnv();
} else if (isTest) {
  loadEnv("test");
}

const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "test", "prod"]).default("dev"),

  PORT: z.string().default("3000"),

  DATABASE_URL: z.string().startsWith("postgresql://"),

  REDIS_URL: z.string(),

  NPM_PACKAGE_VERSION: z
    .string()
    .default(process.env.npm_package_version ?? "Unknown"),

  FRONTEND_URL: z.string().startsWith("https://"),

  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32, "Access token should be at least 32 chareacters"),

  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32, "Refresh token should be at least 32 chareacters"),

  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),

  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  BCRYPT_ROUNDS: z.coerce.number().min(10).max(20).default(12),

  USER_BALANCE: z.string().default("1000"),
});

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof ZodError) {
    console.error("Invalid environment variables:");

    for (const issue of error.issues) {
      const path = issue.path.join(".");
      console.error(`- ${path}: ${issue.message}`);
    }

    process.exit(1);
  }

  throw error;
}

export { env };
