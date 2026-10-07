import { rateLimit } from "../ratelimit.js";

export const holdRateLimit = rateLimit({
  name: "hold",
  capacity: 5,
  refillPerSec: 1,
  keyFn: (req) => String(req.body?.userId ?? req.ip),
});
