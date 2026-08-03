import { z } from "zod";

/**
 * Every external dependency has a safe default so the app boots and the full
 * demo flow works with NO real API keys. Providers are selected by name, never
 * inferred from which key happens to be present.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/kambio"),

  // 32+ char secret used to sign session cookies. Overridden in production.
  AUTH_SECRET: z.string().min(16).default("kambio-dev-secret-change-me-in-prod"),
  APP_URL: z.string().default("http://localhost:3000"),

  // --- AI gateway ---------------------------------------------------------
  // "mock" returns deterministic fixture data — no network, no keys.
  AI_PROVIDER: z.enum(["mock", "anthropic", "openai"]).default("mock"),
  AI_MODEL: z.string().default("claude-opus-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  // Per-task provider overrides, e.g. AI_PROVIDER_CLASSIFY_MESSAGE=openai
  AI_PROVIDER_EXTRACT_DOCUMENT: z.enum(["mock", "anthropic", "openai"]).optional(),
  AI_PROVIDER_CLASSIFY_MESSAGE: z.enum(["mock", "anthropic", "openai"]).optional(),
  AI_PROVIDER_DRAFT_REPLY: z.enum(["mock", "anthropic", "openai"]).optional(),

  // --- OCR ----------------------------------------------------------------
  OCR_PROVIDER: z.enum(["mock", "textract", "gcv"]).default("mock"),
  OCR_API_KEY: z.string().optional(),

  // --- Storage ------------------------------------------------------------
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // --- Queue --------------------------------------------------------------
  // "inline" runs jobs in-process (dev/demo). "redis" uses BullMQ + a worker.
  QUEUE_DRIVER: z.enum(["inline", "redis"]).default("inline"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // --- Email ingestion ----------------------------------------------------
  INBOUND_EMAIL_DOMAIN: z.string().default("parse.kambio.app"),
  // Shared secret checked on the inbound webhook. Empty = accept (dev only).
  INBOUND_WEBHOOK_SECRET: z.string().default(""),
  EMAIL_PROVIDER: z.enum(["mock", "resend", "postmark", "sendgrid"]).default("mock"),
  EMAIL_API_KEY: z.string().optional(),
  /** Resend API key. Takes precedence over EMAIL_API_KEY when set. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Kambio Ops <ops@kambio.app>"),

  // --- Follow-up automation ----------------------------------------------
  /** Hours of silence before the first automatic chase. */
  FOLLOWUP_AFTER_HOURS: z.coerce.number().min(1).default(24),
  /** Hours between subsequent chases. */
  FOLLOWUP_INTERVAL_HOURS: z.coerce.number().min(1).default(24),
  /** Never send more than this many chases for one request. */
  FOLLOWUP_MAX: z.coerce.number().min(0).default(3),
  /** Chasers are the ONLY messages that may send without a human. */
  FOLLOWUP_AUTO_SEND: z.coerce.boolean().default(true),
  /** Protects POST /api/cron/followups. Empty = open (dev only). */
  CRON_SECRET: z.string().default(""),

  // --- WhatsApp Business API ---------------------------------------------
  WHATSAPP_PROVIDER: z.enum(["mock", "meta"]).default("mock"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default("kambio-verify"),

  // --- Carrier tracking ---------------------------------------------------
  TRACKING_PROVIDER: z.enum(["mock", "shipsgo"]).default("mock"),
  TRACKING_API_KEY: z.string().optional(),

  // Fields below this confidence are routed to human review.
  EXTRACTION_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
