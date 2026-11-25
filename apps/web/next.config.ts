import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@trace/binary-core",
    "@trace/event-system",
    "@trace/file-signatures",
    "@trace/forensics",
    "@trace/parser-registry",
    "@trace/parsers",
    "@trace/report-schema",
    "@trace/sanitizers",
    "@trace/shared-types",
  ],
};

export default nextConfig;
