import { Controller, Post, Body, Logger, Inject } from '@nestjs/common';
import { ALIAService, AIRecommendation } from './alia.service';
import { MediaService } from '../media/media.service';

interface TriniResponse {
  chatResponse: string;
  recommendedGenres: string[];
  recommendedMovies?: Array<{
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
  }>;
}

@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly aliaService: ALIAService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * POST /ai/chat-recommendations
   * Obtener recomendaciones de Trini basadas en el estado emocional del usuario
   */
  @Post('chat-recommendations')
  async getChatRecommendations(
    @Body() body: { userText: string },
  ): Promise<TriniResponse> {
    const userText = body.userText;
    this.logger.log(`🤖 Trini request: "${userText}"`);

    try {
      const recommendation: AIRecommendation =
        await this.aliaService.getChatRecommendations({
          userText,
        });

      // Buscar películas específicas basadas en los géneros recomendados
      let recommendedMovies: Array<{
        id: number;
        title: string;
        overview: string;
        poster_path: string;
        vote_average: number;
        release_date: string;
      }> = [];
      try {
        // Mapear géneros a IDs de TMDB
        const genreMap: { [key: string]: number } = {
          'terror': 27,
          'thriller': 53,
          'misterio': 9648,
          'drama': 18,
          'comedia': 35,
          'romance': 10749,
          'acción': 28,
          'aventura': 12,
          'ciencia ficción': 878,
          'fantasía': 14,
          'animación': 16,
          'documental': 99,
          'crimen': 80,
          'familia': 10751,
          'música': 10402,
          'western': 37,
          'guerra': 10752,
          'historia': 36,
        };

        // Tomar el primer género y buscar películas
        const firstGenre = recommendation.recommendations[0]?.toLowerCase();
        const genreId = genreMap[firstGenre];
        
        if (genreId) {
          const movies = await this.mediaService.fetchMovies({
            genres: [genreId.toString()],
            releaseYearFrom: 2015,
            releaseYearTo: new Date().getFullYear(),
            minRating: 6.0,
          });
          
          // Tomar las primeras 3 películas
          recommendedMovies = movies.slice(0, 3).map(movie => ({
            id: movie.tmdbId ? parseInt(movie.tmdbId) : 0,
            title: movie.title,
            overview: movie.overview,
            poster_path: movie.posterPath || '',
            vote_average: movie.voteAverage || 0,
            release_date: movie.releaseDate || '',
          }));
        }
      } catch (movieError) {
        this.logger.warn(`Could not fetch movies: ${movieError.message}`);
      }

      // Mejorar la respuesta de chat para incluir películas específicas
      let enhancedChatResponse = recommendation.reasoning;
      if (recommendedMovies.length > 0) {
        const movieTitles = recommendedMovies.map(m => m.title).join(', ');
        enhancedChatResponse += ` Por ejemplo, te recomiendo: ${movieTitles}.`;
      }

      const triniResponse: TriniResponse = {
        chatResponse: enhancedChatResponse,
        recommendedGenres: recommendation.recommendations.map((g) =>
          g.toLowerCase(),
        ),
        recommendedMovies,
      };

      this.logger.log(
        `✅ Trini response: "${triniResponse.chatResponse.substring(0, 50)}..." with ${recommendedMovies.length} movies`,
      );
      return triniResponse;
    } catch (error) {
      this.logger.error(`❌ Error in Trini: ${error.message}`);
      return this.getFallbackResponse(userText);
    }
  }

  /**
   * Construir respuesta empática de Trini basada en el análisis de ALIA
   */
  private buildTriniChatResponse(recommendation: AIRecommendation): string {
    const { emotionalState, approach, recommendations } = recommendation;

    const responses: Record<string, string> = {
      sad: `Entiendo cómo te sientes, y está bien sentirse así a veces. Te propongo algo que te ayude a conectar con esas emociones o a desconectar un poco. ¿Qué prefieres?`,
      stressed: `Vaya, parece que has tenido días intensos. Lo primero: respira. Déjame ayudarte a desconectar con algo ligero y entretenido.`,
      angry: `Entiendo esa frustración, es válido sentirse así. Te propongo algo con acción que te ayude a liberar tensión.`,
      lonely: `Oye, que sepas que no estás solo/a en esto. Te propongo películas con historias de conexión humana.`,
      anxious: `Tranquilo/a, estoy aquí para ayudarte. Te recomiendo algo visualmente bonito y reconfortante, sin sobresaltos.`,
      happy: `¡Qué bien que estés de buen humor! Vamos a mantener esa energía con algo divertido y emocionante.`,
      depressed: `Entiendo que estás pasando por un momento difícil. Estoy aquí para ti. Te propongo algo que pueda ayudarte a procesar o a encontrar un poco de luz.`,
      neutral: `Cuéntame más sobre cómo te sientes o qué tipo de experiencia buscas. Mientras tanto, te propongo una selección variada.`,
    };

    const baseResponse =
      responses[emotionalState] || responses.neutral;
    const genreList = recommendations.slice(0, 3).join(', ');

    return `${baseResponse} Te recomiendo: ${genreList}.`;
  }

  /**
   * Respuesta de fallback cuando el servicio falla
   */
  private getFallbackResponse(userText: string): TriniResponse {
    const text = userText.toLowerCase();

    if (
      text.includes('triste') ||
      text.includes('mal') ||
      text.includes('deprimido')
    ) {
      return {
        chatResponse:
          'Entiendo cómo te sientes. A veces un buen drama nos ayuda a conectar con nuestras emociones, o una comedia ligera para desconectar.',
        recommendedGenres: ['drama', 'comedia', 'animación'],
      };
    }

    if (
      text.includes('estresado') ||
      text.includes('agobiado') ||
      text.includes('cansado')
    ) {
      return {
        chatResponse:
          'Parece que necesitas desconectar un poco. Te recomiendo algo ligero y entretenido.',
        recommendedGenres: ['comedia', 'animación', 'aventura'],
      };
    }

    if (text.includes('aburrido') || text.includes('nada que hacer')) {
      return {
        chatResponse:
          '¡Hora de sacudir ese aburrimiento! Tengo justo lo que necesitas.',
        recommendedGenres: ['acción', 'thriller', 'aventura'],
      };
    }

    if (
      text.includes('feliz') ||
      text.includes('bien') ||
      text.includes('celebrar')
    ) {
      return {
        chatResponse:
          '¡Qué bien que estés de buen humor! Vamos a mantener esa energía.',
        recommendedGenres: ['comedia', 'aventura', 'música'],
      };
    }

    return {
      chatResponse:
        'Cuéntame más sobre cómo te sientes. Mientras tanto, te propongo una selección variada que suele gustar a todo el mundo.',
      recommendedGenres: ['drama', 'comedia', 'aventura'],
    };
  }
}
