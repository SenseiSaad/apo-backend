import '../src/config/newrelic';
import app from '../src/app';
import { connectDatabase } from '../src/config/database';

// Connect to database for serverless (with connection pooling)
let isConnected = false;

async function ensureDbConnection() {
    if (!isConnected) {
        await connectDatabase();
        isConnected = true;
        console.log('✅ Database connected');
    }
}

// Vercel serverless function handler
module.exports = async (req: any, res: any) => {
    try {
        // Connect to database
        await ensureDbConnection();
        
        // Pass to Express app
        return app(req, res);
    } catch (error) {
        console.error('❌ Handler error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
