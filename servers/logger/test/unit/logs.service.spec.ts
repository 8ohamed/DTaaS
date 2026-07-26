import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Logger } from '@nestjs/common';
import LogsService from 'src/logs/logs.service';
import Config from 'src/config/config.service';
import { LogEventDto } from 'src/dto/log-event.dto';

type WriteCallback = (error?: Error | null) => void;

type FakeStream = {
  on: (event: string, listener: (error: Error) => void) => void;
  off: (event: string, listener: (error: Error) => void) => void;
  write: (line: string, encoding: string, callback: WriteCallback) => void;
  end: (callback: WriteCallback) => void;
  destroy: (error?: Error) => void;
};

function installFakeStream(service: LogsService, stream: FakeStream): void {
  const internals = service as unknown as {
    initialized: boolean;
    writeStream: FakeStream | null;
  };
  internals.initialized = true;
  internals.writeStream = stream;
}

const noListener = (): void => undefined;

const baseEvent: LogEventDto = {
  sessionId: '4a4f6d5f-818d-4c86-b5dc-0d4f8a38dc02',
  userHash: 'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
  timestamp: '2026-03-24T20:00:00.000Z',
  event: 'click',
  page: '/insights/log',
  element: 'button',
  label: 'Refresh',
  context: {
    source: 'log-viewer',
  },
};

const originalEnv = { ...process.env };

