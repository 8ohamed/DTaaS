import { describe, it, expect } from '@jest/globals';
import { ZodError } from 'zod';
import ZodValidationPipe from 'src/validation.pipe';
import { LogEventDto, logEventSchema } from 'src/dto/log-event.dto';

function validPayload(
  context: Record<string, unknown>,
): Record<string, unknown> {
  return {
    sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
    userHash:
      'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
    timestamp: '2026-03-24T20:00:00.000Z',
    event: 'click',
    page: '/library',
    element: 'tab',
    label: 'Functions',
    context,
  };
}

function nestedContext(depth: number): Record<string, unknown> {
  let context: unknown = 'hidden';
  for (let index = 0; index < depth; index += 1) {
    context = { child: context };
  }
  return context as Record<string, unknown>;
}

describe('Log event validation pipe', () => {
  it('validates a correct log payload', () => {
    const payload: LogEventDto = {
      sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
      userHash:
        'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
      timestamp: '2026-03-24T20:00:00.000Z',
      event: 'click',
      page: '/library',
      element: 'button',
      label: 'Start',
      context: {
        dt: {
          name: 'WaterTank',
          button: 'start',
        },
      },
    };

    const validator = new ZodValidationPipe(logEventSchema);
    expect((validator.transform(payload) as LogEventDto).page).toBe('/library');
  });

  it('validates a nested context payload', () => {
    const payload: LogEventDto = {
      sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
      userHash:
        'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
      timestamp: '2026-03-24T20:00:00.000Z',
      event: 'click',
      page: '/preview/digitaltwins',
      element: 'button',
      label: 'Start',
      context: {
        dt: {
          name: 'hello',
          button: 'start',
          history: ['2026-03-24T19:00:00.000Z'],
        },
      },
    };

    const validator = new ZodValidationPipe(logEventSchema);
    expect((validator.transform(payload) as LogEventDto).context).toEqual(
      payload.context,
    );
  });

  it('preserves navigation page transition metadata', () => {
    const payload = {
      ...validPayload({ trigger: 'sidebar' }),
      event: 'navigation',
      page_transition: {
        src: '/library',
        target: '/preview/digitaltwins',
      },
    };

    expect(logEventSchema.parse(payload).page_transition).toEqual(
      payload.page_transition,
    );
  });

  it('defaults omitted context to an empty object', () => {
    const payload = {
      sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
      userHash:
        'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
      timestamp: '2026-03-24T20:00:00.000Z',
      event: 'click',
      page: '/library',
      element: 'tab',
      label: 'Functions',
    };

    expect(logEventSchema.parse(payload).context).toEqual({});
  });

  it('rejects a context string value over the length limit', () => {
    const payload = validPayload({ bad: 'a'.repeat(1025) });

    expect(() => logEventSchema.parse(payload)).toThrow(ZodError);
  });

  it('rejects context deeper than the client context depth cap', () => {
    const payload = validPayload(nestedContext(7));

    expect(() => logEventSchema.parse(payload)).toThrow(ZodError);
  });

  it('rejects context over the total nested entry budget', () => {
    const payload = validPayload({
      values: Array.from({ length: 100 }, (_, index) => index),
    });

    expect(() => logEventSchema.parse(payload)).toThrow(ZodError);
  });

  it('rejects extremely deep context without a stack overflow', () => {
    const payload = validPayload(nestedContext(2000));

    expect(() => logEventSchema.parse(payload)).toThrow(ZodError);
  });

  it('schema rejects invalid payload', () => {
    const invalidPayload = {
      sessionId: 'not-a-uuid',
      userHash: 'x',
      timestamp: 'not-time',
      event: 'click',
      page: '/library',
      element: 'tab',
      label: 'Functions',
      context: {},
    };

    expect(() => logEventSchema.parse(invalidPayload)).toThrow(ZodError);
  });

  it('rejects unknown event types', () => {
    const payload = {
      sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
      userHash:
        'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
      timestamp: '2026-03-24T20:00:00.000Z',
      event: 'submit',
      page: '/library',
      element: 'button',
      label: 'Start',
      context: {},
    };

    expect(() => logEventSchema.parse(payload)).toThrow(ZodError);
  });
});
