import { ExecuTorchEmbeddings } from '@react-native-rag/executorch';
import { OPSQLiteVectorStore } from '@react-native-rag/op-sqlite';
import { CLIP_VIT_BASE_PATCH32_TEXT, CLIP_VIT_BASE_PATCH32_IMAGE, ImageEmbeddingsModule } from "react-native-executorch";

export let imageEmbeddings: ImageEmbeddingsModule | null = null;

export const loadImageEmbeddings = async (onProgress: (progress: number) => void) => {
    if (!imageEmbeddings) {
        imageEmbeddings = await ImageEmbeddingsModule.fromModelName(
            CLIP_VIT_BASE_PATCH32_IMAGE,
            onProgress
        );
    }
}

export const imageVectorStore = new OPSQLiteVectorStore({
    name: "notes_image_vector_store",
    embeddings: new ExecuTorchEmbeddings({
        ...CLIP_VIT_BASE_PATCH32_TEXT, onDownloadProgress: (progress) => {
            console.log("CLIP Text model loading progress:", progress);
        }
    }),
});