import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '../../src/components/Logo';
import TriniChat from '../../src/components/TriniChat';
import { MediaItem } from '../../src/services/mediaService';
import { borderRadius, colors, fontSize, shadows, spacing } from '../../src/utils/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.md) / 2;

// TMDB API - Llamadas directas para cargar TODO el contenido
const TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

type FilterType = 'Todo' | 'Películas' | 'Series';

export default function ExploreScreen() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('Todo');
  const [totalResults, setTotalResults] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [triniChatVisible, setTriniChatVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const filters: FilterType[] = ['Todo', 'Películas', 'Series'];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadContent = useCallback(async (filter: FilterType, query?: string) => {
    try {
      setLoading(true);
      
      let allMedia: MediaItem[] = [];
      
      if (query && query.trim().length > 0) {
        // BÚSQUEDA: Buscar en TMDB directamente
        console.log(`🔍 Buscando "${query}" en TMDB...`);
        
        const searchPromises = [];
        
        // Buscar películas
        if (filter === 'Todo' || filter === 'Películas') {
          for (let page = 1; page <= 5; page++) {
            searchPromises.push(
              fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}&page=${page}`)
                .then(r => r.json())
                .then(data => ({ type: 'movie', results: data.results || [] }))
                .catch(() => ({ type: 'movie', results: [] }))
            );
          }
        }
        
        // Buscar series
        if (filter === 'Todo' || filter === 'Series') {
          for (let page = 1; page <= 5; page++) {
            searchPromises.push(
              fetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}&page=${page}`)
                .then(r => r.json())
                .then(data => ({ type: 'tv', results: data.results || [] }))
                .catch(() => ({ type: 'tv', results: [] }))
            );
          }
        }
        
        const searchResults = await Promise.all(searchPromises);
        
        searchResults.forEach(({ type, results }) => {
          results.forEach((item: any) => {
            allMedia.push(transformTMDBItem(item, type as 'movie' | 'tv'));
          });
        });
        
      } else {
        // EXPLORAR: Cargar contenido popular
        console.log('🎬 Cargando contenido popular de TMDB...');
        
        const loadPromises = [];
        
        // Cargar películas populares (20 páginas = 400 películas)
        if (filter === 'Todo' || filter === 'Películas') {
          for (let page = 1; page <= 20; page++) {
            loadPromises.push(
              fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=es-ES&page=${page}`)
                .then(r => r.json())
                .then(data => ({ type: 'movie', results: data.results || [] }))
                .catch(() => ({ type: 'movie', results: [] }))
            );
          }
        }
        
        // Cargar series populares (20 páginas = 400 series)
        if (filter === 'Todo' || filter === 'Series') {
          for (let page = 1; page <= 20; page++) {
            loadPromises.push(
              fetch(`${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=es-ES&page=${page}`)
                .then(r => r.json())
                .then(data => ({ type: 'tv', results: data.results || [] }))
                .catch(() => ({ type: 'tv', results: [] }))
            );
          }
        }
        
        const loadResults = await Promise.all(loadPromises);
        
        loadResults.forEach(({ type, results }) => {
          results.forEach((item: any) => {
            allMedia.push(transformTMDBItem(item, type as 'movie' | 'tv'));
          });
        });
      }
      
      // Eliminar duplicados
      const uniqueMedia = allMedia.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      );
      
      console.log(`✅ Total cargado: ${uniqueMedia.length} items`);
      
      setMedia(uniqueMedia);
      setTotalResults(uniqueMedia.length);
      setHasMore(false);
      
    } catch (error) {
      console.error('❌ Error:', error);
      setMedia([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Transformar item de TMDB a MediaItem
  const transformTMDBItem = (item: any, type: 'movie' | 'tv'): MediaItem => {
    const releaseDate = item.release_date || item.first_air_date || '';
    return {
      id: `${type}-${item.id}`,
      tmdbId: item.id,
      title: item.title || item.name || 'Sin título',
      originalTitle: item.original_title || item.original_name || '',
      overview: item.overview || '',
      posterPath: item.poster_path ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}` : null,
      backdropPath: item.backdrop_path ? `${TMDB_IMAGE_BASE}/w780${item.backdrop_path}` : null,
      releaseDate,
      year: releaseDate ? releaseDate.split('-')[0] : '',
      rating: Math.round((item.vote_average || 0) * 10) / 10,
      voteCount: item.vote_count || 0,
      genres: [],
      mediaType: type,
    };
  };

  useEffect(() => { 
    loadContent(activeFilter, searchQuery); 
  }, [activeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadContent(activeFilter, searchQuery || undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContent(activeFilter, searchQuery);
    setRefreshing(false);
  };

  // Callback cuando Trini recomienda géneros
  const handleTriniGenres = (genres: string[]) => {
    console.log('🎬 Trini recomienda géneros:', genres);
    // Aquí podrías filtrar el contenido por los géneros recomendados
  };

  return (
    <View style={styles.container}>
      {/* Círculos decorativos */}
      <View style={styles.glowPurple} />
      <View style={styles.glowCyan} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Explorar</Text>
                <Text style={styles.subtitle}>Descubre contenido nuevo</Text>
              </View>
              <Logo size="small" />
            </View>

            {/* Search Bar */}
            <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
              <Ionicons name="search" size={20} color={searchFocused ? colors.primary : colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar películas, series..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filters */}
            <View style={styles.filtersContainer}>
              {filters.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  style={styles.filterWrapper}
                >
                  {activeFilter === filter ? (
                    <LinearGradient colors={[colors.primary, '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.filterTabActive}>
                      <Text style={styles.filterTabTextActive}>{filter}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.filterTab}>
                      <Text style={styles.filterTabText}>{filter}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Results Count */}
            <View style={styles.resultsHeader}>
              <Ionicons name="sparkles" size={16} color={colors.secondary} />
              <Text style={styles.resultsText}>
                {loading ? 'Buscando...' : `${totalResults.toLocaleString()} resultados`}
              </Text>
            </View>

            {/* Loading */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <>
                {/* Media Grid */}
                <View style={styles.mediaGrid}>
                  {media.map((item, index) => (
                    <MediaCard key={item.id} item={item} index={index} />
                  ))}
                </View>

                {/* Loading More Indicator */}
                {loadingMore && (
                  <View style={styles.loadingMoreContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingMoreText}>Cargando más películas...</Text>
                  </View>
                )}

                {/* End of Results */}
                {!hasMore && media.length > 0 && (
                  <View style={styles.endOfResultsContainer}>
                    <Text style={styles.endOfResultsText}>Has visto todas las películas disponibles</Text>
                  </View>
                )}
              </>
            )}

            {/* Empty State */}
            {!loading && media.length === 0 && (
              <View style={styles.emptyState}>
                <LinearGradient colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']} style={styles.emptyIconBg}>
                  <Ionicons name="film-outline" size={48} color={colors.primary} />
                </LinearGradient>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Text style={styles.emptySubtext}>Intenta con otra búsqueda</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* FAB AI - Trini */}
        <TouchableOpacity style={styles.fab} onPress={() => setTriniChatVisible(true)}>
          <LinearGradient colors={[colors.secondary, '#3B82F6']} style={styles.fabGradient}>
            <Ionicons name="sparkles" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Trini Chat Modal */}
        <TriniChat
          visible={triniChatVisible}
          onClose={() => setTriniChatVisible(false)}
          onGenresSelected={handleTriniGenres}
        />
      </SafeAreaView>
    </View>
  );
}

function MediaCard({ item, index }: { item: MediaItem; index: number }) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true, delay: index * 50 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <TouchableOpacity style={styles.mediaCard} activeOpacity={0.8} onPress={() => router.push(`/media/${item.id}`)}>
        <View style={styles.mediaImageContainer}>
          {item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={styles.mediaImage} />
          ) : (
            <View style={[styles.mediaImage, styles.noImage]}>
              <Ionicons name="image-outline" size={32} color={colors.textMuted} />
            </View>
          )}

          {/* Overlay gradient */}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.imageOverlay} />

          {/* Rating Badge */}
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FFD700" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>

          {/* Media Type Badge */}
          <View style={[styles.typeBadge, { backgroundColor: item.mediaType === 'movie' ? colors.accent : colors.secondary }]}>
            <Ionicons name={item.mediaType === 'movie' ? 'film' : 'tv'} size={10} color="#fff" />
          </View>
        </View>

        <Text style={styles.mediaTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.mediaYear}>{item.year}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  glowPurple: { position: 'absolute', top: 100, left: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139, 92, 246, 0.12)' },
  glowCyan: { position: 'absolute', bottom: 200, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(6, 182, 212, 0.1)' },
  safeArea: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 120 },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, height: 50, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  searchContainerFocused: { borderColor: colors.primary, backgroundColor: colors.surfaceElevated },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: fontSize.md },
  clearButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  // Filters
  filtersContainer: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterWrapper: { borderRadius: borderRadius.full, overflow: 'hidden' },
  filterTab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border },
  filterTabActive: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  filterTabText: { fontSize: fontSize.sm, color: colors.textMuted },
  filterTabTextActive: { fontSize: fontSize.sm, color: '#FFF', fontWeight: '600' },
  // Results
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  resultsText: { fontSize: fontSize.sm, color: colors.textMuted },
  // Loading
  loadingContainer: { paddingVertical: spacing.xxl, alignItems: 'center' },
  loadingMoreContainer: { paddingVertical: spacing.lg, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  loadingMoreText: { fontSize: fontSize.sm, color: colors.textMuted },
  endOfResultsContainer: { paddingVertical: spacing.lg, alignItems: 'center' },
  endOfResultsText: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  // Grid
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  mediaCard: { width: CARD_WIDTH, marginBottom: spacing.sm },
  mediaImageContainer: { width: '100%', height: CARD_WIDTH * 1.4, borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.sm, position: 'relative', backgroundColor: colors.surface },
  mediaImage: { width: '100%', height: '100%' },
  noImage: { justifyContent: 'center', alignItems: 'center' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  ratingBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0, 0, 0, 0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: borderRadius.full },
  ratingText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  typeBadge: { position: 'absolute', bottom: spacing.sm, left: spacing.sm, padding: 5, borderRadius: borderRadius.sm },
  mediaTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  mediaYear: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  emptySubtext: { fontSize: fontSize.md, color: colors.textMuted },
  // FAB
  fab: { position: 'absolute', bottom: 90, right: spacing.lg, borderRadius: 28, overflow: 'hidden', ...shadows.glowCyan },
  fabGradient: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
});
