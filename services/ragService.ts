import { LLAMA3_2_1B_SPINQUANT, QWEN3_0_6B_QUANTIZED, Message } from "react-native-executorch";
import { QueryResult, RAG } from "react-native-rag";
import { ExecuTorchLLM } from "@react-native-rag/executorch";
import { textVectorStore } from "@/services/vectorStores/textVectorStore";
import { logger } from "@/services/logger";

export const rag = new RAG({
    vectorStore: textVectorStore,
    llm: new ExecuTorchLLM({
        ...QWEN3_0_6B_QUANTIZED, onDownloadProgress: (progress) => {
            console.log(`${QWEN3_0_6B_QUANTIZED.modelName} model loading progress:`, progress);
        }
    })
});

export const similarityScoreToDescription = (similarityScore: number) => {
    if (similarityScore > 0.6) return "Highly relevant";
    if (similarityScore > 0.4) return "Relevant";
    if (similarityScore > 0.2) return "Slightly relevant";
    return "Not relevant";
}

export const getPromptGenerator = (isThinkingEnabled: boolean, isQwen3: boolean) => (messages: Message[], retrieved: QueryResult[]) => {
    const userQuestion = messages[messages.length - 1].content;
    
    logger.log("AI Assistant: Received query", { userQuestion });
    logger.log("AI Assistant: Vector store raw retrieval", { 
        retrievedCount: retrieved.length, 
        items: retrieved.map(r => ({ document: r.document, similarity: r.similarity })) 
    });

    const relevantRetrieved = retrieved.filter(r => r.similarity > 0.2);
    
    logger.log("AI Assistant: Filtered relevant items", { 
        relevantCount: relevantRetrieved.length, 
        items: relevantRetrieved.map(r => ({ document: r.document, similarity: r.similarity })) 
    });

    const context = relevantRetrieved.map((r) => `${similarityScoreToDescription(r.similarity)}:\n\n${r.document}`).join("\n\n");

    const prompt = `You are an AI assistant helping a user with their notes. Use the following context to answer the user's question.

Context:
${context}

User's Question:
${userQuestion}

Answer:`
    
    // Default: if thinking is OFF, we add /no_think to stop it from thinking.
    // However, if the user requested Qwen3 and thinking is OFF, we remove /no_think (as per prompt instructions, maybe unsupported).
    // If thinking is ON, we don't append /no_think.
    let suffix = "";
    if (!isThinkingEnabled) {
        suffix = isQwen3 ? "" : "/no_think";
    }

    const finalPrompt = prompt + suffix;

    logger.log("AI Assistant: Final prompt sent to LLM", { prompt: finalPrompt });

    return finalPrompt;
}