import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '@/constants/theme';

interface LoaderScreenProps {
    message?: string;
    progress?: number;
}

export function LoaderScreen({ message = "Loading...", progress }: LoaderScreenProps) {
    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color={'#007AFF'} />
            <Text style={styles.message}>{message}</Text>
            {progress !== undefined && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(Math.max(progress, 0), 100)}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{Math.round(progress)}%</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    message: {
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: '600',
        marginTop: 24,
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        maxWidth: 300,
        marginTop: 20,
        alignItems: 'center',
    },
    progressBarBackground: {
        width: '100%',
        height: 8,
        backgroundColor: colors.surface,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#007AFF',
    },
    progressText: {
        color: colors.textSecondary,
        fontSize: 14,
        marginTop: 8,
    }
});
