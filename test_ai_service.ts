import dotenv from 'dotenv';
dotenv.config();

import { aiService } from './src/services/ai.service';

console.log('AI Service imported successfully!');
const discoveredPython = (aiService as any).getPythonExecutable();
console.log('Discovered Python executable:', discoveredPython);

const daemon = (aiService as any).faissProcess;
if (daemon) {
    console.log('Subprocess details: PID:', daemon.pid);
    daemon.stdout?.on('data', (data: any) => {
        console.log('[DAEMON STDOUT]:', data.toString().trim());
    });
    daemon.stderr?.on('data', (data: any) => {
        console.log('[DAEMON STDERR]:', data.toString().trim());
    });
} else {
    console.log('Daemon process is NOT running.');
}

console.log('Waiting 25 seconds to check daemon ready status and capture logs...');
setTimeout(() => {
    console.log('Is FAISS daemon ready?:', (aiService as any).faissReady);
    if (daemon) {
        console.log('Terminating daemon process...');
        daemon.kill();
    }
    process.exit(0);
}, 25000);
