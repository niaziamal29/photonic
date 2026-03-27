import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
        issues: result.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join('.'),
          message: issue.message,
          input: 'input' in issue ? issue.input : undefined,
          received: 'received' in issue ? issue.received : undefined,
          options: 'options' in issue ? issue.options : undefined,
          values: 'values' in issue ? issue.values : undefined,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
