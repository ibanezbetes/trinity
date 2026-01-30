import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';
import { colors, spacing, fontSize } from '../src/utils/theme';

interface Room {
  id: string;
  name: string;
  code: string;
  hostId: string;
  isHost: boolean;
  memberCount: number;
  status: 'waiting' | 'voting' | 'completed';
  createdAt: Date;
  lastActivity: Date;
}

export default function MyRoomsScreen() {
  const { user } = useCognitoAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      // TODO: Implement actual API call to fetch user's rooms
      // For now, using mock data
      const mockRooms: Room[] = [
        {
          id: '1',
          name: 'Noche de Películas',
          code: 'ABC123',
          hostId: user?.id || '',
          isHost: true,
          memberCount: 4,
          status: 'voting',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          lastActivity: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        },
        {
          id: '2',
          name: 'Fin de Semana',
          code: 'XYZ789',
          hostId: 'other-user',
          isHost: false,
          memberCount: 6,
          status: 'waiting',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
        {
          id: '3',
          name: 'Clásicos del Cine',
          code: 'DEF456',
          hostId: user?.id || '',
          isHost: true,
          memberCount: 2,
          status: 'completed',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        },
      ];
      
      setRooms(mockRooms);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las salas');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const handleRoomPress = (room: Room) => {
    if (room.status === 'completed') {
      Alert.alert(
        'Sala Completada',
        'Esta sala ya ha terminado. ¿Quieres ver los resultados?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ver Resultados', onPress: () => router.push(`/room/${room.id}/results`) }
        ]
      );
    } else {
      router.push(`/room/${room.id}`);
    }
  };

  const handleDeleteRoom = (room: Room) => {
    if (!room.isHost) {
      Alert.alert('Error', 'Solo el host puede eliminar la sala');
      return;
    }

    Alert.alert(
      'Eliminar Sala',
      `¿Estás seguro de que quieres eliminar "${room.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement actual delete API call
            setRooms(prev => prev.filter(r => r.id !== room.id));
            Alert.alert('Éxito', 'Sala eliminada correctamente');
          }
        }
      ]
    );
  };

  const getStatusColor = (status: Room['status']) => {
    switch (status) {
      case 'waiting': return '#F59E0B'; // Yellow
      case 'voting': return '#10B981'; // Green
      case 'completed': return '#6B7280'; // Gray
      default: return colors.textSecondary;
    }
  };

  const getStatusText = (status: Room['status']) => {
    switch (status) {
      case 'waiting': return 'Esperando';
      case 'voting': return 'Votando';
      case 'completed': return 'Completada';
      default: return 'Desconocido';
    }
  };

  const getStatusEmoji = (status: Room['status']) => {
    switch (status) {
      case 'waiting': return '⏳';
      case 'voting': return '🗳️';
      case 'completed': return '✅';
      default: return '❓';
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `hace ${diffMins} min`;
    } else if (diffHours < 24) {
      return `hace ${diffHours}h`;
    } else {
      return `hace ${diffDays}d`;
    }
  };

  const renderRoom = (room: Room) => (
    <TouchableOpacity
      key={room.id}
      style={styles.roomCard}
      onPress={() => handleRoomPress(room)}
    >
      <View style={styles.roomHeader}>
        <View style={styles.roomTitleContainer}>
          <Text style={styles.roomName}>{room.name}</Text>
          <View style={styles.roomMeta}>
            <Text style={styles.roomCode}>Código: {room.code}</Text>
            <Text style={styles.roomRole}>
              {room.isHost ? '👑 Host' : '👤 Miembro'}
            </Text>
          </View>
        </View>
        
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(room.status) }]}>
          <Text style={styles.statusText}>
            {getStatusEmoji(room.status)} {getStatusText(room.status)}
          </Text>
        </View>
      </View>

      <View style={styles.roomInfo}>
        <View style={styles.roomStat}>
          <Text style={styles.statLabel}>Miembros</Text>
          <Text style={styles.statValue}>{room.memberCount}</Text>
        </View>
        
        <View style={styles.roomStat}>
          <Text style={styles.statLabel}>Creada</Text>
          <Text style={styles.statValue}>{formatTimeAgo(room.createdAt)}</Text>
        </View>
        
        <View style={styles.roomStat}>
          <Text style={styles.statLabel}>Actividad</Text>
          <Text style={styles.statValue}>{formatTimeAgo(room.lastActivity)}</Text>
        </View>
      </View>

      {room.isHost && room.status !== 'completed' && (
        <View style={styles.roomActions}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteRoom(room)}
          >
            <Text style={styles.deleteButtonText}>🗑️ Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Salas</Text>
        <TouchableOpacity 
          onPress={() => router.push('/room/create')}
          style={styles.createButton}
        >
          <Text style={styles.createButtonText}>+ Nueva</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Cargando salas...</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎬</Text>
            <Text style={styles.emptyTitle}>No tienes salas</Text>
            <Text style={styles.emptyDescription}>
              Crea una nueva sala o únete a una existente para empezar a votar películas
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/room/create')}
            >
              <Text style={styles.emptyButtonText}>Crear Primera Sala</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {rooms.length} sala{rooms.length !== 1 ? 's' : ''}
            </Text>
            {rooms.map(renderRoom)}
          </>
        )}
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
  },
  backText: {
    color: colors.primary,
    fontSize: fontSize.md,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  roomTitleContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  roomName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  roomMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roomCode: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  roomRole: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: 'white',
    fontWeight: '600',
  },
  roomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  roomStat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  roomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});