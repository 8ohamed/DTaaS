import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

type ExecFileCallback = (
  error: Error | null,
  result: { stdout: string; stderr: string },
) => void;

const execFileMock = jest.fn(
  (
    _command: string,
    args: ReadonlyArray<string>,
    callback: ExecFileCallback,
  ): void => {
    writeFileSync(args[args.indexOf('-keyout') + 1], 'generated-key', 'utf8');
    writeFileSync(args[args.indexOf('-out') + 1], 'generated-cert', 'utf8');
    callback(null, { stdout: '', stderr: '' });
  },
);

jest.unstable_mockModule('node:child_process', () => ({
  execFile: execFileMock,
}));

const { ensureCertificates } = await import('src/config/certificates');

describe('certificate generation', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'dtaas-logger-cert-'));
    execFileMock.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns existing cert and key without openssl call', async () => {
    const certFile = path.join(tempDir, 'fullchain.pem');
    const keyFile = path.join(tempDir, 'privkey.pem');
    await writeFile(certFile, 'cert', 'utf8');
    await writeFile(keyFile, 'key', 'utf8');

    const result = await ensureCertificates(tempDir);

    expect(result).toEqual({ certFile, keyFile });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('generates cert and key with openssl when they are missing', async () => {
    const certsDirectory = path.join(tempDir, 'generated');

    const result = await ensureCertificates(certsDirectory);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock.mock.calls[0][0]).toBe('openssl');
    expect(result).toEqual({
      certFile: path.join(certsDirectory, 'fullchain.pem'),
      keyFile: path.join(certsDirectory, 'privkey.pem'),
    });
    expect(existsSync(result.certFile)).toBe(true);
    expect(existsSync(result.keyFile)).toBe(true);
  });
});
