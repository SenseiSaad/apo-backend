import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Environment detection
const isVercel = !!process.env.VERCEL || !!process.env.NOW_REGION;
const isServerless = isVercel || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.LAMBDA_TASK_ROOT;
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

// Safely determine if we should even try to log to files
const shouldAttemptFileLogging = !isProduction && !isServerless;
const logsDir = path.join(process.cwd(), 'logs');

let useFileLogging = false;

if (shouldAttemptFileLogging) {
    try {
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        useFileLogging = true;
    } catch (error) {
        // Fallback to console only, do not crash
        console.warn('Logging to file disabled (could not create directory):', error);
    }
}

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    let log = `${ts} [${level}]: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length > 0) {
        log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
});

const transports: winston.transport[] = [
    new winston.transports.Console({
        format: combine(
            colorize({ all: true }),
            timestamp({ format: 'HH:mm:ss' }),
            errors({ stack: true }),
            consoleFormat
        ),
    }),
];

// Add file transports only if enabled
if (useFileLogging) {
    try {
        transports.push(
            new winston.transports.File({
                filename: path.join(logsDir, 'error.log'),
                level: 'error',
                maxsize: 10 * 1024 * 1024,
                maxFiles: 5,
            }),
            new winston.transports.File({
                filename: path.join(logsDir, 'combined.log'),
                maxsize: 10 * 1024 * 1024,
                maxFiles: 10,
            }),
            new winston.transports.File({
                filename: path.join(logsDir, 'audit.log'),
                level: 'info',
                maxsize: 50 * 1024 * 1024,
                maxFiles: 30,
            })
        );
    } catch (error) {
        console.warn('Failed to initialize file transports:', error);
    }
}

export const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
    ),
    defaultMeta: { service: 'Apothecary (Wellness App)' },
    transports,
});

export default logger;
