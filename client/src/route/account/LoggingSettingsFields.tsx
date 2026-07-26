import {
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  Typography,
} from '@mui/material';
import { SettingsFieldProps } from 'route/account/SettingsForm';
import { isRemoteLoggerConfigured } from 'store/settings.slice';

function getLoggerDestination(): string {
  const loggerUrl = globalThis.env?.LOGGER_URL?.trim() ?? '';
  try {
    return new URL(loggerUrl).host;
  } catch {
    return 'your organization\u0027s server';
  }
}

const LoggingSettingsFields: React.FC<SettingsFieldProps> = ({
  formValues,
  handleInputChange,
}) => {
  const localLoggingEnabled = Boolean(formValues.loggingEnabled);
  const remoteLoggerConfigured = isRemoteLoggerConfigured();
  const loggerDestination = getLoggerDestination();

  return (
    <>
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        Logging Settings
      </Typography>
      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FormControlLabel
            control={
              <Checkbox
                id="loggingEnabled"
                checked={localLoggingEnabled}
                onChange={handleInputChange}
                data-logger-element="checkbox"
                data-logger-label="Toggle Local Logging"
                data-logger-capture-value="true"
                data-logger-context={JSON.stringify({
                  settings: { section: 'logging', field: 'loggingEnabled' },
                })}
              />
            }
            label="Keep a local activity log"
          />
          <Typography variant="body2" color="text.secondary">
            Stores workflow events in this browser so you can review them in
            Workflow Logs.
          </Typography>

          {remoteLoggerConfigured && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    id="remoteLoggingEnabled"
                    checked={Boolean(formValues.remoteLoggingEnabled)}
                    onChange={handleInputChange}
                    data-logger-element="checkbox"
                    data-logger-label="Toggle Remote Logging"
                    data-logger-capture-value="true"
                    data-logger-context={JSON.stringify({
                      settings: {
                        section: 'logging',
                        field: 'remoteLoggingEnabled',
                      },
                    })}
                  />
                }
                label={`Send logs to ${loggerDestination}`}
                sx={{ mt: 2 }}
              />
              <Typography variant="body2" color="text.secondary">
                Shares your workflow events with the configured logging server.
              </Typography>
            </>
          )}
        </Grid>
      </Grid>
    </>
  );
};

export default LoggingSettingsFields;
