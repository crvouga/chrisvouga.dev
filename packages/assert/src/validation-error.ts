export class ValidationError extends Error {
  public readonly context: Record<string, unknown> = {};

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    this.context = context ?? {};
  }
}
