import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const loggerOptions = {
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  timestamp: () => `,"time":"${new Date().toISOString()}"`, // Compact ISO timestamp
  browser: { asObject: true }, // Para structured logs en browser/cloud
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }), // Compact level (INFO)
    bindings: () => ({}) // Elimina pid/hostname
  },
  base: {}, // Minimal base
  redact: ['payload.*.token', 'payload.*.password', '*.token', '*.password'] // Redact sensitive
};

// Transport configuration for both dev and prod
loggerOptions.transport = {
  target: 'pino-pretty',
  options: {
    colorize: !isProduction, // Color solo en desarrollo
    ignore: 'pid,hostname,time', // Compact: elimina campos innecesarios
    messageFormat: '{msg}{if bookingId} bookingId={bookingId}{end}{if action} action={action}{end}{if jobId} jobId={jobId}{end}', // Compact: solo keys relevantes
    translateTime: 'HH:MM:ss.l', // Formato tiempo compacto
    singleLine: true // Una línea por log
  }
};

export const logger = pino(loggerOptions);