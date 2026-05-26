import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
 
const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
// The avatar-viewer route must be embeddable in an <iframe> from any origin.
// Helmet's default includes `frame-ancestors 'self'` which blocks that,
// so we apply a relaxed policy specifically for that path first.
app.use('/avatar-viewer-web', helmet({
    // Disables X-Frame-Options entirely for this path (frame-ancestors in CSP takes precedence anyway)
    frameguard: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://esm.sh", "https://www.gstatic.com"],
            scriptSrcElem: ["'self'", "https://esm.sh", "https://www.gstatic.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:", "ws:", "wss:", "blob:", "https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev"],
            fontSrc: ["'self'", "data:", "https:"],
            workerSrc: ["'self'", "blob:"],
            mediaSrc: ["'self'", "blob:", "data:", "https:"],
            frameSrc: ["'none'"],
            // Intentionally disabled so any origin can embed the viewer.
            frameAncestors: null,
        },
    },
}));

// All other routes use strict Helmet defaults (frame-ancestors 'self', etc.).
// Do not run the global Helmet policy for the embeddable viewer path because it
// would overwrite the route-specific CSP above.
app.use((req, res, next) => {
    if (req.path.startsWith('/avatar-viewer-web')) {
        return next();
    }

    return helmet()(req, res, next);
});

export const allowedOrigins = [
    'https://apothecary-frontend.vercel.app',
    'https://Apothecary-app-frontend.vercel.app',
    process.env.CLIENT_URL,
    process.env.PATIENT_APP_URL,
    process.env.DOCTOR_PORTAL_URL,
    ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : []),
].filter((origin): origin is string => Boolean(origin));

app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server requests (no origin header) and listed origins.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // CRITICAL: Never pass `new Error()` here. Throwing an error crashes the 
            // request with an HTTP 500. Passing `false` simply omits the CORS headers,
            // which safely lets the browser block the request per standard CORS spec.
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request Logging
app.use(morgan('dev'));
app.use(requestLogger);

// Body Parsers - IMPORTANT: Webhook route needs raw body, so we exclude it from JSON parsing
app.use((req, res, next) => {
    if (req.originalUrl === '/api/v1/billing/webhook') {
        next(); // Skip JSON parsing for webhook
    } else {
        express.json()(req, res, next);
    }
});
app.use(express.urlencoded({ extended: true }));

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
const avatarViewerWebPath = path.join(__dirname, '../avatar-viewer-web');
app.use('/avatar-viewer-web', express.static(avatarViewerWebPath, {
    extensions: ['html'],
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));
app.get('/avatar-viewer-web/health', (_req, res) => {
    res.json({
        ok: true,
        viewerPath: avatarViewerWebPath
    });
});
app.get('/avatar-viewer-web/viewer', (_req, res) => {
    res.sendFile(path.join(avatarViewerWebPath, 'index.html'));
});

// Rate Limiting
app.use('/api', rateLimiter);

// Health Check
app.get('/health', (_req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

app.get('/', (_req, res) => {
    res.json({
        message: 'Welcome to Apothecary API',
        version: '1.0.0',
        description: 'HIPAA-Compliant Clinic Platform'
    });
});

// API Routes
app.use('/api/v1', routes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

export default app;
