const fs = require('fs');
let content = fs.readFileSync('src/models/enums.ts', 'utf8');
content = content.replace(
    `export enum SessionStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}`,
    `export enum SessionStatus {
    AVAILABLE = 'available',
    REQUESTED = 'requested',
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed'
}`
);
fs.writeFileSync('src/models/enums.ts', content);
