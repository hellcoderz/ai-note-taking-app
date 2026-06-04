import * as FileSystem from "expo-file-system";
import type { Note } from "@/types/note";
import {
    createNote as storageCreateNote,
    deleteNote as storageDeleteNote,
    getNoteById as storageGetNoteById,
    getNotes as storageGetNotes,
    updateNote as storageUpdateNote,
} from "@/services/storage/notes";
import { textSplitter, noteToString, textVectorStore } from "@/services/vectorStores/textVectorStore";
import { imageEmbeddings, ocrModule, imageVectorStore } from "@/services/vectorStores/imageVectorStore";

async function addImageToNote(noteId: string, sourceUri: string): Promise<string> {
    const fileName = sourceUri.split("/").pop() ?? "";
    const destDir = FileSystem.documentDirectory + `notes/${noteId}/images/`;
    const dirInfo = await FileSystem.getInfoAsync(destDir);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    }
    const destUri = destDir + fileName;
    await FileSystem.moveAsync({ from: sourceUri, to: destUri });
    return destUri;
}

async function getNotes(): Promise<Note[]> {
    return storageGetNotes();
}

async function getNote(noteId: string): Promise<Note> {
    return storageGetNoteById(noteId);
}

async function createNote(title: string, content: string, imageUris: string[], onProgress?: (step: string) => void): Promise<Note> {
    onProgress?.("Saving note to storage...");
    const note = await storageCreateNote({ title, content, imageUris });
    
    onProgress?.("Generating text embeddings...");
    const chunks = await textSplitter.splitText(noteToString(note));
    for (const chunk of chunks) {
        await textVectorStore.add({ document: chunk, metadata: { noteId: note.id } });
    }
    
    for (let i = 0; i < imageUris.length; i++) {
        const uri = imageUris[i];
        if (!imageEmbeddings || !ocrModule) continue;
        
        onProgress?.(`Processing image ${i + 1} of ${imageUris.length}...`);
        const embedding = Array.from(await imageEmbeddings.forward(uri)) as number[];
        await imageVectorStore.add({ embedding, metadata: { imageUri: uri, noteId: note.id } });
        
        const ocrDetections = await ocrModule.forward(uri);
        const ocrText = ocrDetections.map(d => d.text).join(' ').trim();
        if (ocrText) {
            await imageVectorStore.add({ document: ocrText, metadata: { imageUri: uri, noteId: note.id } });
        }
    }
    onProgress?.("Note saved successfully.");
    return note;
}

async function updateNote(noteId: string, data: { title: string; content: string; imageUris: string[] }, onProgress?: (step: string) => void): Promise<void> {
    onProgress?.("Updating note in storage...");
    await storageUpdateNote(noteId, data);

    onProgress?.("Removing old embeddings...");
    await textVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
    await imageVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });

    onProgress?.("Generating text embeddings...");
    const chunks = await textSplitter.splitText(noteToString(data));
    for (const chunk of chunks) {
        await textVectorStore.add({ document: chunk, metadata: { noteId } });
    }

    for (let i = 0; i < data.imageUris.length; i++) {
        const uri = data.imageUris[i];
        if (!imageEmbeddings || !ocrModule) continue;
        
        onProgress?.(`Processing image ${i + 1} of ${data.imageUris.length}...`);
        const embedding = Array.from(await imageEmbeddings.forward(uri)) as number[];
        await imageVectorStore.add({ embedding, metadata: { imageUri: uri, noteId } });
        
        const ocrDetections = await ocrModule.forward(uri);
        const ocrText = ocrDetections.map(d => d.text).join(' ').trim();
        if (ocrText) {
            await imageVectorStore.add({ document: ocrText, metadata: { imageUri: uri, noteId } });
        }
    }
    
    onProgress?.("Note updated successfully.");
}

async function deleteNote(noteId: string): Promise<void> {
    await FileSystem.deleteAsync(FileSystem.documentDirectory + `notes/${noteId}`, { idempotent: true });
    await storageDeleteNote(noteId);
    await textVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
    await imageVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
}

async function searchByText(query: string, notes: Note[], n: number = 3): Promise<Note[]> {
    const results = await textVectorStore.query({ queryText: query.trim() });
    return buildSimilarityResults(results, notes).slice(0, n);
}

async function searchByImageUri(imageUri: string, notes: Note[], n: number = 3): Promise<Note[]> {
    if (!imageEmbeddings || !ocrModule) return [];
    
    const imageEmbedding = Array.from(await imageEmbeddings.forward(imageUri)) as number[];
    let combinedResults = await imageVectorStore.query({ queryEmbedding: imageEmbedding });
    
    const ocrDetections = await ocrModule.forward(imageUri);
    const ocrText = ocrDetections.map(d => d.text).join(' ').trim();
    if (ocrText) {
        const textResults = await imageVectorStore.query({ queryText: ocrText });
        combinedResults = [...combinedResults, ...textResults];
    }
    
    return buildSimilarityResults(combinedResults, notes).slice(0, n);
}

async function searchImagesByText(query: string, notes: Note[], n: number = 3): Promise<Note[]> {
    const results = await imageVectorStore.query({ queryText: query.trim() });
    return buildSimilarityResults(results, notes).slice(0, n);
}

function buildSimilarityResults(results: { similarity: number; metadata?: { noteId?: string } }[], notes: Note[]): Note[] {
    const noteIdToMaxSimilarity = new Map<string, number>();
    for (const r of results) {
        const noteId = r.metadata?.noteId;
        if (noteId) {
            const current = noteIdToMaxSimilarity.get(noteId) ?? -Infinity;
            noteIdToMaxSimilarity.set(noteId, Math.max(current, r.similarity));
        }
    }
    return notes
        .filter(n => noteIdToMaxSimilarity.has(n.id))
        .map(n => ({ ...n, similarity: noteIdToMaxSimilarity.get(n.id)! }))
        .sort((a, b) => b.similarity - a.similarity)
}

export const notesService = {
    addImageToNote,
    getNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    searchByText,
    searchImagesByText,
    searchByImageUri,
};
