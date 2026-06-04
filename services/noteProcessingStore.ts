export type ProcessingStatus = {
    isProcessing: boolean;
    step?: string;
};

const processingStatuses: Record<string, ProcessingStatus> = {};
let listeners: Array<(statuses: Record<string, ProcessingStatus>) => void> = [];

export const noteProcessingStore = {
    setProcessing: (noteId: string, isProcessing: boolean, step?: string) => {
        processingStatuses[noteId] = { isProcessing, step };
        listeners.forEach(l => l({ ...processingStatuses }));
    },
    getStatuses: () => processingStatuses,
    subscribe: (listener: (statuses: Record<string, ProcessingStatus>) => void) => {
        listeners.push(listener);
        return () => {
            listeners = listeners.filter(l => l !== listener);
        };
    }
};
