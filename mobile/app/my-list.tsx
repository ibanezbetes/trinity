import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/utils/theme';
import { userListService, UserListItem } from '../src/services/userListService';

const { width, height } = Dimensions.get('window');

// Posters para el fondo
const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w200/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w200/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w200/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w200/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  'https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
];

export default function MyListScreen() {
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(headerScale, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    // Animación continua del fondo
    Animated.loop(
      Animated.timing(posterScrollAnim, {
        toValue: 1,
        duration: 25000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadList();
    }, [])
  );

  const loadList = async () => {
    try {
      setLoading(true);
      const userList = await userListService.getUserList();
      setList(userList);
    } catch (error) {
      console.error('Error loading list:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFromList = async (item: UserListItem) => {
    Alert.alert(
      'Eliminar de Mi Lista',
      `¿Quieres eliminar "${item.title}" de tu lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await userListService.removeFromList(item.id);
              setList(prev => prev.filter(listItem => listItem.id !== item.id));
            } catch (error) {
              console.error('Error removing from list:', error);
              Alert.alert('Error', 'No se pudo eliminar el elemento de la lista');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const translateX = posterScrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.6],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0C', '#12101a', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Fondo de posters animado */}
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, i) => (
            <Image key={i} source={{ uri: poster }} style={styles.posterImage} blurRadius={3} />
          ))}
        </Animated.View>
        <LinearGradient
          colors={['rgba(10, 10, 12, 0.5)', 'rgba(10, 10, 12, 0.9)', colors.background]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      
      {/* Círculos decorativos */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />
      <View style={styles.decorativeCircle3} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.25)', 'rgba(6, 182, 212, 0.15)']}
              style={styles.backButtonGradient}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </LinearGradient>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="bookmark" size={20} color={colors.primary} />
              <Text style={styles.title}>Mi Lista</Text>
            </View>
            {!loading && list.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.headerCount}>{list.length} guardados</Text>
              </View>
            )}
          </View>
          <View style={styles.placeholder} />
        </Animated.View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingIconBg}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
            <Text style={styles.loadingText}>Cargando tu lista...</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.25)', 'rgba(6, 182, 212, 0.15)']}
              style={styles.emptyIconBg}
            >
              <Ionicons name="bookmark-outline" size={48} color={colors.primary} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>Tu lista está vacía</Text>
            <Text style={styles.emptySubtitle}>
              Añade películas y series que te interesen para verlas más tarde
            </Text>
            <TouchableOpacity 
              style={styles.exploreButtonWrapper}
              onPress={() => router.push('/explore')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.secondary, '#3B82F6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.exploreButton}
              >
                <Ionicons name="compass" size={18} color="#FFF" />
                <Text style={styles.exploreButtonText}>Explorar contenido</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollView} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {list.map((item, index) => {
                const colorIndex = index % 3;
                const gradientColors: readonly [string, string] = colorIndex === 0 
                  ? ['rgba(6, 182, 212, 0.12)', 'transparent'] as const
                  : colorIndex === 1 
                    ? ['rgba(139, 92, 246, 0.12)', 'transparent'] as const
                    : ['rgba(239, 68, 68, 0.1)', 'transparent'] as const;
                
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.listItem}
                    onPress={() => router.push(`/media/${item.id}`)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={gradientColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.listItemGradient}
                    />
                    
                    {item.posterPath ? (
                      <View style={styles.posterWrapper}>
                        <Image source={{ uri: item.posterPath }} style={styles.poster} />
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.3)']}
                          style={styles.posterOverlay}
                        />
                      </View>
                    ) : (
                      <View style={[styles.poster, styles.noPoster]}>
                        <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                      </View>
                    )}
                    
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={styles.itemMeta}>
                        <LinearGradient
                          colors={item.mediaType === 'movie' 
                            ? [colors.accent, '#EC4899'] 
                            : [colors.secondary, '#3B82F6']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.typeBadge}
                        >
                          <Ionicons 
                            name={item.mediaType === 'movie' ? 'film' : 'tv'} 
                            size={10} 
                            color="#FFF" 
                          />
                          <Text style={styles.typeText}>
                            {item.mediaType === 'movie' ? 'Película' : 'Serie'}
                          </Text>
                        </LinearGradient>
                        <Text style={styles.yearText}>{item.year}</Text>
                      </View>
                      <View style={styles.addedRow}>
                        <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.addedDate}>
                          {formatDate(item.addedAt)}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeFromList(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <LinearGradient
                        colors={['rgba(244, 63, 94, 0.2)', 'rgba(244, 63, 94, 0.1)']}
                        style={styles.removeButtonGradient}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </LinearGradient>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  
  // Fondo de posters
  posterBackground: {
    position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.25, overflow: 'hidden',
  },
  posterRow: { flexDirection: 'row', height: height * 0.22 },
  posterImage: { width: 90, height: height * 0.2, marginHorizontal: 4, borderRadius: 10, opacity: 0.5 },
  
  // Círculos decorativos
  decorativeCircle1: {
    position: 'absolute', top: -60, right: -60, width: 200, height: 200,
    borderRadius: 100, backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  decorativeCircle2: {
    position: 'absolute', bottom: 250, left: -80, width: 250, height: 250,
    borderRadius: 125, backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  decorativeCircle3: {
    position: 'absolute', bottom: 100, right: -50, width: 150, height: 150,
    borderRadius: 75, backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backButton: { borderRadius: 22, overflow: 'hidden' },
  backButtonGradient: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  countBadge: { 
    backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingHorizontal: spacing.sm, 
    paddingVertical: 2, borderRadius: borderRadius.full, marginTop: 4,
  },
  headerCount: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  placeholder: { width: 44 },
  
  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingIconBg: { 
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  loadingText: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.md },
  
  // Empty state
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconBg: {
    width: 110, height: 110, borderRadius: 55,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl, fontWeight: '700',
    color: colors.textPrimary, marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center',
    lineHeight: 22, marginBottom: spacing.xl,
  },
  exploreButtonWrapper: {
    borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glowCyan,
  },
  exploreButton: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm,
  },
  exploreButtonText: { fontSize: fontSize.md, fontWeight: '600', color: '#fff' },
  
  // List
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)', marginBottom: spacing.md,
    borderRadius: borderRadius.xl, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden', position: 'relative',
  },
  listItemGradient: { ...StyleSheet.absoluteFillObject },
  posterWrapper: { position: 'relative', borderRadius: borderRadius.md, overflow: 'hidden' },
  poster: {
    width: 70, height: 100, borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  posterOverlay: { ...StyleSheet.absoluteFillObject },
  noPoster: { justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1, marginLeft: spacing.md },
  itemTitle: {
    fontSize: fontSize.md, fontWeight: '600',
    color: colors.textPrimary, marginBottom: spacing.xs,
  },
  itemMeta: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: borderRadius.full, marginRight: spacing.sm,
  },
  typeText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  yearText: { fontSize: fontSize.sm, color: colors.textMuted },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedDate: { fontSize: fontSize.xs, color: colors.textMuted },
  removeButton: { borderRadius: 20, overflow: 'hidden', marginLeft: spacing.sm },
  removeButtonGradient: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
});
