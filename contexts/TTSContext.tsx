import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import {
  useTextToSpeech,
  KOKORO_AMERICAN_ENGLISH_FEMALE_SARAH,
} from 'react-native-executorch';
import { AudioContext, AudioBufferQueueSourceNode, AudioManager } from 'react-native-audio-api';

interface TTSContextType {
  isReady: boolean;
  downloadProgress: number;
  play: (text: string) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  playingText: string | null;
}

const TTSContext = createContext<TTSContextType | null>(null);

export const TTSProvider = ({ children }: { children: React.ReactNode }) => {
  const { isReady, downloadProgress, stream, streamInsert, streamStop, error } = useTextToSpeech(
    KOKORO_AMERICAN_ENGLISH_FEMALE_SARAH
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingText, setPlayingText] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const queueSourceNodeRef = useRef<AudioBufferQueueSourceNode | null>(null);

  useEffect(() => {
    // Disable session management to prevent Android from attempting to start a foreground service
    AudioManager.disableSessionManagement();
    // Initialize AudioContext
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    return () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stop = () => {
    streamStop();
    if (queueSourceNodeRef.current) {
      queueSourceNodeRef.current.stop();
      queueSourceNodeRef.current.disconnect();
      queueSourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setPlayingText(null);
  };

  const play = async (text: string) => {
    if (!isReady) return;
    stop();
    setIsPlaying(true);
    setPlayingText(text);
    try {
      if (!audioContextRef.current) return;
      
      const queueNode = audioContextRef.current.createBufferQueueSource();
      queueNode.connect(audioContextRef.current.destination);
      queueNode.start();
      
      queueSourceNodeRef.current = queueNode;

      queueNode.onEnded = () => {
        setIsPlaying(false);
        setPlayingText(null);
      };

      const streamPromise = stream({
        onNext: async (audioChunk) => {
          if (!queueSourceNodeRef.current) return; // stopped
          const float32Array = new Float32Array(audioChunk);
          const audioBuffer = audioContextRef.current!.createBuffer(
            1, // mono
            float32Array.length,
            24000
          );
          audioBuffer.copyToChannel(float32Array, 0);
          queueNode.enqueueBuffer(audioBuffer);
        },
      });

      // Split text into chunks to stream them sequentially
      let sentences = text.match(/[^.?!;\n]+[.?!;\n]+/g);
      if (!sentences) {
        sentences = [text];
      } else {
        const matchedText = sentences.join('');
        if (matchedText.length < text.length) {
          sentences.push(text.substring(matchedText.length));
        }
      }

      for (const sentence of sentences) {
        if (!queueSourceNodeRef.current) break; // Check if stopped
        let s = sentence.trim();
        if (s.length > 0) {
          if (!'.?!;'.includes(s.slice(-1))) {
            s += '.';
          }
          streamInsert(s);
          await new Promise(r => setTimeout(r, 50)); // Yield to native and React
        }
      }

      streamStop(false);

      await streamPromise;
      // The streaming has finished yielding buffers. 
      // The queueNode will fire onEnded when the queued buffers are fully played.
    } catch (e) {
      console.error('TTS streaming error:', e);
      setIsPlaying(false);
      setPlayingText(null);
    }
  };

  return (
    <TTSContext.Provider value={{ isReady, downloadProgress, play, stop, isPlaying, playingText }}>
      {children}
    </TTSContext.Provider>
  );
};

export const useTTS = () => {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
};
