import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { mediaService, MediaItemDetails, CastMember, WatchProvider } from '../../src/services/mediaService';
import { userListService, UserListItem } from '../../src/services/userListService';

const { width, height } = Dimensions.get('window');

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [media, setMedia] = useState<MediaItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInList, setIsInList] = useState(false);

  useEffect(() => {
    loadMediaDetails();
  }, [id]);

  const loadMediaDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      // El id viene como "movie-123" o "tv-456"
      const [type, tmdbId] = id.split('-');
      
      let details: MediaItemDetails | null = null;
      if (type === 'movie') {
        details = await mediaService.getMovieDetails(parseInt(tmdbId));
      } else if (type === 'tv') {
        details = await mediaService.getTVDetails(parseInt(tmdbId));
      }

      setMedia(details);
      
      // Verificar si está en la lista del usuario
      if (details) {
        const inList = await userListService.isInList(id);
        setIsInList(inList);
      }
    } catch (error) {
      console.error('Error loading media details:', error);
    } finally {
      setLoading(false);
    }
  };

  const openTrailer = () => {
    if (media?.trailerKey) {
      Linking.openURL(`https://www.youtube.com/watch?v=${media.trailerKey}`);
    }
  };

  const toggleList = async () => {
    if (!media || !id) return;

    try {
      if (isInList) {
        // Remover de la lista
        await userListService.removeFromList(id);
        setIsInList(false);
      } else {
        // Añadir a la lista
        const listItem: UserListItem = {
          id,
          title: media.title,
          posterPath: media.posterPath,
          mediaType: media.mediaType,
          year: media.year,
          addedAt: new Date().toISOString(),
        };
        await userListService.addToList(listItem);
        setIsInList(true);
      }
    } catch (error) {
      console.error('Error toggling list:', error);
      // Revertir el estado en caso de error
      setIsInList(!isInList);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!media) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={styles.errorText}>No se pudo cargar el contenido</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Backdrop con gradiente */}
        <View style={styles.backdropContainer}>
          {media.backdropPath ? (
            <Image source={{ uri: media.backdropPath }} style={styles.backdrop} />
          ) : media.posterPath ? (
            <Image source={{ uri: media.posterPath }} style={styles.backdrop} />
          ) : (
            <View style={[styles.backdrop, styles.noBackdrop]} />
          )}
          <View style={styles.backdropGradient} />
          
          {/* Botón de volver */}
          <SafeAreaView style={styles.headerButtons}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={toggleList}>
              <Ionicons 
                name={isInList ? "bookmark" : "bookmark-outline"} 
                size={24} 
                color={isInList ? colors.primary : "#fff"} 
              />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Botón de trailer */}
          {media.trailerKey && (
            <TouchableOpacity style={styles.playButton} onPress={openTrailer}>
              <Ionicons name="play" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Contenido */}
        <View style={styles.content}>
          {/* Título y metadata */}
          <Text style={styles.title}>{media.title}</Text>
          
          {media.tagline && (
            <Text style={styles.tagline}>"{media.tagline}"</Text>
          )}

          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>{media.rating}</Text>
            </View>
            <Text style={styles.metaText}>{media.year}</Text>
            {media.runtime && (
              <Text style={styles.metaText}>{formatRuntime(media.runtime)}</Text>
            )}
            {media.numberOfSeasons && (
              <Text style={styles.metaText}>
                {media.numberOfSeasons} temporada{media.numberOfSeasons > 1 ? 's' : ''}
              </Text>
            )}
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>
                {media.mediaType === 'movie' ? 'Película' : 'Serie'}
              </Text>
            </View>
          </View>

          {/* Géneros */}
          <View style={styles.genresContainer}>
            {media.genres.map((genre, index) => (
              <View key={index} style={styles.genreChip}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>

          {/* Dónde ver - PROMINENTE */}
          {media.watchProviders.length > 0 && (
            <View style={styles.watchNowSection}>
              <Text style={styles.watchNowTitle}>Disponible en</Text>
              <View style={styles.watchNowProviders}>
                {media.watchProviders.filter(p => p.type === 'streaming').map((provider) => (
                  <View key={provider.id} style={styles.watchNowProvider}>
                    <Image source={{ uri: provider.logoPath }} style={styles.watchNowLogo} />
                    <Text style={styles.watchNowName}>{provider.name}</Text>
                  </View>
                ))}
              </View>
              {media.watchProviders.filter(p => p.type === 'rent' || p.type === 'buy').length > 0 && (
                <Text style={styles.watchNowSubtext}>
                  También disponible para alquilar o comprar
                </Text>
              )}
            </View>
          )}

          {/* Botones de acción */}
          <View style={styles.actionButtons}>
            {media.trailerKey && (
              <TouchableOpacity style={styles.primaryButton} onPress={openTrailer}>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Ver Trailer</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.secondaryButton, isInList && styles.secondaryButtonActive]} 
              onPress={toggleList}
            >
              <Ionicons 
                name={isInList ? "checkmark" : "add"} 
                size={20} 
                color={isInList ? colors.primary : colors.textPrimary} 
              />
              <Text style={[styles.secondaryButtonText, isInList && styles.secondaryButtonTextActive]}>
                {isInList ? 'En mi lista' : 'Mi lista'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sinopsis */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sinopsis</Text>
            <Text style={styles.overview}>
              {media.overview || 'No hay sinopsis disponible.'}
            </Text>
          </View>

          {/* Director/Creador */}
          {(media.director || media.creator) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {media.mediaType === 'movie' ? 'Director' : 'Creador'}
              </Text>
              <Text style={styles.directorText}>
                {media.director || media.creator}
              </Text>
            </View>
          )}

          {/* Dónde ver */}
          {media.watchProviders.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dónde ver</Text>
              <WatchProvidersSection providers={media.watchProviders} />
            </View>
          )}

          {/* Reparto */}
          {media.cast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reparto</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castContainer}
              >
                {media.cast.map((actor) => (
                  <CastCard key={actor.id} actor={actor} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Información adicional */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información</Text>
            <View style={styles.infoGrid}>
              <InfoItem label="Título original" value={media.originalTitle} />
              <InfoItem label="Fecha de estreno" value={formatDate(media.releaseDate)} />
              {media.numberOfEpisodes && (
                <InfoItem label="Episodios" value={media.numberOfEpisodes.toString()} />
              )}
              {media.budget && media.budget > 0 && (
                <InfoItem label="Presupuesto" value={formatCurrency(media.budget)} />
              )}
              {media.revenue && media.revenue > 0 && (
                <InfoItem label="Recaudación" value={formatCurrency(media.revenue)} />
              )}
              <InfoItem label="Votos" value={media.voteCount.toLocaleString()} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function WatchProvidersSection({ providers }: { providers: WatchProvider[] }) {
  const streaming = providers.filter(p => p.type === 'streaming');
  const rent = providers.filter(p => p.type === 'rent');
  const buy = providers.filter(p => p.type === 'buy');

  return (
    <View>
      {streaming.length > 0 && (
        <View style={styles.providerSection}>
          <Text style={styles.providerLabel}>Streaming</Text>
          <View style={styles.providersRow}>
            {streaming.map((provider) => (
              <ProviderLogo key={provider.id} provider={provider} />
            ))}
          </View>
        </View>
      )}
      {rent.length > 0 && (
        <View style={styles.providerSection}>
          <Text style={styles.providerLabel}>Alquilar</Text>
          <View style={styles.providersRow}>
            {rent.map((provider) => (
              <ProviderLogo key={provider.id} provider={provider} />
            ))}
          </View>
        </View>
      )}
      {buy.length > 0 && (
        <View style={styles.providerSection}>
          <Text style={styles.providerLabel}>Comprar</Text>
          <View style={styles.providersRow}>
            {buy.map((provider) => (
              <ProviderLogo key={provider.id} provider={provider} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function ProviderLogo({ provider }: { provider: WatchProvider }) {
  return (
    <View style={styles.providerItem}>
      <Image source={{ uri: provider.logoPath }} style={styles.providerLogo} />
      <Text style={styles.providerName} numberOfLines={1}>{provider.name}</Text>
    </View>
  );
}

function CastCard({ actor }: { actor: CastMember }) {
  return (
    <View style={styles.castCard}>
      {actor.profilePath ? (
        <Image source={{ uri: actor.profilePath }} style={styles.castImage} />
      ) : (
        <View style={[styles.castImage, styles.noCastImage]}>
          <Ionicons name="person" size={24} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.castName} numberOfLines={1}>{actor.name}</Text>
      <Text style={styles.castCharacter} numberOfLines={1}>{actor.character}</Text>
    </View>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// Helpers
function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Desconocido';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  backdropContainer: {
    height: height * 0.4,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  noBackdrop: {
    backgroundColor: colors.surface,
  },
  backdropGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'transparent',
    // Simular gradiente con múltiples capas
  },
  headerButtons: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -35,
    marginTop: -35,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.lg,
    marginTop: -spacing.xl,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  typeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  typeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#fff',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  genreChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  genreText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  watchNowSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  watchNowTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  watchNowProviders: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  watchNowProvider: {
    alignItems: 'center',
    minWidth: 70,
  },
  watchNowLogo: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    marginBottom: 4,
  },
  watchNowName: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '500',
  },
  watchNowSubtext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  secondaryButtonActive: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  secondaryButtonTextActive: {
    color: colors.primary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  overview: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  directorText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  providerSection: {
    marginBottom: spacing.md,
  },
  providerLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  providersRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  providerItem: {
    alignItems: 'center',
    width: 60,
  },
  providerLogo: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    marginBottom: 4,
  },
  providerName: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  castContainer: {
    gap: spacing.md,
  },
  castCard: {
    width: 100,
    alignItems: 'center',
  },
  castImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: spacing.xs,
  },
  noCastImage: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  castName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  castCharacter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  infoGrid: {
    gap: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});
