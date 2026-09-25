export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "invalid_request",
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const securityUnavailable = () => new RequestError(
  "El servicio no está disponible temporalmente. Intentá nuevamente más tarde.",
  503, "security_unavailable", 10,
);
