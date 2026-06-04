export type LogEntry = {
    id: string;
    timestamp: Date;
    message: string;
    data?: any;
};

let logs: LogEntry[] = [];
let listeners: Array<(logs: LogEntry[]) => void> = [];

function generateId() {
    return Math.random().toString(36).substring(2, 11);
}

export const logger = {
    log: (message: string, data?: any) => {
        const entry: LogEntry = {
            id: generateId(),
            timestamp: new Date(),
            message,
            data
        };
        logs = [entry, ...logs];
        listeners.forEach(listener => listener(logs));
        console.log(`[APP LOG] ${message}`, data ? JSON.stringify(data) : '');
    },
    getLogs: () => logs,
    clearLogs: () => {
        logs = [];
        listeners.forEach(listener => listener(logs));
    },
    subscribe: (listener: (logs: LogEntry[]) => void) => {
        listeners.push(listener);
        return () => {
            listeners = listeners.filter(l => l !== listener);
        };
    }
};
