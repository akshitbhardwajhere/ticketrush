import type { RequestHandler } from "express";

let requests = 0;
let errors = 0;
export const metricsMiddleware: RequestHandler = (_req, res, next) => {
  requests += 1;
  res.on("finish", () => {
    if (res.statusCode >= 500) errors += 1;
  });
  next();
};

export function metricsText() {
  return `# HELP ticketrush_http_requests_total Total HTTP requests\n# TYPE ticketrush_http_requests_total counter\nticketrush_http_requests_total ${requests}\n# HELP ticketrush_http_errors_total Total HTTP 5xx responses\n# TYPE ticketrush_http_errors_total counter\nticketrush_http_errors_total ${errors}\n`;
}
