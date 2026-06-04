import { Feather, FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { colors } from "@/constants/theme";
import { Message, useSpeechToText, WHISPER_TINY_EN } from "react-native-executorch";
import { AudioManager, AudioRecorder } from "react-native-audio-api";
import { rag, getPromptGenerator } from "@/services/ragService";
import { LoaderScreen } from "@/components/LoaderScreen";
import { useTTS } from "@/contexts/TTSContext";
import { useRef } from "react";
import Markdown from "react-native-markdown-display";
import { Switch } from "react-native";


// React Native Audio API setup
const recorder = new AudioRecorder({
    sampleRate: 16000,
    bufferLengthInSamples: 1600,
});
AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'spokenAudio',
    iosOptions: ['allowBluetooth', 'defaultToSpeaker'],
});
AudioManager.requestRecordingPermissions();
AudioManager.requestRecordingPermissions();

export default function AIAssistant() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);
    // Hardcoded for now as we don't have a model selector
    const isQwen3 = false;

    const [ragIsReady, setRagIsReady] = useState(false);
    const [ragIsGenerating, setRagIsGenerating] = useState(false);
    const [ragResponse, setRagResponse] = useState("");
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState("Initializing AI Assistant...");

    const [isTranscribing, setIsTranscribing] = useState(false);
    const isVoiceInputRef = useRef(false);
    const transcriptionIdRef = useRef(0);
    const scrollViewRef = useRef<ScrollView>(null);
    const { isReady: ttsIsReady, play: ttsPlay, stop: ttsStop, isPlaying: ttsIsPlaying, playingText: ttsPlayingText } = useTTS();
    const { stream, streamInsert, streamStop, isReady: sttIsReady, downloadProgress: sttProgress } = useSpeechToText({ model: WHISPER_TINY_EN });

    useEffect(() => {
        recorder.onAudioReady(({ buffer }) => {
            streamInsert(buffer.getChannelData(0));
        });
    }, [streamInsert]);

    useEffect(() => {
        if (ragIsReady) return;

        (async () => {
            try {
                setLoadingMessage("Loading RAG Model...");
                await rag.load();
                setRagIsReady(true);
            } catch (e) {
                console.error('Failed to load AI assistant components', e);
                setLoadingMessage("Failed to load components");
            }
        })();

        return () => {
            rag.interrupt();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleStartGenerating = async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || !ragIsReady || ragIsGenerating) return;

        if (isTranscribing) {
            recorder.stop();
            streamStop();
            setIsTranscribing(false);
        }
        
        transcriptionIdRef.current++; // Invalidate pending transcription updates

        const newMessage: Message = { role: "user", content: trimmed };
        const newMessages = [...messages, newMessage];

        setInputValue("");
        setMessages(newMessages);
        setRagIsGenerating(true);
        try {
            const response = await rag.generate({
                input: newMessages,
                nResults: 1,
                callback: (token) => { setRagResponse((prev) => prev + token) },
                promptGenerator: getPromptGenerator(isThinkingEnabled, isQwen3),
            });
            setRagIsGenerating(false);
            setRagResponse("");
            setMessages([...newMessages, { role: "assistant", content: response }]);
            isVoiceInputRef.current = false;
        } catch (e) {
            console.error('Failed to generate response', e);
        }
    };

    const handleStopGenerating = () => {
        if (!ragIsGenerating) return;
        rag.interrupt();
        setRagIsGenerating(false);
        setRagResponse("");
    };

    const handleStartTranscribing = async () => {
        if (!ragIsReady || ragIsGenerating || isTranscribing) return;
        setIsTranscribing(true);
        isVoiceInputRef.current = true;
        setInputValue("");

        try {
            recorder.start();

            const currentId = ++transcriptionIdRef.current;
            let committedTranscription = "";
            for await (const { committed, nonCommitted } of stream()) {
                if (transcriptionIdRef.current !== currentId) break;
                committedTranscription += committed.text;
                setInputValue(committedTranscription + nonCommitted.text);
            }
        } catch (e) {
            console.error('Transcription failed', e);
        }

        setIsTranscribing(false);
    };

    const handleStopTranscribing = () => {
        if (!isTranscribing) return;
        recorder.stop();
        streamStop();
        setIsTranscribing(false);
    };

    if (!ragIsReady || !sttIsReady) {
        return (
            <LoaderScreen message={!sttIsReady ? "Loading Whisper Model..." : loadingMessage} progress={!sttIsReady ? sttProgress : loadingProgress} />
        );
    }

    const extendedMessages = ragIsGenerating
        ? [...messages, { role: "assistant", content: ragResponse }]
        : messages;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior="padding"
                keyboardVerticalOffset={140}
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>AI Assistant</Text>
                    <View style={styles.toggleContainer}>
                        <Text style={styles.toggleLabel}>Thinking</Text>
                        <Switch value={isThinkingEnabled} onValueChange={setIsThinkingEnabled} />
                    </View>
                </View>
                <ScrollView 
                    ref={scrollViewRef}
                    contentContainerStyle={styles.scrollView}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                >
                    {extendedMessages.map((msg, index) => (
                        <MessageBubble key={index} msg={msg} />
                    ))}
                </ScrollView>
                <View style={styles.inputBar}>
                    <TextInput
                        value={inputValue}
                        onChangeText={(text) => {
                            setInputValue(text);
                            isVoiceInputRef.current = false;
                        }}
                        multiline
                        placeholder="Ask me anything..."
                        placeholderTextColor={colors.textSecondary}
                        style={styles.textInput}
                    />
                    <View style={styles.sendButtonWrapper}>
                        {isTranscribing ? (
                            <TouchableOpacity onPress={handleStopTranscribing} style={styles.sendButton} disabled={ragIsGenerating}>
                                <FontAwesome6 name="circle-stop" size={24} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleStartTranscribing} style={styles.sendButton} disabled={ragIsGenerating}>
                                <MaterialIcons name="multitrack-audio" size={24} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.sendButtonWrapper}>
                        {ragIsGenerating ? (
                            <TouchableOpacity onPress={handleStopGenerating} style={styles.sendButton} disabled={ragIsGenerating}>
                                <FontAwesome6 name="circle-stop" size={24} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleStartGenerating} style={styles.sendButton} disabled={ragIsGenerating}>
                                <Feather name="arrow-up-circle" size={24} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    container: {
        flex: 1,
        padding: 12,
        backgroundColor: colors.background,
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    inputBar: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 4,
    },
    textInput: {
        flex: 1,
        padding: 8,
        alignSelf: 'center',
    },
    sendButtonWrapper: {
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    sendButton: {
        padding: 8,
    },
    scrollView: {
        flex: 1,
        gap: 8,
    },
    messageBubble: {
        padding: 12,
        borderRadius: 12,
    },
    messageBubbleAssistant: {
        padding: 0,
    },
    messageBubbleUser: {
        maxWidth: '80%',
        backgroundColor: colors.surface,
        alignSelf: 'flex-end',
    },
    assistantMessageContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    assistantMessageContent: {
        flex: 1,
    },
    playButton: {
        marginLeft: 8,
        marginTop: 2,
        padding: 4,
    },
    messageText: {
        fontSize: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingBottom: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    toggleLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    thinkingCard: {
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
    },
    thinkingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    thinkingTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    thinkingContent: {
        marginTop: 8,
        fontSize: 14,
        color: colors.textSecondary,
        fontStyle: 'italic',
    }
});

function MessageBubble({ msg }: { msg: Message }) {
    const { isReady: ttsIsReady, play: ttsPlay, stop: ttsStop, isPlaying: ttsIsPlaying, playingText: ttsPlayingText } = useTTS();
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    let thinking = "";
    let rest = msg.content;
    
    if (msg.role === 'assistant') {
        const thinkStart = msg.content.indexOf("<think>");
        if (thinkStart !== -1) {
            const thinkEnd = msg.content.indexOf("</think>");
            if (thinkEnd !== -1) {
                thinking = msg.content.substring(thinkStart + 7, thinkEnd).trim();
                rest = (msg.content.substring(0, thinkStart) + msg.content.substring(thinkEnd + 8)).trim();
            } else {
                thinking = msg.content.substring(thinkStart + 7).trim();
                rest = msg.content.substring(0, thinkStart).trim();
            }
        }
    }

    return (
        <View style={[styles.messageBubble, msg.role === "user" ? styles.messageBubbleUser : styles.messageBubbleAssistant]}>
            {msg.role === 'assistant' ? (
                <View style={styles.assistantMessageContainer}>
                    <View style={styles.assistantMessageContent}>
                        {thinking.length > 0 && (
                            <View style={styles.thinkingCard}>
                                <TouchableOpacity style={styles.thinkingHeader} onPress={() => setIsThinkingExpanded(!isThinkingExpanded)}>
                                    <FontAwesome6 name={isThinkingExpanded ? "chevron-down" : "chevron-right"} size={12} color={colors.textSecondary} />
                                    <Text style={styles.thinkingTitle}>Thinking Process</Text>
                                </TouchableOpacity>
                                {isThinkingExpanded && (
                                    <Text style={styles.thinkingContent}>{thinking}</Text>
                                )}
                            </View>
                        )}
                        {rest.length > 0 && (
                            <Markdown style={{ body: { color: colors.textPrimary, fontSize: 16 } }}>
                                {rest}
                            </Markdown>
                        )}
                    </View>
                    {msg.content.trim().length > 0 && ttsIsReady && (
                        <TouchableOpacity
                            style={styles.playButton}
                            onPress={() => {
                                if (ttsIsPlaying && ttsPlayingText === msg.content) {
                                    ttsStop();
                                } else {
                                    ttsPlay(msg.content);
                                }
                            }}
                        >
                            <FontAwesome6
                                name={(ttsIsPlaying && ttsPlayingText === msg.content) ? "circle-stop" : "circle-play"}
                                size={20}
                                color={colors.textPrimary}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <Text style={styles.messageText}>{msg.content}</Text>
            )}
        </View>
    );
}
