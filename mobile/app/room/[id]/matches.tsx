import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../../src/utils/theme';
import { matchService, Match, MatchStats } from '../../../src/services/matchService';
import { roomService, RoomDetails } from '../../../src/services/roomService';

export default function RoomMatchesScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);

  const loadData = async () => {
    if (!roomId) return;
    
    try {
      const [matchesData, statsData, roomData] = await Promise.all([
        matchService.getRoomMatches(roomId),
        matchService.getMatchStats(roomId),
        roomService.getRoomDetails(roomId),
      ]);
      
      setMatches(matchesData);
      setStats(statsData);
      setRoomDetails(roomData);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [roomId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Matches</Text>
          <Text style={styles.headerSubtitle}>{roomDetails?.room.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Stats Cards */}
        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalMatches}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.matchesThisWeek}</Text>
              <Text style={styles.statLabel}>Esta semana</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.matchRate}%</Text>
              <Text style={styles.statLabel}>Tasa match</Text>
            </View>
          </View>
        )}

        {/* Matches List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="heart" size={16} color={colors.primary} /> MATCHES ENCONTRADOS
          </Text>
          
          {matches.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Aún no hay matches</Text>
              <Text style={styles.emptySubtext}>
                Sigue votando para encontrar contenido que le guste a todos
              </Text>
            </View>
          ) : (
            matches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={styles.matchCard}
                onPress={() => router.push(`/media/${match.mediaId}`)}
                activeOpacity={0.8}
              >
                <Image
                  source={{
                    uri: match.mediaPosterPath
                      ? `https://image.tmdb.org/t/p/w200${match.mediaPosterPath}`
                      : 'https://via.placeholder.com/200x300',
                  }}
                  style={styles.matchPoster}
                />
                <View style={styles.matchInfo}>
                  <Text style={styles.matchTitle} numberOfLines={2}>
                    {match.mediaTitle}
                  </Text>
                  <View style={styles.matchMeta}>
                    <View style={styles.consensusBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      <Text style={styles.consensusText}>
                        {match.consensusType === 'unanimous_like' ? 'Unánime' : 'Mayoría'}
                      </Text>
                    </View>
                    <Text style={styles.matchDate}>{formatDate(match.createdAt)}</Text>
                  </View>
                  <View style={styles.participantsRow}>
                    <Ionicons name="people" size={14} color={colors.textMuted} />
                    <Text style={styles.participantsText}>
                      {match.participantCount} participantes
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB para volver a votar */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.replace(`/room/${roomId}`)}
      >
        <Ionicons name="play" size={24} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  matchPoster: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  matchInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  matchTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  matchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  consensusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  consensusText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '500',
  },
  matchDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  participantsText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
