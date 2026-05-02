import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index";
import storageRouter from "./routes/storage";
import { logger } from "./lib/logger";
import { registerOpsRoutes } from "./routes/ops/index";
import { isHttpError } from "./lib/httpError";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", storageRouter);

// Register ops dashboard routes (all prefixed /api/ops/...)
registerOpsRoutes(app);

// Global error handler — keeps client-error responses small and JSON-shaped.
// Express checks function arity for error middleware, so the unused `_next`
// parameter is required.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (isHttpError(err)) {
    req.log.warn({ err, status: err.status }, "client error");
    res.status(err.status).json({ error: err.message });
    return;
  }
  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
