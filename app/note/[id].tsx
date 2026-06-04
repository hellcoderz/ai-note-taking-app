import { FontAwesome6 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Text } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { notesService } from "@/services/notesService";
import { colors } from "@/constants/theme";
import { useTTS } from "@/contexts/TTSContext";
import { LoaderScreen } from "@/components/LoaderScreen";
import { useSpeechToText, WHISPER_TINY_EN } from "react-native-executorch";
import { AudioManager, AudioRecorder, decodeAudioData } from "react-native-audio-api";
import * as DocumentPicker from "expo-document-picker";
import { useRef, useEffect } from "react";

const recorder = new AudioRecorder({
    sampleRate: 16000,
    bufferLengthInSamples: 1600,
});
AudioManager.requestRecordingPermissions();

export default function NoteEditor() {
    const { id, isNew } = useLocalSearchParams<{ id: string; isNew?: string }>();

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [imageUris, setImageUris] = useState<string[]>([]);
    
    const { isReady: ttsIsReady, play: ttsPlay, stop: ttsStop, isPlaying: ttsIsPlaying } = useTTS();

    const { stream, streamInsert, streamStop, transcribe, isReady: sttIsReady } = useSpeechToText({ model: WHISPER_TINY_EN });
    const [isTranscribing, setIsTranscribing] = useState(false);
    const transcriptionIdRef = useRef(0);

    useEffect(() => {
        recorder.onAudioReady(({ buffer }) => {
            streamInsert(buffer.getChannelData(0));
        });
    }, [streamInsert]);

    useFocusEffect(
        useCallback(() => {
            if (isNew === "true") return;
            (async () => {
                try {
                    const note = await notesService.getNote(id);
                    setTitle(note.title);
                    setContent(note.content);
                    setImageUris(note.imageUris);
                } catch (e) {
                    console.error('Failed to get note', e);
                }
            })();
        }, [id])
    );

    const router = useRouter();

    const handleSaveBtn = async () => {
        try {
            if (isNew === "true") {
                await notesService.createNote(title, content, imageUris, id);
            } else {
                await notesService.updateNote(id, { title, content, imageUris });
            }
            router.back();
        } catch (e) {
            console.error('Failed to update note', e);
        }
    };

    const handleAddImages = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission required", "Photo library permission is needed to pick images.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            selectionLimit: 1,
            quality: 1,
        });
        if (result.canceled) return;

        try {
            const destUri = await notesService.addImageToNote(id, result.assets[0].uri);
            const newImageUris = [...imageUris, destUri];
            setImageUris(newImageUris);
        } catch (e) {
            console.error('Failed to add image to note', e);
        }
    };

    const handleRemoveImage = (uri: string) => {
        Alert.alert(
            "Remove image?",
            "This will remove the image from this note.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        const filteredImageUris = imageUris.filter(u => u !== uri);
                        setImageUris(filteredImageUris);
                    }
                },
            ]
        );
    };

    const handleStartTranscribing = async () => {
        if (!sttIsReady || isTranscribing) return;
        setIsTranscribing(true);
        try {
            recorder.start();
            const currentId = ++transcriptionIdRef.current;
            let currentTranscription = "";
            const initialContent = content; // We want to append to the existing content
            
            for await (const { committed, nonCommitted } of stream()) {
                if (transcriptionIdRef.current !== currentId) break;
                currentTranscription = committed.text + nonCommitted.text;
                setContent(initialContent + (initialContent.length > 0 ? " " : "") + currentTranscription);
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

    const handleUploadAudio = async () => {
        if (!sttIsReady) {
            Alert.alert("Error", "Speech-to-text model is not ready yet.");
            return;
        }
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
            });
            if (result.canceled || !result.assets || result.assets.length === 0) return;
            
            const uri = result.assets[0].uri;
            // Decode audio to Float32Array at 16kHz
            const audioBuffer = await decodeAudioData(uri, 16000);
            const float32Array = audioBuffer.getChannelData(0);
            
            const transcriptionResult = await transcribe(float32Array);
            
            // Append transcribed text
            setContent(prev => prev + (prev.length > 0 ? " " : "") + transcriptionResult.text);
        } catch (e) {
            console.error('Failed to transcribe uploaded audio', e);
            Alert.alert("Transcription Error", "Failed to transcribe the audio file.");
        }
    };

    return (
        <>
            <Stack.Screen options={{
                headerRight: () => (
                    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                        {content.length > 0 && ttsIsReady && (
                            <TouchableOpacity onPress={() => ttsIsPlaying ? ttsStop() : ttsPlay(content)}>
                                <FontAwesome6 name={ttsIsPlaying ? "stop" : "play"} size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={handleSaveBtn}>
                            <Text style={styles.saveButton}>Save</Text>
                        </TouchableOpacity>
                    </View>
                ),
            }} />
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior="padding"
                keyboardVerticalOffset={100}
            >
                <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Title"
                    style={styles.titleInput}
                    placeholderTextColor={colors.textSecondary}
                />
                <View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesListContainer}>
                        {imageUris.map((uri) => (
                            <TouchableOpacity
                                key={uri}
                                onLongPress={() => handleRemoveImage(uri)} delayLongPress={300} accessibilityRole="button" accessibilityLabel="Remove image"
                            >
                                <Image source={{ uri }} style={styles.imageThumb} />
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity onPress={handleAddImages} style={styles.addThumb} accessibilityRole="button" accessibilityLabel="Add image">
                            <FontAwesome6 name="plus" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleUploadAudio} style={styles.addThumb} accessibilityRole="button" accessibilityLabel="Upload audio">
                            <FontAwesome6 name="file-audio" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                        {isTranscribing ? (
                            <TouchableOpacity onPress={handleStopTranscribing} style={styles.addThumb} accessibilityRole="button" accessibilityLabel="Stop recording">
                                <FontAwesome6 name="circle-stop" size={20} color="red" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleStartTranscribing} style={styles.addThumb} accessibilityRole="button" accessibilityLabel="Record voice">
                                <FontAwesome6 name="microphone" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
                <TextInput
                    value={content}
                    onChangeText={setContent}
                    placeholder="Write your note..."
                    multiline
                    style={styles.textInput}
                    placeholderTextColor={colors.textSecondary}
                />
            </KeyboardAvoidingView>
        </>
    );
}

const styles = StyleSheet.create({
    saveButton: {
        fontSize: 16,
    },
    keyboardAvoidingView: {
        flex: 1,
        backgroundColor: colors.background,
        gap: 12,
        padding: 12,
    },
    titleInput: {
        fontSize: 20,
        fontWeight: "600",
        color: colors.textPrimary,
    },
    imagesListContainer: {
        gap: 8,
    },
    imageThumb: {
        width: 80,
        height: 80,
        borderRadius: 8,
    },
    addThumb: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    textInput: {
        color: colors.textPrimary,
    },
});
