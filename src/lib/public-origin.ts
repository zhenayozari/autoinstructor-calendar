type HeaderReader = {
  get(name: string): string | null;
};

function cleanOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalOrigin(value: string) {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
}

function normalizeVercelHost(value: string) {
  const host = value.trim();

  return host.startsWith("http://") || host.startsWith("https://")
    ? cleanOrigin(host)
    : `https://${host}`;
}

export function getPublicOrigin(headers: HeaderReader) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
    return cleanOrigin(configuredOrigin);
  }

  const forwardedHost = headers.get("x-forwarded-host") ?? headers.get("host");
  if (forwardedHost) {
    const protocol =
      headers.get("x-forwarded-proto") ??
      (forwardedHost.includes("localhost") ? "http" : "https");

    return `${protocol}://${forwardedHost}`;
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionUrl) {
    return normalizeVercelHost(vercelProductionUrl);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return normalizeVercelHost(vercelUrl);
  }

  return configuredOrigin ? cleanOrigin(configuredOrigin) : "http://localhost:3001";
}
