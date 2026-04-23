import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-ignore
  allowedDevOrigins: ['192.168.1.200', '127.0.0.1', 'localhost', 'http://192.168.1.200:3005'],
};

export default nextConfig;
