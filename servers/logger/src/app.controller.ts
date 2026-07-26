import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import LogsService from './logs/logs.service.js';
import { LogEventDto } from './dto/log-event.dto.js';
import LogEventValidationPipe from './log-event-validation.pipe.js';
import LoggerAuthGuard from './logger-auth.guard.js';

type HealthResponse = {
  status: 'ok';
};

@Controller('logger')
export default class AppController {
  // eslint-disable-next-line no-useless-constructor
  constructor(private readonly logsService: LogsService) {} // eslint-disable-line no-empty-function

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(LoggerAuthGuard)
  @UsePipes(LogEventValidationPipe)
  async ingestEvent(@Body() logEventDto: LogEventDto): Promise<void> {
    await this.logsService.appendEvent(logEventDto);
  }
}
