import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogEntry, logger } from "@/services/logger";
import { colors } from "@/constants/theme";

export default function LogsScreen() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        setLogs(logger.getLogs());
        const unsubscribe = logger.subscribe((newLogs) => {
            setLogs(newLogs);
        });
        return unsubscribe;
    }, []);

    const renderItem = ({ item }: { item: LogEntry }) => (
        <View style={styles.logEntry}>
            <Text style={styles.timestamp}>
                {item.timestamp.toLocaleTimeString()} - {item.id}
            </Text>
            <Text style={styles.message}>{item.message}</Text>
            {item.data && (
                <Text style={styles.data}>
                    {JSON.stringify(item.data, null, 2)}
                </Text>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>System Logs</Text>
                <TouchableOpacity onPress={() => logger.clearLogs()} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
            </View>
            <FlatList
                data={logs}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={<Text style={styles.emptyText}>No logs available yet.</Text>}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.surface,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    clearBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: colors.surface,
        borderRadius: 6,
    },
    clearBtnText: {
        color: colors.textPrimary,
        fontWeight: '600',
    },
    listContent: {
        padding: 16,
        gap: 12,
    },
    logEntry: {
        padding: 12,
        backgroundColor: colors.surface,
        borderRadius: 8,
    },
    timestamp: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    message: {
        fontSize: 16,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    data: {
        marginTop: 8,
        fontSize: 12,
        color: '#A8B2C1',
        fontFamily: 'monospace',
    },
    emptyText: {
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 40,
    }
});
