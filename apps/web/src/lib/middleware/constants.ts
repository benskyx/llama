const shortDomain =
  process.env.NEXT_PUBLIC_APP_SHORT_DOMAIN ?? "agentset.ai";

const localPort = process.env.PORT ?? "3000";
const localHost = `localhost:${localPort}`;

export const SHORT_DOMAIN = shortDomain;

export const APP_HOSTNAMES = new Set<string>([
  `app.${shortDomain}`,
  `staging.${shortDomain}`,
  localHost,
]);

export const API_HOSTNAMES = new Set<string>([
  `api.${shortDomain}`,
  `api-staging.${shortDomain}`,
  `api.${localHost}`,
]);

export const HOSTING_PREFIX = "/a/";
