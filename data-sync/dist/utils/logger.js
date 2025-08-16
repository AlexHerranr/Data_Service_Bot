import pino from 'pino';
const isProduction = process.env.NODE_ENV === 'production';
const loggerOptions = {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    browser: { asObject: true },
    formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
        bindings: () => ({})
    },
    base: {},
    redact: ['payload.*.token', 'payload.*.password', '*.token', '*.password'],
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: !isProduction,
            ignore: 'pid,hostname,time',
            messageFormat: '{msg}{if bookingId} bookingId={bookingId}{end}{if action} action={action}{end}{if jobId} jobId={jobId}{end}',
            translateTime: 'HH:MM:ss.l',
            singleLine: true
        }
    }
};
export const logger = pino(loggerOptions);
