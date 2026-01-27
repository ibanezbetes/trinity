import { Injectable, Logger } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { MediaService } from '../media/media.service';
import { InteractionService } from '../interaction/interaction.service';
import { MediaItem } from '../../domain/entities/media.entity';
import { Vote, VoteType } from '../../domain/entities/interaction.entity';

export interface PreferencePattern {
  genres: { [genre: string]: number };
  averageRating: number;
  popularityRange: { min: number; max: number };
  releaseYearRange: { min: number; max: number };
  commonKeywords: string[];
}

export interface SemanticSimilarity {
  mediaId: string;
  similarityScore: number;
  matchingFactors: string[];
}

export interface ContentInjectionResult {
  injectedContent: MediaItem[];
  analysisMetadata: {
    patternsFound: PreferencePattern;
    totalPositiveVotes: number;
    injectionReason: string;
  };
}

@Injectable()
export class SemanticAnalysisService {
  private readonly logger = new Logger(SemanticAnalysisService.name);

  constructor(
    private multiTableService: MultiTableService,
    private mediaService: MediaService,
    private interactionService: InteractionService,
  ) {}

  /**
   * Analizar patrones de preferencias desde votos positivos
   * Requisito 5.1: Analizar votos positivos parciales para identificar patrones
   */
  async analyzePreferencePatterns(roomId: string): Promise<PreferencePattern> {
    try {
      this.logger.log(`🔍 Analyzing preference patterns for room ${roomId}`);

      // Obtener todos los votos positivos de la sala
      const positiveVotes = await this.getPositiveVotesForRoom(roomId);

      if (positiveVotes.length === 0) {
        return this.getDefaultPattern();
      }

      // Obtener detalles de contenido para cada voto positivo
      const likedContent = await this.getContentDetailsForVotes(positiveVotes);

      // Analizar patrones
      const patterns = this.extractPatterns(likedContent);

      this.logger.log(
        `📊 Found patterns: ${JSON.stringify(patterns, null, 2)}`,
      );
      return patterns;
    } catch (error) {
      this.logger.error(
        `Error analyzing preference patterns: ${error.message}`,
      );
      return this.getDefaultPattern();
    }
  }

