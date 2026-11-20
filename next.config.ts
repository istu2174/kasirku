import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma & bcryptjs tidak di-bundle oleh webpack server
  serverExternalPackages: ["@prisma/client", "bcryptjs", "bullmq", "ioredis"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
