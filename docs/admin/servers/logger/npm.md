# Logger Microservice NPM Package

The logger microservice package is `@into-cps-association/logger-ms`.

Install dependencies, build, and start from `servers/logger/`:

```bash
yarn install
yarn build
yarn start
```

By default, local starts bind to `127.0.0.1:4003` and accept unauthenticated
ingest. Set `LOGGER_AUTH_TOKEN` for non-browser producers that can send bearer
headers. The bundled browser client uses `navigator.sendBeacon`, which cannot
set custom headers, so browser ingest authentication should be enforced at the
reverse proxy.

For the full configuration reference, see
[`servers/logger/README.md`](https://github.com/INTO-CPS-Association/DTaaS/blob/main/servers/logger/README.md).
