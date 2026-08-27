interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

type D1Database = unknown;

declare module "cloudflare:workers" {
  export const env: {
    ASSETS?: Fetcher;
    DB?: D1Database;
    IMAGES?: unknown;
    [key: string]: unknown;
  };
}
