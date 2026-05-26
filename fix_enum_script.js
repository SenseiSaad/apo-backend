const fs = require('fs');
let content = fs.readFileSync('src/models/enums.ts', 'utf8');

const searchStr = `export enum SessionStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}`;

const replaceStr = `export enum SessionStatus {
    AVAILABLE = 'available',
    REQUESTED = 'requested',
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}`;

content = content.replace(searchStr, replaceStr);

fs.writeFileSync('src/models/enums.ts', content);
