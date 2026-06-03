import { useEffect, useState } from "react";
import { textVectorStore } from "@/services/vectorStores/textVectorStore";
import Notes from "./notes";
import { loadImageEmbeddings, imageVectorStore } from "@/services/vectorStores/imageVectorStore";
import { LoaderScreen } from "@/components/LoaderScreen";

export default function Index() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");

  useEffect(() => {
    (async () => {
      try {
        setLoadingMessage("Loading Text Vector Store...");
        await textVectorStore.load();
        
        setLoadingMessage("Loading Image Vector Store...");
        await imageVectorStore.load();
        
        setLoadingMessage("Loading CLIP Model...");
        await loadImageEmbeddings((progress: number) => {
          setLoadingProgress(progress);
        });
        
        setIsLoaded(true);
      } catch (e) {
        console.error('Vector stores failed to load', e);
        setLoadingMessage("Failed to load models");
      }
    })();
  }, [])

  return isLoaded ? <Notes /> : <LoaderScreen message={loadingMessage} progress={loadingProgress} />;
}