  /**
   * Calcular similitud semántica entre contenido
   * Requisito 5.3: Usar vectores de metadatos para calcular similitud
   */
  async calculateSemanticSimilarity(
    targetContent: MediaItem,
    candidateContent: MediaItem[],
  ): Promise<SemanticSimilarity[]> {
    const similarities: SemanticSimilarity[] = [];

    for (const candidate of candidateContent) {
      const similarity = this.computeSimilarityScore(targetContent, candidate);

      if (similarity.similarityScore > 0.3) {
        // Umbral mínimo de similitud
        similarities.push(similarity);
      }
    }

    // Ordenar por puntuación de similitud descendente
    return similarities.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  /**
   * Inyectar contenido semánticamente similar
   * Requisito 5.2: Inyectar elementos multimedia semánticamente similares
   */
  async injectSemanticContent(
    roomId: string,
    maxInjections: number = 10,
  ): Promise<ContentInjectionResult> {
    try {
      this.logger.log(`🎯 Injecting semantic content for room ${roomId}`);

      // Verificar si se debe inyectar contenido
      const shouldInject = await this.shouldInjectContent(roomId);

      if (!shouldInject) {
        const patterns = await this.analyzePreferencePatterns(roomId);
        return {
          injectedContent: [],
          analysisMetadata: {
            patternsFound: patterns,
            totalPositiveVotes: await this.countPositiveVotes(roomId),
            injectionReason:
              'Room does not meet injection criteria (sufficient recent matches or insufficient voting data)',
          },
        };
      }

      // Analizar patrones de preferencias
      const patterns = await this.analyzePreferencePatterns(roomId);

      // Buscar contenido candidato basado en patrones
      const candidateContent = await this.findCandidateContent(patterns);

      // Identificar contenido puente (Requisito 5.4)
      const bridgeContent = await this.identifyBridgeContent(
        roomId,
        candidateContent,
      );

      // Seleccionar los mejores candidatos
      const selectedContent = bridgeContent.slice(0, maxInjections);

      // Actualizar listas desordenadas (Requisito 5.5)
      await this.updateShuffledLists(roomId, selectedContent);

      const result: ContentInjectionResult = {
        injectedContent: selectedContent,
        analysisMetadata: {
          patternsFound: patterns,
          totalPositiveVotes: await this.countPositiveVotes(roomId),
          injectionReason:
            'Semantic analysis based on positive voting patterns',
        },
      };

      this.logger.log(
        `✅ Injected ${selectedContent.length} semantic content items`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error injecting semantic content: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si una sala necesita inyección de contenido
   */
  async shouldInjectContent(roomId: string): Promise<boolean> {
    try {
      // Obtener estadísticas de matches recientes
      const recentMatches = await this.getRecentMatches(roomId, 7); // Últimos 7 días
      const totalVotes = await this.countTotalVotes(roomId);

      // Criterios para inyección:
      // 1. Pocos matches recientes (< 2 en 7 días)
      // 2. Suficientes votos para análisis (> 20)
      // 3. Ratio de matches bajo (< 5%)

      const shouldInject =
        recentMatches.length < 2 &&
        totalVotes > 20 &&
        recentMatches.length / totalVotes < 0.05;

      this.logger.log(
        `📈 Room ${roomId} injection analysis: matches=${recentMatches.length}, votes=${totalVotes}, shouldInject=${shouldInject}`,
      );

      return shouldInject;
    } catch (error) {
      this.logger.error(`Error checking injection criteria: ${error.message}`);
      return false;
    }
  }

  /**
   * Métodos privados de análisis
   */
  private async getPositiveVotesForRoom(roomId: string): Promise<Vote[]> {
    // Implementar consulta a base de datos para obtener votos positivos
    // Por ahora, simulamos con datos de ejemplo
    return [];
  }

  private async getContentDetailsForVotes(votes: Vote[]): Promise<MediaItem[]> {
    const contentDetails: MediaItem[] = [];

    for (const vote of votes) {
      try {
        const content = await this.mediaService.getMovieDetails(vote.mediaId);
        if (content) {
          contentDetails.push(content);
        }
      } catch (error) {
        this.logger.warn(`Could not get details for media ${vote.mediaId}`);
      }
    }

    return contentDetails;
  }

  private extractPatterns(content: MediaItem[]): PreferencePattern {
    if (content.length === 0) {
      return this.getDefaultPattern();
    }

    // Analizar géneros
    const genreCounts: { [genre: string]: number } = {};
    let totalRating = 0;
    let minPopularity = Infinity;
    let maxPopularity = -Infinity;
    let minYear = Infinity;
    let maxYear = -Infinity;

    for (const item of content) {
      // Contar géneros
      for (const genre of item.genres) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      }

      // Acumular ratings
      totalRating += item.voteAverage;

      // Rangos de popularidad
      minPopularity = Math.min(minPopularity, item.popularity);
      maxPopularity = Math.max(maxPopularity, item.popularity);

      // Rangos de año
      const year = new Date(item.releaseDate).getFullYear();
      minYear = Math.min(minYear, year);
      maxYear = Math.max(maxYear, year);
    }

    return {
      genres: genreCounts,
      averageRating: totalRating / content.length,
      popularityRange: { min: minPopularity, max: maxPopularity },
      releaseYearRange: { min: minYear, max: maxYear },
      commonKeywords: this.extractCommonKeywords(content),
    };
  }

  private extractCommonKeywords(content: MediaItem[]): string[] {
    // Extraer palabras clave comunes de títulos y descripciones
    const wordCounts: { [word: string]: number } = {};

    for (const item of content) {
      const words = [
        ...item.title.toLowerCase().split(/\s+/),
        ...item.overview.toLowerCase().split(/\s+/),
      ];

      for (const word of words) {
        if (word.length > 3) {
          // Filtrar palabras muy cortas
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
    }

    // Retornar las 10 palabras más comunes
    return Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private computeSimilarityScore(
    target: MediaItem,
    candidate: MediaItem,
  ): SemanticSimilarity {
    let score = 0;
    const matchingFactors: string[] = [];

    // Similitud de géneros (peso: 40%)
    const genreOverlap = this.calculateGenreOverlap(
      target.genres,
      candidate.genres,
    );
    score += genreOverlap * 0.4;
    if (genreOverlap > 0.5) {
      matchingFactors.push(
        `Genre similarity: ${(genreOverlap * 100).toFixed(1)}%`,
      );
    }

    // Similitud de rating (peso: 20%)
    const ratingDiff = Math.abs(target.voteAverage - candidate.voteAverage);
    const ratingSimilarity = Math.max(0, 1 - ratingDiff / 10);
    score += ratingSimilarity * 0.2;
    if (ratingSimilarity > 0.7) {
      matchingFactors.push(
        `Rating similarity: ${(ratingSimilarity * 100).toFixed(1)}%`,
      );
    }

    // Similitud de popularidad (peso: 15%)
    const popularityRatio =
      Math.min(target.popularity, candidate.popularity) /
      Math.max(target.popularity, candidate.popularity);
    score += popularityRatio * 0.15;

    // Similitud de año de lanzamiento (peso: 15%)
    const targetYear = new Date(target.releaseDate).getFullYear();
    const candidateYear = new Date(candidate.releaseDate).getFullYear();
    const yearDiff = Math.abs(targetYear - candidateYear);
    const yearSimilarity = Math.max(0, 1 - yearDiff / 20); // 20 años = 0 similitud
    score += yearSimilarity * 0.15;

    // Similitud de texto (peso: 10%)
    const textSimilarity = this.calculateTextSimilarity(
      target.overview,
      candidate.overview,
    );
    score += textSimilarity * 0.1;

    return {
      mediaId: candidate.tmdbId,
      similarityScore: Math.min(1, score), // Normalizar a [0,1]
      matchingFactors,
    };
  }

  private calculateGenreOverlap(genres1: string[], genres2: string[]): number {
    if (genres1.length === 0 || genres2.length === 0) return 0;

    const set1 = new Set(genres1);
    const set2 = new Set(genres2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size; // Jaccard similarity
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Similitud simple basada en palabras comunes
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async findCandidateContent(
    patterns: PreferencePattern,
  ): Promise<MediaItem[]> {
    // Buscar contenido basado en los patrones identificados
    const topGenres = Object.entries(patterns.genres)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([genre]) => genre);

    // Usar MediaService para buscar contenido similar
    const candidates: MediaItem[] = [];

    for (const genre of topGenres) {
      try {
        const genreContent = await this.mediaService.fetchMovies({
          genres: [genre],
          minRating: Math.max(6, patterns.averageRating - 1),
          releaseYearFrom: patterns.releaseYearRange.min,
          releaseYearTo: patterns.releaseYearRange.max,
        });

        candidates.push(...genreContent.slice(0, 20)); // Limitar por género
      } catch (error) {
        this.logger.warn(
          `Error fetching content for genre ${genre}: ${error.message}`,
        );
      }
    }

    return candidates;
  }

  private async identifyBridgeContent(
    roomId: string,
    candidates: MediaItem[],
  ): Promise<MediaItem[]> {
    // Identificar contenido que actúe como puente entre gustos divergentes
    // Requisito 5.4: Priorizar contenido puente

    // Por ahora, usar un algoritmo simple que prioriza contenido con:
    // 1. Múltiples géneros (más probable que conecte gustos diversos)
    // 2. Ratings altos (más probable que guste a todos)
    // 3. Popularidad moderada (no demasiado mainstream ni nicho)

    const bridgeContent = candidates
      .filter((item) => item.genres.length >= 2) // Múltiples géneros
      .filter((item) => item.voteAverage >= 7.0) // Rating alto
      .filter((item) => item.popularity >= 50 && item.popularity <= 500) // Popularidad moderada
      .sort((a, b) => {
        // Priorizar por diversidad de géneros y rating
        const scoreA = a.genres.length * a.voteAverage;
        const scoreB = b.genres.length * b.voteAverage;
        return scoreB - scoreA;
      });

    // Eliminar duplicados basándose en tmdbId
    const uniqueBridgeContent = bridgeContent.filter(
      (item, index, array) =>
        array.findIndex((other) => other.tmdbId === item.tmdbId) === index,
    );

    return uniqueBridgeContent;
  }

  private async updateShuffledLists(
    roomId: string,
    newContent: MediaItem[],
  ): Promise<void> {
    // Requisito 5.5: Actualizar listas desordenadas manteniendo aleatorización
    try {
      // Obtener miembros de la sala
      const members = await this.getRoomMembers(roomId);

      for (const member of members) {
        // Para cada miembro, inyectar el contenido en posiciones aleatorias
        await this.injectContentIntoMemberQueue(
          member.userId,
          roomId,
          newContent,
        );
      }

      this.logger.log(
        `📝 Updated shuffled lists for ${members.length} members`,
      );
    } catch (error) {
      this.logger.error(`Error updating shuffled lists: ${error.message}`);
    }
  }

  private async injectContentIntoMemberQueue(
    userId: string,
    roomId: string,
    content: MediaItem[],
  ): Promise<void> {
    // Inyectar contenido en posiciones aleatorias de la cola del usuario
    // Mantener el principio de aleatorización

    for (const item of content) {
      // Generar posición aleatoria en la cola
      const randomPosition = Math.floor(Math.random() * 50) + 10; // Entre posición 10-60

      // Aquí se implementaría la lógica para insertar en la cola del usuario
      // Por ahora, solo loggeamos la acción
      this.logger.debug(
        `Injecting ${item.title} at position ${randomPosition} for user ${userId}`,
      );
    }
  }

  private getDefaultPattern(): PreferencePattern {
    return {
      genres: { Action: 1, Comedy: 1, Drama: 1 },
      averageRating: 7.0,
      popularityRange: { min: 50, max: 500 },
      releaseYearRange: { min: 2015, max: 2024 },
      commonKeywords: [],
    };
  }

  private async getRoomMembers(roomId: string): Promise<{ userId: string }[]> {
    // Implementar consulta para obtener miembros de la sala
    return [];
  }

  private async getRecentMatches(roomId: string, days: number): Promise<any[]> {
    // Implementar consulta para obtener matches recientes
    return [];
  }

  private async countPositiveVotes(roomId: string): Promise<number> {
    // Implementar conteo de votos positivos
    return 0;
  }

  private async countTotalVotes(roomId: string): Promise<number> {
    // Implementar conteo total de votos
    return 0;
  }
}
