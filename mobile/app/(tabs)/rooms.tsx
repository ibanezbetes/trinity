import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateRoomModal from '../../src/components/CreateRoomModal';
import JoinRoomModal from '../../src/components/JoinRoomModal';
import Logo from '../../src/components/Logo';
import { useAppSync } from '../../src/services/apiClient';
import { borderRadius, colors, fontSize, spacing } from '../../src/utils/theme';

interface RoomMember {
  id: string;
  avatar: string;
  isReady: boolean;
}

interface RoomDisplay {
  id: string;
  name: string;
  date: string;
  time: string;
  members: RoomMember[];
  totalMembers: number;
  readyCount: number;
  isAllReady: boolean;
  matchCount: number;
}

export default function RoomsScreen() {
  const appSync = useAppSync();
  const [rooms, setRooms] = useState<RoomDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const router = useRouter();

  const loadRooms = async () => {
    try {
      console.log('🔄 Loading user rooms via AppSync...');
      
      // Use AppSync GraphQL instead of REST API
      const response = await appSync.getUserRooms();
      const userRooms = response.getUserRooms || [];
      
      console.log('✅ Loaded rooms via AppSync:', userRooms);
      
      // Transform GraphQL response to display format
      const displayRooms: RoomDisplay[] = userRooms.map((room: any) => {
        const date = new Date(room.createdAt);
        return {
          id: room.id,
          name: room.name,
          date: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          time: date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          members: Array(room.memberCount || 1).fill(null).map((_, i) => ({
            id: `member-${i}`,
            avatar: `https://i.pravatar.cc/100?img=${i + 1}`,
            isReady: Math.random() > 0.3,
          })),
          totalMembers: room.memberCount || 1,
          readyCount: Math.floor((room.memberCount || 1) * 0.7),
          isAllReady: (room.memberCount || 1) > 0 && Math.random() > 0.5,
          matchCount: 0, // GraphQL response doesn't include match count yet
        };
      });
      
      setRooms(displayRooms);
    } catch (error) {
      console.error('❌ Error loading rooms via AppSync:', error);
      
      // Handle authentication errors gracefully
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        console.warn('⚠️ User not authenticated, showing empty rooms list');
        setRooms([]);
      } else {
        // For other errors, show empty state but don't crash
        setRooms([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Cargar salas al montar y cuando la pantalla recibe foco
  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const handleRoomCreated = () => {
    loadRooms(); // Recargar salas después de crear una nueva
  };

  const activeRooms = rooms.filter(r => r.isAllReady || r.readyCount > 0).length;
  const totalMatches = rooms.reduce((sum, r) => sum + r.matchCount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Salas</Text>
            <Text style={styles.subtitle}>TUS SESIONES GRUPALES</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.joinHeaderButton}
              onPress={() => setShowJoinModal(true)}
            >
              <Ionicons name="enter-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Logo size="small" />
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="flash" size={16} color={colors.primary} />
              <Text style={styles.statLabel}>ACTIVAS</Text>
            </View>
            <Text style={styles.statNumber}>{rooms.length}</Text>
            <Text style={styles.statSubtext}>Salas activas</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="checkmark" size={16} color={colors.success} />
              <Text style={styles.statLabel}>MATCHES</Text>
            </View>
            <Text style={styles.statNumber}>{totalMatches}</Text>
            <Text style={styles.statSubtext}>Chines totales</Text>
          </View>
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Ionicons name="flash" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>SALAS ACTIVAS</Text>
        </View>

        {/* Loading State */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tienes salas activas</Text>
            <Text style={styles.emptySubtext}>Crea una sala para empezar a hacer match</Text>
            <TouchableOpacity 
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.createButtonText}>Crear sala</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Room Cards */
          rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))
        )}
      </ScrollView>

      {/* FAB para crear sala */}
      {rooms.length > 0 && (
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Modal de crear sala */}
      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onGoToRooms={() => {}}
        onRoomCreated={handleRoomCreated}
      />

      {/* Modal de unirse a sala */}
      <JoinRoomModal
        visible={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onRoomJoined={handleRoomCreated}
      />
    </SafeAreaView>
  );
}

function RoomCard({ room }: { room: RoomDisplay }) {
  const router = useRouter();
  
  const handlePress = () => {
    router.push(`/room/${room.id}/details`);
  };

  const handleStartPress = () => {
    router.push(`/room/${room.id}/details`);
  };

  return (
    <TouchableOpacity 
      style={[
        styles.roomCard,
        room.isAllReady && styles.roomCardReady
      ]}
      activeOpacity={0.8}
      onPress={handlePress}
    >
      {/* Status Badge */}
      <View style={styles.roomHeader}>
        <View style={[
          styles.statusBadge,
          room.isAllReady ? styles.statusBadgeReady : styles.statusBadgePending
        ]}>
          {room.isAllReady ? (
            <Ionicons name="checkmark" size={14} color={colors.success} />
          ) : (
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          )}
          <Text style={[
            styles.statusText,
            room.isAllReady && styles.statusTextReady
          ]}>
            {room.isAllReady ? 'Todos listos!' : `${room.readyCount}/${room.totalMembers} listos`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>

      {/* Room Name */}
      <Text style={styles.roomName}>{room.name}</Text>

      {/* Date */}
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={styles.dateText}>{room.date}, {room.time}</Text>
      </View>

      {/* Members and Action */}
      <View style={styles.roomFooter}>
        <View style={styles.membersContainer}>
          {room.members.map((member, index) => (
            <View 
              key={member.id} 
              style={[
                styles.memberAvatar,
                { marginLeft: index > 0 ? -12 : 0, zIndex: room.members.length - index }
              ]}
            >
              <Image source={{ uri: member.avatar }} style={styles.avatarImage} />
              {member.isReady && (
                <View style={styles.readyBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>
          ))}
        </View>
        <TouchableOpacity 
          style={[
            styles.actionButton,
            room.isAllReady && styles.actionButtonReady
          ]}
          onPress={handleStartPress}
        >
          <Ionicons 
            name="play" 
            size={16} 
            color={room.isAllReady ? '#fff' : colors.primary} 
          />
          <Text style={[
            styles.actionButtonText,
            room.isAllReady && styles.actionButtonTextReady
          ]}>
            {room.isAllReady ? 'Empezar' : 'Probar'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  joinHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 4,
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
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    letterSpacing: 1,
    fontWeight: '600',
  },
  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roomCardReady: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  statusBadgePending: {},
  statusBadgeReady: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  statusTextReady: {
    color: colors.success,
  },
  roomName: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dateText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  roomFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  membersContainer: {
    flexDirection: 'row',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  readyBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  actionButtonReady: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  actionButtonTextReady: {
    color: '#fff',
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xxl,
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
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  createButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
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
