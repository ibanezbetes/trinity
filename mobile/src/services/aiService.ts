import { appSyncService } from './appSyncService';

export interface TriniResponse {
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

/**
 * Servicio de IA - Trini
 * Comunicación con el agente de recomendaciones cinematográficas usando AppSync GraphQL
 */
export const aiService = {
  /**
   * Obtener recomendaciones de Trini basadas en el estado emocional del usuario
   * Ahora usa AppSync GraphQL en lugar de REST API
   */
  async getChatRecommendations(userText: string): Promise<TriniResponse> {
    try {
      console.log('🤖 Getting AI recommendations via AppSync for:', userText);
      
      const result = await appSyncService.getAIRecommendations(userText);
      
      if (result.getAIRecommendations) {
        const aiResponse = result.getAIRecommendations;
        
        // Transformar respuesta de GraphQL al formato esperado
        const response: TriniResponse = {
          chatResponse: aiResponse.chatResponse || 'Hmm, no estoy seguro de qué recomendarte. ¿Puedes ser más específico?',
          recommendedGenres: aiResponse.recommendedGenres || [],
          recommendedMovies: aiResponse.recommendedMovies || [],
        };
        
        console.log('✅ AI recommendations received successfully');
        return response;
      }
      
      // Si no hay respuesta válida, usar fallback
      console.warn('⚠️ No valid AI response from GraphQL, using fallback');
      return getFallbackResponse(userText);
      
    } catch (error: any) {
      console.error('❌ Error getting AI recommendations via AppSync:', error);
      
      // Manejar errores específicos
      if (error.message?.includes('Circuit breaker is OPEN')) {
        console.warn('⚡ AI service circuit breaker is open, using enhanced fallback');
        return getEnhancedFallbackResponse(userText);
      }
      
      if (error.message?.includes('Service temporarily unavailable')) {
        console.warn('🔧 AI service temporarily unavailable, using fallback');
        return getFallbackResponse(userText);
      }
      
      // Para otros errores, usar fallback local
      return getFallbackResponse(userText);
    }
  },
};

/**
 * Respuesta de fallback mejorada cuando el Circuit Breaker está abierto
 */
function getEnhancedFallbackResponse(userText: string): TriniResponse {
  return {
    chatResponse: 'Disculpa, mi conexión con el servidor de recomendaciones está temporalmente interrumpida. Pero no te preocupes, puedo ayudarte con algunas sugerencias básicas. ¿Qué tipo de película te apetece ver?',
    recommendedGenres: ['comedia', 'drama', 'acción', 'aventura'],
    recommendedMovies: [
      {
        id: 550,
        title: 'El Club de la Pelea',
        overview: 'Un empleado de oficina insomne y un fabricante de jabón forman un club de lucha clandestino.',
        poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        vote_average: 8.4,
        release_date: '1999-10-15',
      },
      {
        id: 13,
        title: 'Forrest Gump',
        overview: 'Las presidencias de Kennedy y Johnson a través de la perspectiva de un hombre de Alabama.',
        poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
        vote_average: 8.5,
        release_date: '1994-06-23',
      },
    ],
  };
}

/**
 * Respuesta de fallback cuando el backend no está disponible
 */
function getFallbackResponse(userText: string): TriniResponse {
  const text = userText.toLowerCase();
  
  // Detección de emociones y preferencias
  if (text.includes('triste') || text.includes('mal') || text.includes('deprimido') || text.includes('bajón') || text.includes('fatal')) {
    return {
      chatResponse: 'Entiendo cómo te sientes. A veces un buen drama nos ayuda a conectar con nuestras emociones, o una comedia ligera para desconectar. ¿Qué prefieres?',
      recommendedGenres: ['drama', 'comedia', 'animación'],
    };
  }
  
  if (text.includes('estresado') || text.includes('agobiado') || text.includes('cansado') || text.includes('trabajo') || text.includes('agotado')) {
    return {
      chatResponse: 'Parece que necesitas desconectar un poco. Te recomiendo algo ligero y entretenido que te saque de la rutina.',
      recommendedGenres: ['comedia', 'animación', 'aventura'],
    };
  }
  
  if (text.includes('aburrido') || text.includes('nada que hacer') || text.includes('no sé qué ver')) {
    return {
      chatResponse: '¡Hora de sacudir ese aburrimiento! Tengo justo lo que necesitas: algo que te enganche desde el primer minuto.',
      recommendedGenres: ['acción', 'thriller', 'aventura'],
    };
  }
  
  if (text.includes('feliz') || text.includes('bien') || text.includes('celebrar') || text.includes('genial') || text.includes('contento')) {
    return {
      chatResponse: '¡Qué bien que estés de buen humor! Vamos a mantener esa energía con algo divertido.',
      recommendedGenres: ['comedia', 'aventura', 'musical'],
    };
  }

  if (text.includes('acción') || text.includes('pelea') || text.includes('explosiones') || text.includes('adrenalina')) {
    return {
      chatResponse: '¡Te gusta la acción! Tengo películas que te van a mantener al borde del asiento.',
      recommendedGenres: ['acción', 'thriller', 'ciencia ficción'],
    };
  }

  if (text.includes('terror') || text.includes('miedo') || text.includes('susto') || text.includes('horror')) {
    return {
      chatResponse: '¿Quieres pasar miedo? Tengo algunas joyas del terror que te van a poner los pelos de punta.',
      recommendedGenres: ['terror', 'thriller', 'misterio'],
    };
  }

  if (text.includes('romance') || text.includes('amor') || text.includes('romántico') || text.includes('pareja')) {
    return {
      chatResponse: 'Ah, el amor... Tengo historias románticas que te van a hacer suspirar.',
      recommendedGenres: ['romance', 'comedia romántica', 'drama'],
    };
  }

  if (text.includes('reír') || text.includes('comedia') || text.includes('divertido') || text.includes('gracioso')) {
    return {
      chatResponse: '¡Risas garantizadas! Te recomiendo comedias que te van a hacer soltar carcajadas.',
      recommendedGenres: ['comedia', 'animación', 'comedia romántica'],
    };
  }

  if (text.includes('solo') || text.includes('solitario') || text.includes('nadie')) {
    return {
      chatResponse: 'Oye, que sepas que no estás solo/a. Te propongo películas con historias de conexión humana que te van a hacer sentir acompañado/a.',
      recommendedGenres: ['drama', 'romance', 'aventura'],
    };
  }
  
  // Respuesta por defecto más variada
  const defaultResponses = [
    {
      chatResponse: '¿Qué tipo de experiencia buscas hoy? ¿Algo que te haga pensar, reír, o simplemente desconectar?',
      recommendedGenres: ['drama', 'comedia', 'aventura'],
    },
    {
      chatResponse: 'Cuéntame un poco más. ¿Prefieres algo intenso o algo más relajado para esta sesión?',
      recommendedGenres: ['thriller', 'comedia', 'documental'],
    },
    {
      chatResponse: '¿Estás de humor para algo nuevo o prefieres un clásico que nunca falla?',
      recommendedGenres: ['acción', 'drama', 'ciencia ficción'],
    },
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

export default aiService;
