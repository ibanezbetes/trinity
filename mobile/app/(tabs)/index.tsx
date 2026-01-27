import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/utils/theme';
import { useAppSync } from '../../src/services/apiClient';
import CreateRoomModal from '../../src/components/CreateRoomModal';
import Logo from '../../src/components/Logo';

const { width } = Dimensions.get('window');

// Posters para el header
const TRENDING_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  'https://image.tmdb.org/t/p/w300/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
];

export default function HomeScreen() {
  const appSync = useAppSync();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();

    // Animación de posters
    Animated.loop(
      Animated.timing(posterScrollAnim, { toValue: 1, duration: 20000, useNativeDriver: true })
    ).start();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading user rooms via AppSync (Home)...');
      
      // Use AppSync GraphQL instead of REST API
      const response = await appSync.getUserRooms();
      const userRooms = response.getUserRooms || [];
      
      console.log('✅ Loaded rooms via AppSync (Home):', userRooms);
      setRooms(userRooms);
    } catch (error) {
      console.error('❌ Error loading data via AppSync (Home):', error);
      
      // Handle authentication errors gracefully
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        console.warn('⚠️ User not authenticated, showing empty rooms list');
        setRooms([]);
      } else {
        setRooms([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoomCreated = () => loadData();
  const totalMatches = rooms.reduce((sum, room) => sum + (room.matchCount || 0), 0);

  const translateX = posterScrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.5],
  });

  return (
    <View style={styles.container}>
      {/* Header con posters animados */}
      <View style={styles.headerBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...TRENDING_POSTERS, ...TRENDING_POSTERS].map((poster, index) => (
            <Image key={index} source={{ uri: poster }} style={styles.headerPoster} />
          ))}
        </Animated.View>
        <LinearGradient
          colors={['transparent', 'rgba(10, 10, 15, 0.7)', colors.background]}
          style={styles.headerGradient}
        />
      </View>

      {/* Círculos decorativos */}
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>¡Hola! 👋</Text>
                <Text style={styles.headerTitle}>¿Qué vemos hoy?</Text>
              </View>
              <Logo size="small" />
            </View>

            {/* Banner crear sala */}
            <TouchableOpacity 
              style={styles.bannerWrapper}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[colors.primary, '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.banner}
              >
                <View style={styles.bannerContent}>
                  <View style={styles.bannerIconBg}>
                    <Ionicons name="add" size={28} color="#FFF" />
                  </View>
                  <View style={styles.bannerText}>
                    <Text style={styles.bannerTitle}>Crear nueva sala</Text>
                    <Text style={styles.bannerSubtitle}>Invita amigos y haz swipe juntos</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
                </View>
                {/* Decoración */}
                <View style={styles.bannerDecor1} />
                <View style={styles.bannerDecor2} />
              </LinearGradient>
            </TouchableOpacity>

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <LinearGradient colors={['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <Ionicons name="heart" size={20} color={colors.accent} />
                </View>
                <Text style={[styles.statNumber, { color: colors.accent }]}>{totalMatches}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>
              
              <View style={styles.statCard}>
                <LinearGradient colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Ionicons name="people" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.statNumber, { color: colors.primary }]}>{loading ? '...' : rooms.length}</Text>
                <Text style={styles.statLabel}>Salas</Text>
              </View>

              <View style={styles.statCard}>
                <LinearGradient colors={['rgba(6, 182, 212, 0.15)', 'rgba(6, 182, 212, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(6, 182, 212, 0.2)' }]}>
                  <Ionicons name="film" size={20} color={colors.secondary} />
                </View>
                <Text style={[styles.statNumber, { color: colors.secondary }]}>∞</Text>
                <Text style={styles.statLabel}>Contenido</Text>
              </View>
            </View>

            {/* Salas activas */}
            {rooms.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.sectionIconBg}>
                      <Ionicons name="flash" size={14} color={colors.primary} />
                    </View>
                    <Text style={styles.sectionTitle}>Salas activas</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/rooms')}>
                    <Text style={styles.seeAllText}>Ver todas</Text>
                  </TouchableOpacity>
                </View>

                {rooms.slice(0, 3).map((room, index) => (
                  <TouchableOpacity 
                    key={room.id} 
                    style={styles.roomCard} 
                    activeOpacity={0.8}
                    onPress={() => router.push(`/room/${room.id}`)}
                  >
                    <LinearGradient
                      colors={index === 0 ? ['rgba(139, 92, 246, 0.12)', 'transparent'] : ['rgba(6, 182, 212, 0.08)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.roomIcon, { backgroundColor: index === 0 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(6, 182, 212, 0.2)' }]}>
                      <Ionicons name="people" size={18} color={index === 0 ? colors.primary : colors.secondary} />
                    </View>
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomTitle} numberOfLines={1}>{room.name}</Text>
                      <Text style={styles.roomMeta}>{room.memberCount} miembros · {room.matchCount} matches</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: room.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(113, 113, 122, 0.15)' }
                    ]}>
                      <View style={[styles.statusDot, { backgroundColor: room.isActive ? colors.success : colors.textMuted }]} />
                      <Text style={[styles.statusText, { color: room.isActive ? colors.success : colors.textMuted }]}>
                        {room.isActive ? 'Activa' : 'Inactiva'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Estado vacío */}
            {!loading && rooms.length === 0 && (
              <View style={styles.emptyState}>
                <LinearGradient
                  colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']}
                  style={styles.emptyIconBg}
                >
                  <Ionicons name="film-outline" size={48} color={colors.primary} />
                </LinearGradient>
                <Text style={styles.emptyTitle}>¡Empieza tu aventura!</Text>
                <Text style={styles.emptySubtitle}>Crea tu primera sala y descubre qué ver con tus amigos</Text>
                <TouchableOpacity style={styles.emptyButtonWrapper} onPress={() => setShowCreateModal(true)}>
                  <LinearGradient colors={[colors.primary, '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyButton}>
                    <Ionicons name="add" size={20} color="#FFF" />
                    <Text style={styles.emptyButtonText}>Crear sala</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onGoToRooms={() => router.push('/rooms')}
        onRoomCreated={handleRoomCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Header con posters
  headerBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: 180, overflow: 'hidden' },
  posterRow: { flexDirection: 'row', height: 160 },
  headerPoster: { width: 100, height: 150, marginHorizontal: 4, borderRadius: 8, opacity: 0.5 },
  headerGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  // Glows
  glowPurple: { position: 'absolute', top: 100, left: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  glowCyan: { position: 'absolute', top: 200, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(6, 182, 212, 0.12)' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginBottom: spacing.lg },
  greeting: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 2 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  // Banner
  bannerWrapper: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderRadius: borderRadius.xl, overflow: 'hidden', ...shadows.glow },
  banner: { padding: spacing.lg, position: 'relative', overflow: 'hidden' },
  bannerContent: { flexDirection: 'row', alignItems: 'center' },
  bannerIconBg: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  bannerSubtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)' },
  bannerDecor1: { position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' },
  bannerDecor2: { position: 'absolute', bottom: -30, right: 50, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' },
  // Stats
  statsContainer: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  statIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xs },
  statNumber: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  // Section
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIconBg: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.15)', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  seeAllText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },
  // Room card
  roomCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  roomIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  roomInfo: { flex: 1 },
  roomTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  roomMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: '500' },
  // Empty
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  emptySubtitle: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  emptyButtonWrapper: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glow },
  emptyButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  emptyButtonText: { fontSize: fontSize.md, fontWeight: '600', color: '#FFF' },
});
