import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { env } from "@/env";

/**
 * Resolved at runtime, not build time. `@aws-sdk/client-s3` is an OPTIONAL
 * dependency — a literal require() would make webpack fail the build for
 * everyone using the default local driver.
 */
const runtimeRequire = createRequire(process.cwd() + "/kambio-storage.js");

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Filesystem driver — the default so the app runs with zero cloud config. */
class LocalStorage implements StorageDriver {
  readonly name = "local";
  private root = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

  private resolve(key: string) {
    // Defend against traversal: the resolved path must stay under root.
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Refusing to access storage key outside root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer, _contentType: string) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    return { key };
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** S3-compatible driver (AWS, MinIO, R2). Loaded lazily. */
class S3Storage implements StorageDriver {
  readonly name = "s3";
  private client: any;
  private bucket: string;

  constructor() {
    if (!env.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
    const { S3Client } = runtimeRequire("@aws-sdk/client-s3");
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = runtimeRequire("@aws-sdk/client-s3");
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { key };
  }

  async get(key: string) {
    const { GetObjectCommand } = runtimeRequire("@aws-sdk/client-s3");
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string) {
    const { DeleteObjectCommand } = runtimeRequire("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    try {
      driver = env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
    } catch (err) {
      console.error("[storage] falling back to local driver:", err);
      driver = new LocalStorage();
    }
  }
  return driver;
}

export function documentKey(orgId: string, shipmentId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `orgs/${orgId}/shipments/${shipmentId}/${Date.now()}-${safe}`;
}
