import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import {
  useTextToSpeech,
  KOKORO_AMERICAN_ENGLISH_FEMALE_SARAH,
} from 'react-native-executorch';
import { AudioContext, AudioBufferSourceNode } from 'react-native-audio-api';

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
  const { isReady, downloadProgress, forward, error } = useTextToSpeech(
    KOKORO_AMERICAN_ENGLISH_FEMALE_SARAH
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingText, setPlayingText] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
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
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
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
      const rawAudio = await forward({ text });
      console.log('rawAudio is Array?', Array.isArray(rawAudio));
      console.log('rawAudio length:', rawAudio.length);
      
      const float32Array = new Float32Array(rawAudio);
      if (!audioContextRef.current) return;
      
      console.log('creating buffer...');
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        float32Array.length,
        24000
      );
      
      console.log('audioBuffer:', audioBuffer);
      console.log('audioBuffer.buffer:', (audioBuffer as any).buffer);

      audioBuffer.copyToChannel(float32Array, 0);

      console.log('creating source node...');
      const sourceNode = audioContextRef.current.createBufferSource();
      console.log('setting buffer...');
      sourceNode.buffer = audioBuffer;
      
      console.log('connecting and starting...');
      sourceNode.connect(audioContextRef.current.destination);
      sourceNode.start();
      
      sourceNodeRef.current = sourceNode;

      sourceNode.onEnded = () => {
        setIsPlaying(false);
        setPlayingText(null);
      };
    } catch (e) {
      console.error('TTS playback error:', e);
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
