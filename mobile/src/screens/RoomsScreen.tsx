import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import { roomService, RoomSummary } from '../services/roomService';
import { borderRadius, colors, fontSize, shadows, spacing } from '../utils/theme';

export const RoomsScreen: React.FC = () => {
  const { user, logout } = useCognitoAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      console.log('🔄 RoomsScreen: Loading user rooms...');
      const userRooms = await roomService.getUserRooms();
      console.log('✅ RoomsScreen: Loaded rooms:', userRooms);
      setRooms(userRooms);
    } catch (error) {
      console.error('❌ RoomsScreen: Error loading rooms:', error);
      Alert.alert(
        'Error',
        'No se pudieron cargar las salas. Verifica tu conexión e inténtalo de nuevo.',
        [
          { text: 'Reintentar', onPress: loadRooms },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRooms();
  }, [loadRooms]);

  const handleRoomCreated = (room: any) => {
    console.log('✅ RoomsScreen: Room created, refreshing list');
    // Add the new room to the list immediately for better UX
    const newRoomSummary: RoomSummary = {
      id: room.id,
      name: room.name,
      creatorId: room.hostId || room.creatorId,
      memberCount: room.memberCount || 1,
      matchCount: room.matchCount || 0,
      isActive: room.isActive !== false,
      createdAt: room.createdAt || new Date().toISOString(),
    };
    setRooms(prev => [newRoomSummary, ...prev]);
  };

  const handleRoomJoined = (room: any) => {
    console.log('✅ RoomsScreen: Room joined, refreshing list');
    // Refresh the list to get updated data
    loadRooms();
  };

  const handleRoomPress = (room: RoomSummary) => {
    // Navigate to room details/voting screen
    router.push(`/room/${room.id}/details`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Hoy';
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es-ES', { 
        day: 'numeric', 
        month: 'short' 
      });
    }
  };

  const renderRoomItem = ({ item }: { item: RoomSummary }) => (
    <TouchableOpacity
      style={styles.roomCard}
      onPress={() => handleRoomPress(item)}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['rgba(139, 92, 246, 0.1)', 'rgba(6, 182, 212, 0.05)']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.roomHeader}>
        <View style={styles.roomIconContainer}>
          <Ionicons name="film" size={20} color={colors.primary} />
        </View>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.roomDate}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.roomStatus}>
          <View style={[styles.statusDot, item.isActive && styles.statusDotActive]} />
          <Text style={[styles.statusText, item.isActive && styles.statusTextActive]}>
            {item.isActive ? 'Activa' : 'Inactiva'}
          </Text>
        </View>
      </View>

      <View style={styles.roomStats}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={16} color={colors.secondary} />
          <Text style={styles.statText}>
            {item.memberCount} {item.memberCount === 1 ? 'persona' : 'personas'}
          </Text>
        </View>
        
        <View style={styles.statItem}>
          <Ionicons name="heart" size={16} color={colors.accent} />
          <Text style={styles.statText}>
            {item.matchCount} {item.matchCount === 1 ? 'match' : 'matches'}
          </Text>
        </View>
      </View>

      <View style={styles.roomFooter}>
        <Text style={styles.creatorText}>
          {item.creatorId === user?.id ? 'Tu sala' : 'Invitado'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="film-outline" size={48} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No tienes salas aún</Text>
      <Text style={styles.emptySubtitle}>
        Crea una nueva sala o únete a una existente para empezar a descubrir películas
      </Text>
      
      <View style={styles.emptyActions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.primary, '#6366F1']}
            style={styles.primaryButtonGradient}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.primaryButtonText}>Crear sala</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowJoinModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="enter" size={18} color={colors.secondary} />
          <Text style={styles.secondaryButtonText}>Unirse a sala</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando salas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mis Salas</Text>
          <Text style={styles.subtitle}>
            Hola, {user?.name || 'Usuario'}
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowJoinModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="enter" size={20} color={colors.secondary} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.headerButton}
            onPress={logout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={rooms}
        renderItem={renderRoomItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContainer,
          rooms.length === 0 && styles.listContainerEmpty
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onGoToRooms={() => {
          setShowCreateModal(false);
          // Already on rooms screen, just refresh
          loadRooms();
        }}
        onRoomCreated={handleRoomCreated}
      />

      <JoinRoomModal
        visible={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onRoomJoined={handleRoomJoined}
      />
    </SafeAreaView>
  );
};

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
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  listContainer: {
    padding: spacing.lg,
  },
  listContainerEmpty: {
    flex: 1,
  },
  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    ...shadows.sm,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roomIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  roomDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  roomStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  statusTextActive: {
    color: colors.success,
  },
  roomStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  roomFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  creatorText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  emptyActions: {
    width: '100%',
    gap: spacing.md,
  },
  primaryButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.glow,
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    gap: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.secondary,
  },
});