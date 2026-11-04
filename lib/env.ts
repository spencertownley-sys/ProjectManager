import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("TaskParty <notifications@localhost>"),
  CONNECTIONS_ENCRYPTION_KEY: z.string().optional(),
  WEBHOOK_SIGNING_SALT: z.string().default("dev-salt"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

export const serverEnv = serverSchema.parse(process.env);

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

export function requireServerEnv<K extends keyof typeof serverEnv>(key: K): NonNullable<(typeof serverEnv)[K]> {
  const value = serverEnv[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing environment variable ${key}. See .env.example.`);
  }
  return value as NonNullable<(typeof serverEnv)[K]>;
}
