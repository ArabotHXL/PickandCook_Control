export class HttpError extends Error {
  status: number;
  expose: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = true;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
