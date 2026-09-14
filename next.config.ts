import type { NextConfig } from "next";

type SecurityHeader = {
  key: string;
  value: string;
};

const securityHeaders: SecurityHeader[] = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const legalFileSecurityHeaders = securityHeaders.map((header) => {
  if (header.key === "Content-Security-Policy") {
    return {
      ...header,
      value:
        "base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
    };
  }

  if (header.key === "X-Frame-Options") {
    return {
      ...header,
      value: "SAMEORIGIN",
    };
  }

  return header;
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/legal/:documentType/file",
        headers: legalFileSecurityHeaders,
      },
      {
        source: "/((?!legal/[^/]+/file$).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
