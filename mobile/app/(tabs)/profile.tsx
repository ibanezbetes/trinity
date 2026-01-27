import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCognitoAuth } from '../../src/context/CognitoAuthContext';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/utils/theme';
import { userListService } from '../../src/services/userListService';
import { roomService } from '../../src/services/roomService';
import Logo from '../../src/components/Logo';

export default function ProfileScreen() {
  const { user, logout } = useCognitoAuth();
  const [listCount, setListCount] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [roomCount, setRoomCount] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const avatarScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => { loadStats(); }, [])
  );

  const loadStats = async () => {
    try {
      const count = await userListService.getListCount();
      setListCount(count);
      const rooms = await roomService.getUserRooms();
      const matches = rooms.reduce((sum, room) => sum + room.matchCount, 0);
      setTotalMatches(matches);
      setRoomCount(rooms.length);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      {/* Círculos decorativos */}
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />
      <View style={styles.glowRed} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Perfil</Text>
              <Logo size="small" />
            </View>

            {/* Profile Card */}
            <View style={styles.profileCard}>
              <LinearGradient colors={['rgba(139, 92, 246, 0.15)', 'rgba(6, 182, 212, 0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              
              <Animated.View style={[styles.avatarContainer, { transform: [{ scale: avatarScale }] }]}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatar} />
                ) : (
                  <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={36} color="#FFF" />
                  </LinearGradient>
                )}
                <View style={styles.onlineBadge} />
              </Animated.View>

              <View style={styles.profileInfo}>
                <Text style={styles.userName}>{user?.displayName || user?.name || 'Usuario'}</Text>
                <Text style={styles.userEmail}>{user?.email || ''}</Text>
                <TouchableOpacity style={styles.editButton} onPress={() => router.push('/edit-profile')}>
                  <LinearGradient colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']} style={styles.editButtonGradient}>
                    <Ionicons name="pencil" size={14} color={colors.primary} />
                    <Text style={styles.editButtonText}>Editar perfil</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsContainer}>
              <TouchableOpacity style={styles.statCard} onPress={() => router.push('/my-list')}>
                <LinearGradient colors={['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <Ionicons name="bookmark" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.statNumber, { color: colors.accent }]}>{listCount}</Text>
                <Text style={styles.statLabel}>Mi Lista</Text>
              </TouchableOpacity>

              <View style={styles.statCard}>
                <LinearGradient colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Ionicons name="heart" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.statNumber, { color: colors.primary }]}>{totalMatches}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>

              <View style={styles.statCard}>
                <LinearGradient colors={['rgba(6, 182, 212, 0.15)', 'rgba(6, 182, 212, 0.05)']} style={StyleSheet.absoluteFill} />
                <View style={[styles.statIconBg, { backgroundColor: 'rgba(6, 182, 212, 0.2)' }]}>
                  <Ionicons name="people" size={18} color={colors.secondary} />
                </View>
                <Text style={[styles.statNumber, { color: colors.secondary }]}>{roomCount}</Text>
                <Text style={styles.statLabel}>Salas</Text>
              </View>
            </View>

            {/* Settings Section */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconBg}>
                <Ionicons name="settings" size={14} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Configuración</Text>
            </View>

            <View style={styles.settingsSection}>
              <SettingsItem icon="person-outline" title="Configuración de Cuenta" color={colors.primary} onPress={() => router.push('/account-settings')} />
              <SettingsItem icon="notifications-outline" title="Notificaciones" color={colors.secondary} onPress={() => {}} />
              <SettingsItem icon="shield-outline" title="Privacidad" color={colors.primary} onPress={() => {}} />
              <SettingsItem icon="color-palette-outline" title="Apariencia" color={colors.accent} onPress={() => {}} />
              <SettingsItem icon="help-circle-outline" title="Ayuda" color={colors.secondary} onPress={() => {}} isLast />
            </View>

            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
            </TouchableOpacity>

            {/* Version */}
            <Text style={styles.versionText}>Trinity v1.0.0</Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SettingsItem({ icon, title, color, onPress, isLast = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; color: string; onPress: () => void; isLast?: boolean }) {
  return (
    <TouchableOpacity style={[styles.settingsItem, !isLast && styles.settingsItemBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.settingsItemIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.settingsItemText}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  glowPurple: { position: 'absolute', top: 80, left: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139, 92, 246, 0.12)' },
  glowCyan: { position: 'absolute', top: 250, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(6, 182, 212, 0.1)' },
  glowRed: { position: 'absolute', bottom: 200, left: 50, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(239, 68, 68, 0.08)' },
  safeArea: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 120 },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  // Profile Card
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, overflow: 'hidden' },
  avatarContainer: { position: 'relative', marginRight: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  onlineBadge: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success, borderWidth: 3, borderColor: colors.surface },
  profileInfo: { flex: 1 },
  userName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  userEmail: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm },
  editButton: { alignSelf: 'flex-start', borderRadius: borderRadius.full, overflow: 'hidden' },
  editButtonGradient: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full },
  editButtonText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },
  // Stats
  statsContainer: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  statIconBg: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xs },
  statNumber: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionIconBg: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.15)', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  // Settings
  settingsSection: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, overflow: 'hidden' },
  settingsItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  settingsItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  settingsItemIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  settingsItemText: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  // Logout
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: borderRadius.lg, paddingVertical: spacing.md, gap: spacing.sm, marginBottom: spacing.lg },
  logoutButtonText: { fontSize: fontSize.md, color: colors.error, fontWeight: '600' },
  // Version
  versionText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
