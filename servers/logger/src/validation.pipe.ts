import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';
import { LogEventDto } from './dto/log-event.dto.js';

export default class ZodValidationPipe implements PipeTransform {
  // eslint-disable-next-line no-empty-function, no-useless-constructor
  constructor(private readonly schema: ZodType<LogEventDto>) {}

  transform(value: unknown): LogEventDto {
    try {
      const parsedValue: LogEventDto = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      throw new BadRequestException('Validation Failed', {
        cause: error,
        // Keep client-visible validation failures generic; the Zod cause is
        // retained for server-side diagnostics without echoing submitted data.
        description: 'Bad Request',
      });
    }
  }
}
