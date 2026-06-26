import type { NextConfig } from "next";
import os from "os";

// Dynamically fetch all local IPv4 addresses to support HMR from local network devices
const getLocalIPs = (): string[] => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
        ips.push(`${net.address}:3000`);
      }
    }
  }
  return ips;
};

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.20.11",
    "192.168.20.11:3000",
    "192.168.20.42",
    "192.168.20.42:3000",
    ...getLocalIPs()
  ],
  async redirects() {
    return [
      {
        source: "/projects/:slug/checklist",
        destination: "/projects/:slug/guide",
        permanent: true, // Uses 308 permanent redirect
      },
      {
        source: "/projects/:slug/board",
        destination: "/projects/:slug/guide",
        permanent: true, // Uses 308 permanent redirect
      },
    ];
  },
};

export default nextConfig;
