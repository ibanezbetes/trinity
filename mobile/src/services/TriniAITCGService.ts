/**
 * Trini AI TCG Service
 * Servicio para integrar la generación de cartas AI en la app móvil Trinity
 */

export interface MovieCard {
  id: string;
  title: string;
  year: number;
  genre: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  flavor_text: string;
  metadata: {
    tmdb_id: number;
    popularity: number;
    vote_average: number;
    vote_count: number;
    poster_path: string;
    backdrop_path: string;
    overview: string;
    release_date: string;
  };
}

export interface CardPack {
  pack_id: string;
  timestamp: string;
  pack_type: string;
  cards: MovieCard[];
}

export interface GeneratePackRequest {
  pack_type?: 'standard' | 'premium' | 'deluxe';
  language?: 'es' | 'en';
  user_id?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error_code?: string;
  error_message?: string;
  timestamp: string;
  request_id: string;
}

class TriniAITCGService {
  private readonly baseURL = 'https://tywmiqa0i8.execute-api.eu-west-1.amazonaws.com/dev';
  
  /**
   * Generar un pack de cartas de películas
   */
  async generateCardPack(request: GeneratePackRequest = {}): Promise<CardPack> {
    try {
      const requestBody = {
        pack_type: request.pack_type || 'standard',
        language: request.language || 'es',
        user_id: request.user_id || 'anonymous'
      };

      const response = await fetch(`${this.baseURL}/generate-pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result: APIResponse<CardPack> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error_message || 'Error generando pack de cartas');
      }

      return result.data;
    } catch (error) {
      console.error('Error en generateCardPack:', error);
      throw error;
    }
  }

  /**
   * Verificar el estado de salud del servicio
   */
  async getHealthStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return await response.json();
    } catch (error) {
      console.error('Error en getHealthStatus:', error);
      throw error;
    }
  }

  /**
   * Obtener URL completa de poster de TMDB
   */
  getTMDBImageURL(posterPath: string, size: 'w200' | 'w300' | 'w500' | 'original' = 'w300'): string {
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }

  /**
   * Obtener color por rareza para UI
   */
  getRarityColor(rarity: MovieCard['rarity']): string {
    const colors = {
      'Common': '#9CA3AF',     // Gris
      'Rare': '#3B82F6',       // Azul
      'Epic': '#8B5CF6',       // Púrpura
      'Legendary': '#F59E0B'   // Dorado
    };
    return colors[rarity] || colors.Common;
  }

  /**
   * Obtener emoji por rareza
   */
  getRarityEmoji(rarity: MovieCard['rarity']): string {
    const emojis = {
      'Common': '⚪',
      'Rare': '🔵', 
      'Epic': '🟣',
      'Legendary': '🟡'
    };
    return emojis[rarity] || emojis.Common;
  }
}

export default new TriniAITCGService();