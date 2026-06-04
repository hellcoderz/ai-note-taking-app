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
import { logger } from "@/services/logger";
import { noteProcessingStore } from "@/services/noteProcessingStore";

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

async function createNote(title: string, content: string, imageUris: string[], id?: string): Promise<Note> {
    logger.log("Creating new note", { title, imageCount: imageUris.length });
    const note = await storageCreateNote({ id, title, content, imageUris });
    
    // Fire and forget background processing
    processNoteBackground(note.id, { title, content, imageUris });
    
    return note;
}

async function updateNote(noteId: string, data: { title: string; content: string; imageUris: string[] }): Promise<void> {
    logger.log(`Updating note ${noteId}`, { title: data.title, imageCount: data.imageUris.length });
    await storageUpdateNote(noteId, data);

    // Fire and forget background processing
    processNoteBackground(noteId, data);
}

async function processNoteBackground(noteId: string, data: { title: string; content: string; imageUris: string[] }) {
    noteProcessingStore.setProcessing(noteId, true, "Removing old embeddings...");
    try {
        await textVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
        await imageVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });

        noteProcessingStore.setProcessing(noteId, true, "Generating text embeddings...");
        const chunks = await textSplitter.splitText(noteToString(data));
        logger.log(`Split text into ${chunks.length} chunks`);
        for (const chunk of chunks) {
            await textVectorStore.add({ document: chunk, metadata: { noteId } });
        }

        for (let i = 0; i < data.imageUris.length; i++) {
            const uri = data.imageUris[i];
            if (!imageEmbeddings || !ocrModule) continue;
            
            noteProcessingStore.setProcessing(noteId, true, `Processing image ${i + 1} of ${data.imageUris.length}...`);
            const embedding = Array.from(await imageEmbeddings.forward(uri)) as number[];
            await imageVectorStore.add({ embedding, metadata: { imageUri: uri, noteId } });
            
            logger.log(`Performing OCR on image ${i + 1}`);
            const ocrDetections = await ocrModule.forward(uri);
            const ocrText = ocrDetections.map(d => d.text).join(' ').trim();
            logger.log(`OCR Extracted Text`, { ocrText, detections: ocrDetections.length });
            
            if (ocrText) {
                await imageVectorStore.add({ document: ocrText, metadata: { imageUri: uri, noteId } });
                await textVectorStore.add({ document: `[Image OCR]: ${ocrText}`, metadata: { imageUri: uri, noteId } });
            }
        }
    } catch (e) {
        logger.log(`Background processing failed for note ${noteId}`, e);
    } finally {
        noteProcessingStore.setProcessing(noteId, false);
    }
}

async function deleteNote(noteId: string): Promise<void> {
    await FileSystem.deleteAsync(FileSystem.documentDirectory + `notes/${noteId}`, { idempotent: true });
    await storageDeleteNote(noteId);
    await textVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
    await imageVectorStore.delete({ predicate: r => r.metadata?.noteId === noteId });
}

async function searchByText(query: string, notes: Note[], n: number = 3): Promise<Note[]> {
    logger.log(`Searching notes by text`, { query });
    const results = await textVectorStore.query({ queryText: query.trim() });
    logger.log(`Search completed`, { resultCount: results.length });
    return buildSimilarityResults(results, notes).slice(0, n);
}

async function searchByImageUri(imageUri: string, notes: Note[], n: number = 3): Promise<Note[]> {
    logger.log(`Searching notes by image URI`);
    if (!imageEmbeddings || !ocrModule) {
        logger.log(`Models not ready for image search`);
        return [];
    }
    
    logger.log(`Extracting image embedding`);
    const imageEmbedding = Array.from(await imageEmbeddings.forward(imageUri)) as number[];
    let combinedResults = await imageVectorStore.query({ queryEmbedding: imageEmbedding });
    logger.log(`Image embedding search yielded ${combinedResults.length} results`);
    
    logger.log(`Extracting OCR from query image`);
    const ocrDetections = await ocrModule.forward(imageUri);
    const ocrText = ocrDetections.map(d => d.text).join(' ').trim();
    logger.log(`Query OCR Text`, { ocrText });
    
    if (ocrText) {
        const textResults = await imageVectorStore.query({ queryText: ocrText });
        logger.log(`OCR text search yielded ${textResults.length} results`);
        combinedResults = [...combinedResults, ...textResults];
    }
    
    return buildSimilarityResults(combinedResults, notes).slice(0, n);
}

async function searchImagesByText(query: string, notes: Note[], n: number = 3): Promise<Note[]> {
    logger.log(`Searching images by text`, { query });
    const results = await imageVectorStore.query({ queryText: query.trim() });
    logger.log(`Search completed`, { resultCount: results.length });
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