describe('LogsService', () => {
  let tempDir = '';
  let logFilePath = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'dtaas-logger-'));
    logFilePath = path.join(tempDir, 'workflow.jsonl');
    process.env = { ...originalEnv };
    process.env.LOGGER_LOG_FILE_PATH = logFilePath;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it('appends log events as jsonl', async () => {
    const config = new Config();
    const service = new LogsService(config);

    await service.appendEvent(baseEvent);
    await service.onModuleDestroy();

    const content = await readFile(config.getLogFilePath(), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
  });

  it('repairs missing newline before append', async () => {
    await writeFile(logFilePath, JSON.stringify(baseEvent), 'utf8');
    const config = new Config();
    const service = new LogsService(config);
    const nextEvent = { ...baseEvent, label: 'Next action' };

    await service.appendEvent(nextEvent);
    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
    expect(JSON.parse(lines[1]) as LogEventDto).toEqual(nextEvent);
  });

  it('rotates the log when the configured size is exceeded', async () => {
    process.env.LOGGER_LOG_MAX_BYTES = '1';
    process.env.LOGGER_LOG_RETENTION_FILES = '2';
    const config = new Config();
    const service = new LogsService(config);
    const nextEvent = { ...baseEvent, label: 'Next action' };

    await service.appendEvent(baseEvent);
    await service.appendEvent(nextEvent);
    await service.onModuleDestroy();

    const rotated = await readFile(`${logFilePath}.1`, 'utf8');
    const current = await readFile(logFilePath, 'utf8');
    expect(JSON.parse(rotated) as LogEventDto).toEqual(baseEvent);
    expect(JSON.parse(current) as LogEventDto).toEqual(nextEvent);
  });

  it('appends multiple events in order', async () => {
    const config = new Config();
    const service = new LogsService(config);
    const nextEvent = { ...baseEvent, label: 'Second action' };

    await service.appendEvent(baseEvent);
    await service.appendEvent(nextEvent);
    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
    expect(JSON.parse(lines[1]) as LogEventDto).toEqual(nextEvent);
  });

  it('shares one initialization between concurrent appends', async () => {
    const config = new Config();
    const service = new LogsService(config);
    const nextEvent = { ...baseEvent, label: 'Second action' };

    const firstWrite = service.appendEvent(baseEvent);
    const secondWrite = service.appendEvent(nextEvent);
    await Promise.all([firstWrite, secondWrite]);
    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
    expect(JSON.parse(lines[1]) as LogEventDto).toEqual(nextEvent);
  });

  it('skips newline repair for an empty log file', async () => {
    await writeFile(logFilePath, '', 'utf8');
    const config = new Config();
    const service = new LogsService(config);

    await service.appendEvent(baseEvent);
    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
  });

  it('keeps the file intact when it already ends with a newline', async () => {
    await writeFile(logFilePath, `${JSON.stringify(baseEvent)}\n`, 'utf8');
    const config = new Config();
    const service = new LogsService(config);
    const nextEvent = { ...baseEvent, label: 'Next action' };

    await service.appendEvent(nextEvent);
    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]) as LogEventDto).toEqual(baseEvent);
    expect(JSON.parse(lines[1]) as LogEventDto).toEqual(nextEvent);
  });

  it('closes without a stream when no event was appended', async () => {
    const config = new Config();
    const service = new LogsService(config);

    await service.onModuleDestroy();

    expect(existsSync(logFilePath)).toBe(false);
  });

  it('rejects append when the stream reports a write error', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new LogsService(new Config());
    installFakeStream(service, {
      on: noListener,
      off: noListener,
      write: (_line, _encoding, callback) => callback(new Error('disk full')),
      end: (callback) => callback(null),
      destroy: jest.fn(),
    });

    await expect(service.appendEvent(baseEvent)).rejects.toThrow('disk full');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('rejects append when the stream emits an error event', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new LogsService(new Config());
    let errorListener: ((error: Error) => void) | undefined;
    installFakeStream(service, {
      on: (_event, listener) => {
        errorListener = listener;
      },
      off: () => {
        errorListener = undefined;
      },
      write: () => {
        errorListener?.(new Error('stream failure'));
      },
      end: (callback) => callback(null),
      destroy: jest.fn(),
    });

    await expect(service.appendEvent(baseEvent)).rejects.toThrow(
      'stream failure',
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('propagates close errors from the write stream', async () => {
    const service = new LogsService(new Config());
    installFakeStream(service, {
      on: noListener,
      off: noListener,
      write: (_line, _encoding, callback) => callback(undefined),
      end: (callback) => callback(new Error('close failed')),
      destroy: jest.fn(),
    });

    await service.appendEvent(baseEvent);

    await expect(service.onModuleDestroy()).rejects.toThrow('close failed');
  });

  it('resolves close when the stream reports a null error', async () => {
    const service = new LogsService(new Config());
    installFakeStream(service, {
      on: noListener,
      off: noListener,
      write: (_line, _encoding, callback) => callback(undefined),
      end: (callback) => callback(null),
      destroy: jest.fn(),
    });

    await service.appendEvent(baseEvent);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('reopens the stream after a prior append failed', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new LogsService(new Config());
    const nextEvent = { ...baseEvent, label: 'Next action' };
    const writtenLines: string[] = [];
    let failNextWrite = true;
    installFakeStream(service, {
      on: noListener,
      off: noListener,
      write: (line, _encoding, callback) => {
        if (failNextWrite) {
          failNextWrite = false;
          callback(new Error('disk full'));
          return;
        }
        writtenLines.push(line);
        callback(undefined);
      },
      end: (callback) => callback(null),
      destroy: jest.fn(),
    });

    await expect(service.appendEvent(baseEvent)).rejects.toThrow('disk full');
    await service.appendEvent(nextEvent);

    await service.onModuleDestroy();

    const content = await readFile(logFilePath, 'utf8');
    expect(JSON.parse(content.trim()) as LogEventDto).toEqual(nextEvent);
    expect(writtenLines).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('handles late stream errors without an active write listener', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new LogsService(new Config());
    await service.appendEvent(baseEvent);
    const internals = service as unknown as {
      writeStream: { emit: (event: 'error', error: Error) => boolean } | null;
      initialized: boolean;
    };

    internals.writeStream?.emit('error', new Error('late stream failure'));

    expect(errorSpy).toHaveBeenCalled();
    expect(internals.initialized).toBe(false);
  });

  it('rejects append when the stream is missing after initialization', async () => {
    const service = new LogsService(new Config());
    const internals = service as unknown as { initialized: boolean };
    internals.initialized = true;

    await expect(service.appendEvent(baseEvent)).rejects.toThrow(
      'Logger write stream is not initialized',
    );
  });
});
