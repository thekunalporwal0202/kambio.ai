import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server-only heavyweight deps out of the client bundle.
  //
  // @aws-sdk/client-s3 is deliberately NOT a dependency: the S3 driver is
  // optional. Listing it here stops webpack resolving the require() at build
  // time, so a missing package only surfaces if you actually set
  // STORAGE_DRIVER=s3 without installing it.
  serverExternalPackages: [
    "@prisma/client",
    "bullmq",
    "ioredis",
    "bcryptjs",
    "@aws-sdk/client-s3",
  ],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
