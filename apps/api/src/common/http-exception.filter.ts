import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * Normalises all errors to the standard envelope `{ error: { code, message,
 * details? } }` (plan.md §9).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; message: string; details?: unknown } = {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        typeof (response as { error: unknown }).error === 'object' &&
        (response as { error: unknown }).error !== null
      ) {
        // already our envelope (e.g. from ZodValidationPipe / domain throws)
        body = (response as { error: typeof body }).error;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as { message?: unknown; error?: unknown };
        body = {
          code: String(r.error ?? exception.name).toUpperCase().replace(/\s+/g, '_'),
          message: Array.isArray(r.message)
            ? r.message.join('; ')
            : String(r.message ?? exception.message),
        };
      } else {
        body = { code: exception.name, message: String(response) };
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      body = { code: 'INTERNAL_ERROR', message: exception.message };
    }

    res.status(status).json({
      error: { ...body },
      path: req?.url,
      timestamp: new Date().toISOString(),
    });
  }
}
