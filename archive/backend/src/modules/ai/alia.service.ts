import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SalamandraRecommendation {
  recommendations: string[]; // Géneros o temáticas recomendadas
}

export interface AIRecommendation {
  recommendations: string[]; // Géneros cinematográficos recomendados
  reasoning: string;
  contextAnalysis: string;
  confidence: number;
  emotionalState: string;
  approach: 'catarsis' | 'evasion' | 'mixed';
}

export interface ALIARequest {
  userText: string; // Descripción del estado emocional del usuario
  userId?: string;
  previousRecommendations?: string[];
}

@Injectable()
export class ALIAService {
  private readonly logger = new Logger(ALIAService.name);
  private readonly httpClient: AxiosInstance;
  private readonly salamandraEndpoint: string;
  private readonly hfApiToken: string;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    // Usar Flan-T5 como modelo de IA (siempre disponible en HF)
    this.salamandraEndpoint =
      'https://api-inference.huggingface.co/models/google/flan-t5-large';
    this.hfApiToken = this.configService.get('HF_API_TOKEN', '');
    this.isEnabled = !!this.hfApiToken;

    this.httpClient = axios.create({
      timeout: 30000, // 30 segundos para modelos de IA
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.hfApiToken}`,
        'User-Agent': 'Trinity-MVP/1.0',
      },
    });

    if (this.isEnabled) {
      this.logger.log('ALIA Service initialized with Flan-T5-Large model');
    } else {
      this.logger.warn('ALIA Service disabled - no HF_API_TOKEN configured');
    }
  }

  /**
   * Obtener recomendaciones cinematográficas de Salamandra basadas en estado emocional
   */
  async getChatRecommendations(
    request: ALIARequest,
  ): Promise<AIRecommendation> {
    if (!this.isEnabled) {
      return this.getFallbackRecommendations(request.userText);
    }

    try {
      this.logger.log(
        `Getting Salamandra recommendations for: "${request.userText}"`,
      );

      // System prompt específico para Salamandra
      const systemPrompt = this.buildSalamandraPrompt(request.userText);

      const response = await this.httpClient.post(this.salamandraEndpoint, {
        inputs: systemPrompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          do_sample: true,
          return_full_text: false,
        },
        options: {
          wait_for_model: true,
        },
      });

      // Procesar respuesta de Salamandra
      const salamandraResponse = response.data;
      return this.parseSalamandraResponse(salamandraResponse, request.userText);
    } catch (error) {
      this.logger.error(`Error calling Salamandra API: ${error.message}`);

      // Fallback a recomendaciones locales
      return this.getFallbackRecommendations(request.userText);
    }
  }

  /**
   * Construir prompt específico para Flan-T5
   */
  private buildSalamandraPrompt(userText: string): string {
    return `Recommend 3 movie genres for someone who says: "${userText}". Answer with only the genre names separated by commas.`;
  }

  /**
   * Procesar respuesta de Flan-T5
   */
  private parseSalamandraResponse(
    salamandraResponse: any,
    originalContext: string,
  ): AIRecommendation {
    try {
      // Flan-T5 devuelve un array con la respuesta generada
      const generatedText = Array.isArray(salamandraResponse)
        ? salamandraResponse[0]?.generated_text
        : salamandraResponse.generated_text;

      if (!generatedText) {
        throw new Error('No generated text in response');
      }

      // Flan-T5 devuelve géneros separados por comas
      const genres = generatedText.split(',').map((g: string) => g.trim()).filter((g: string) => g.length > 0);
      
      if (genres.length === 0) {
        throw new Error('No genres found in response');
      }

      // Usar el fallback para generar la respuesta empática, pero con los géneros de la IA
      const fallback = this.getFallbackRecommendations(originalContext);
      
      return {
        recommendations: genres.slice(0, 3),
        reasoning: fallback.reasoning, // Usar la respuesta empática del fallback
        contextAnalysis: this.analyzeEmotionalContext(originalContext),
        confidence: 0.8,
        emotionalState: this.detectEmotionalState(originalContext),
        approach: fallback.approach,
      };
    } catch (error) {
      this.logger.warn(`Could not parse AI response: ${error.message}`);
      return this.getFallbackRecommendations(originalContext);
    }
  }

  /**
   * Recomendaciones de fallback cuando el modelo de IA no está disponible
   */
  private getFallbackRecommendations(userText: string): AIRecommendation {
    const analysis = this.analyzeEmotionalContext(userText);
    const lowerText = userText.toLowerCase();

    // PRIORIDAD 1: Detectar géneros específicos mencionados por el usuario
    const genreDetection = this.detectSpecificGenres(lowerText);
    if (genreDetection) {
      return genreDetection;
    }

    // PRIORIDAD 2: Detectar temas específicos (robots, vampiros, etc.)
    const themeDetection = this.detectSpecificThemes(lowerText);
    if (themeDetection) {
      return themeDetection;
    }

    // PRIORIDAD 3: Detectar actividades o preferencias específicas
    const activityDetection = this.detectSpecificActivities(lowerText);
    if (activityDetection) {
      return activityDetection;
    }

    // PRIORIDAD 4: Análisis emocional como último recurso
    const emotionalState = this.detectEmotionalState(userText);
    return this.getEmotionalRecommendations(emotionalState, analysis);
  }

  /**
   * Detectar géneros específicos mencionados por el usuario
   */
  private detectSpecificGenres(lowerText: string): AIRecommendation | null {
    const analysis = this.analyzeEmotionalContext(lowerText);
    
    const genrePatterns = {
      'terror': {
        keywords: ['terror', 'miedo', 'susto', 'horror', 'sangriento', 'asuste', 'escalofríos', 'pesadillas'],
        genres: ['terror', 'thriller', 'misterio'],
        responses: [
          '¿Quieres pasar miedo? Perfecto, me encantan las pelis de terror. Te voy a recomendar algunas que te van a poner los pelos de punta.',
          '¡Terror! Me encanta. Te voy a buscar películas que te van a hacer saltar del sofá.',
          'Ah, un amante del terror. Genial, tengo algunas joyas que te van a dar pesadillas.'
        ]
      },
      'accion': {
        keywords: ['acción', 'pelea', 'explosiones', 'adrenalina', 'combate', 'lucha', 'guerra', 'batalla'],
        genres: ['acción', 'thriller', 'aventura'],
        responses: [
          '¡Te gusta la acción! Genial, tengo películas que te van a mantener al borde del asiento con mucha adrenalina.',
          'Acción y adrenalina, ¡me encanta! Te voy a recomendar pelis que no te van a dejar respirar.',
          'Perfecto, algo con mucha acción. Te voy a buscar películas llenas de explosiones y peleas épicas.'
        ]
      },
      'ciencia_ficcion': {
        keywords: ['ciencia ficción', 'sci-fi', 'espacio', 'futuro', 'aliens', 'robots', 'tecnología', 'nave espacial', 'extraterrestres'],
        genres: ['ciencia ficción', 'aventura', 'fantasía'],
        responses: [
          '¡Viajes espaciales y mundos futuristas! Me fascina la ciencia ficción. Te voy a recomendar películas que te van a transportar a otras galaxias.',
          'Ciencia ficción, ¡mi género favorito! Te voy a buscar películas con robots, aliens y tecnología increíble.',
          'Perfecto, algo futurista. Te voy a recomendar pelis que te van a hacer soñar con otros mundos.'
        ]
      },
      'romance': {
        keywords: ['romance', 'amor', 'romántico', 'pareja', 'enamorarse', 'corazón', 'boda', 'cita'],
        genres: ['romance', 'comedia romántica', 'drama'],
        responses: [
          'Ah, el amor... Me encantan las historias románticas. Te voy a recomendar algunas que te van a hacer suspirar y creer en el amor.',
          '¡Romance! Te voy a buscar películas que te van a derretir el corazón.',
          'Perfecto, algo romántico. Te voy a recomendar historias de amor que te van a emocionar.'
        ]
      },
      'comedia': {
        keywords: ['comedia', 'reír', 'divertido', 'gracioso', 'humor', 'risas', 'carcajadas', 'cómico'],
        genres: ['comedia', 'animación', 'comedia romántica'],
        responses: [
          '¡Risas garantizadas! Me encanta cuando alguien quiere reír. Te voy a recomendar comedias que te van a hacer soltar carcajadas.',
          'Comedia, ¡perfecto! Te voy a buscar películas que te van a hacer reír hasta que te duela la barriga.',
          'Genial, algo divertido. Te voy a recomendar comedias que te van a alegrar el día.'
        ]
      },
      'drama': {
        keywords: ['drama', 'profundo', 'reflexionar', 'emocional', 'llorar', 'sentimientos', 'historia real'],
        genres: ['drama', 'biografía', 'historia'],
        responses: [
          'Drama, me encanta. Te voy a recomendar películas que te van a hacer reflexionar y sentir profundamente.',
          'Perfecto, algo emotivo. Te voy a buscar dramas que te van a tocar el corazón.',
          'Genial, algo con profundidad. Te voy a recomendar historias que te van a hacer pensar.'
        ]
      },
      'animacion': {
        keywords: ['animación', 'dibujos', 'pixar', 'disney', 'animada', 'cartoon'],
        genres: ['animación', 'familia', 'aventura'],
        responses: [
          '¡Animación! Me encantan las películas animadas, tienen una magia especial. Te voy a recomendar algunas joyas.',
          'Perfecto, algo animado. Te voy a buscar películas que son pura diversión y creatividad.',
          'Genial, animación. Te voy a recomendar pelis que te van a sorprender con su arte y historia.'
        ]
      }
    };

    for (const [genre, config] of Object.entries(genrePatterns)) {
      if (config.keywords.some(keyword => lowerText.includes(keyword))) {
        const randomResponse = config.responses[Math.floor(Math.random() * config.responses.length)];
        return {
          recommendations: config.genres,
          reasoning: randomResponse,
          contextAnalysis: analysis,
          confidence: 0.9, // Alta confianza cuando detectamos género específico
          emotionalState: 'happy',
          approach: 'evasion',
        };
      }
    }

    return null;
  }

  /**
   * Detectar temas específicos mencionados por el usuario
   */
  private detectSpecificThemes(lowerText: string): AIRecommendation | null {
    const analysis = this.analyzeEmotionalContext(lowerText);
    
    const themePatterns = {
      'robots': {
        keywords: ['robots', 'androides', 'inteligencia artificial', 'cyborgs', 'máquinas'],
        genres: ['ciencia ficción', 'acción', 'thriller'],
        response: '¡Robots! Me fascina la inteligencia artificial en el cine. Te voy a recomendar películas con robots increíbles y mundos futuristas.'
      },
      'vampiros': {
        keywords: ['vampiros', 'sangre', 'colmillos', 'drácula', 'no muertos'],
        genres: ['terror', 'fantasía', 'thriller'],
        response: '¡Vampiros! Criaturas fascinantes. Te voy a recomendar películas con vampiros que te van a hipnotizar.'
      },
      'zombies': {
        keywords: ['zombies', 'muertos vivientes', 'apocalipsis zombie', 'infectados'],
        genres: ['terror', 'acción', 'thriller'],
        response: '¡Apocalipsis zombie! Te voy a recomendar películas de zombies que te van a mantener en tensión.'
      },
      'superheroes': {
        keywords: ['superhéroes', 'marvel', 'dc', 'poderes', 'capa', 'héroe'],
        genres: ['acción', 'aventura', 'fantasía'],
        response: '¡Superhéroes! Me encantan las historias de héroes con poderes. Te voy a recomendar películas épicas.'
      },
      'magia': {
        keywords: ['magia', 'hechizos', 'brujas', 'magos', 'fantasía', 'harry potter'],
        genres: ['fantasía', 'aventura', 'familia'],
        response: '¡Magia! Me encanta el mundo de la fantasía. Te voy a recomendar películas llenas de hechizos y aventuras mágicas.'
      }
    };

    for (const [theme, config] of Object.entries(themePatterns)) {
      if (config.keywords.some(keyword => lowerText.includes(keyword))) {
        return {
          recommendations: config.genres,
          reasoning: config.response,
          contextAnalysis: analysis,
          confidence: 0.85,
          emotionalState: 'happy',
          approach: 'evasion',
        };
      }
    }

    return null;
  }

  /**
   * Detectar actividades o preferencias específicas
   */
  private detectSpecificActivities(lowerText: string): AIRecommendation | null {
    const analysis = this.analyzeEmotionalContext(lowerText);
    
    if (lowerText.includes('aburrido') || lowerText.includes('nada que hacer') || lowerText.includes('no sé qué ver')) {
      return {
        recommendations: ['acción', 'thriller', 'aventura'],
        reasoning: '¡Hora de sacudir ese aburrimiento! Odio cuando la gente se aburre. Tengo justo lo que necesitas: algo que te enganche desde el primer minuto.',
        contextAnalysis: analysis,
        confidence: 0.8,
        emotionalState: 'stressed',
        approach: 'evasion',
      };
    }

    if (lowerText.includes('relajar') || lowerText.includes('tranquilo') || lowerText.includes('calmar')) {
      return {
        recommendations: ['comedia', 'animación', 'documental'],
        reasoning: 'Perfecto, algo relajante. Te voy a recomendar películas que te van a ayudar a desconectar y estar tranquilo.',
        contextAnalysis: analysis,
        confidence: 0.8,
        emotionalState: 'anxious',
        approach: 'evasion',
      };
    }

    if (lowerText.includes('pensar') || lowerText.includes('reflexionar') || lowerText.includes('filosófico')) {
      return {
        recommendations: ['drama', 'ciencia ficción', 'thriller'],
        reasoning: 'Genial, algo que te haga pensar. Te voy a recomendar películas que te van a hacer reflexionar sobre la vida.',
        contextAnalysis: analysis,
        confidence: 0.8,
        emotionalState: 'neutral',
        approach: 'catarsis',
      };
    }

    return null;
  }

  /**
   * Recomendaciones basadas en estado emocional (último recurso)
   */
  private getEmotionalRecommendations(emotionalState: string, analysis: string): AIRecommendation {
    const emotionResponses: {
      [key: string]: { genres: string[]; approach: 'catarsis' | 'evasion'; responses: string[] };
    } = {
      sad: { 
        genres: ['drama', 'comedia', 'animación'], 
        approach: 'catarsis',
        responses: [
          'Entiendo cómo te sientes. A veces un buen drama nos ayuda a conectar con nuestras emociones, o una comedia ligera para desconectar.',
          'Veo que no estás pasando por tu mejor momento. Te propongo algo que te haga sentir acompañado/a.',
          'Cuando estamos así, el cine puede ser un gran aliado. ¿Qué te parece algo emotivo o prefieres desconectar con risas?'
        ]
      },
      happy: {
        genres: ['comedia', 'aventura', 'acción'],
        approach: 'evasion',
        responses: [
          '¡Qué bien que estés de buen humor! Vamos a mantener esa energía con algo divertido.',
          '¡Me encanta! Aprovechemos ese buen rollo con películas que te van a hacer disfrutar.',
          'Perfecto momento para algo entretenido que mantenga esas buenas vibras.'
        ]
      },
      stressed: {
        genres: ['comedia', 'animación', 'aventura'],
        approach: 'evasion',
        responses: [
          'Parece que necesitas desconectar un poco. Te recomiendo algo ligero y entretenido.',
          'El estrés es duro. ¿Qué tal algo que te saque de la rutina y te haga olvidar todo por un rato?',
          'Entiendo, a veces necesitamos escapar un poco. Tengo justo lo que necesitas.'
        ]
      },
      neutral: { 
        genres: ['drama', 'comedia', 'aventura'], 
        approach: 'evasion',
        responses: [
          '¿Qué tipo de experiencia buscas hoy? ¿Algo que te haga pensar, reír, o simplemente desconectar?',
          'Cuéntame un poco más. ¿Prefieres algo intenso o algo más relajado?',
          '¿Estás de humor para algo nuevo o prefieres un clásico que nunca falla?'
        ]
      },
    };

    const recommendation = emotionResponses[emotionalState] || emotionResponses.neutral;
    const randomResponse = recommendation.responses[Math.floor(Math.random() * recommendation.responses.length)];

    return {
      recommendations: recommendation.genres,
      reasoning: randomResponse,
      contextAnalysis: analysis,
      confidence: 0.6,
      emotionalState,
      approach: recommendation.approach,
    };
  }

  /**
   * Análisis psicológico del contexto emocional
   */
  private analyzeEmotionalContext(userText: string): string {
    const lowerText = userText.toLowerCase();

    if (lowerText.includes('bullying') || lowerText.includes('acoso')) {
      return 'Situación de acoso detectada. Se recomienda catarsis a través de dramas que aborden superación personal y apoyo social.';
    }

    if (
      lowerText.includes('triste') ||
      lowerText.includes('deprimido') ||
      lowerText.includes('melancolía')
    ) {
      return 'Estado depresivo detectado. Catarsis recomendada con dramas inspiracionales seguidos de comedias ligeras.';
    }

    if (
      lowerText.includes('estresado') ||
      lowerText.includes('ansiedad') ||
      lowerText.includes('agobiado')
    ) {
      return 'Estrés/ansiedad detectados. Evasión recomendada con comedias y contenido relajante.';
    }

    if (
      lowerText.includes('enfadado') ||
      lowerText.includes('furioso') ||
      lowerText.includes('rabia')
    ) {
      return 'Estado de ira detectado. Catarsis recomendada con thrillers o deportes para canalizar la energía.';
    }

    if (
      lowerText.includes('solo') ||
      lowerText.includes('aislado') ||
      lowerText.includes('abandonado')
    ) {
      return 'Sentimientos de soledad detectados. Catarsis con dramas familiares y romances.';
    }

    if (
      lowerText.includes('feliz') ||
      lowerText.includes('celebrar') ||
      lowerText.includes('eufórico')
    ) {
      return 'Estado positivo detectado. Evasión para mantener y amplificar el buen ánimo.';
    }

    return 'Estado emocional neutro. Se recomienda variedad de géneros según preferencias personales.';
  }

  /**
   * Detección de estado emocional principal
   */
  private detectEmotionalState(userText: string): string {
    const lowerText = userText.toLowerCase();

    const emotionKeywords = {
      sad: ['triste', 'deprimido', 'melancólico', 'llorar', 'pena', 'dolor', 'mal', 'bajón', 'decaído', 'desanimado', 'llorando', 'fatal', 'horrible', 'terrible'],
      happy: [
        'feliz',
        'alegre',
        'contento',
        'celebrar',
        'emocionado',
        'eufórico',
        'bien',
        'genial',
        'increíble',
        'fantástico',
        'maravilloso',
        'perfecto',
        'animado',
      ],
      stressed: ['estresado', 'ansiedad', 'nervioso', 'preocupado', 'agobiado', 'cansado', 'agotado', 'saturado', 'trabajo', 'exámenes', 'presión', 'abrumado'],
      angry: ['enfadado', 'furioso', 'molesto', 'irritado', 'rabioso', 'ira', 'cabreado', 'harto', 'frustrado', 'indignado'],
      lonely: ['solo', 'solitario', 'aislado', 'abandonado', 'vacío', 'nadie', 'incomprendido'],
      anxious: ['ansioso', 'nervioso', 'inquieto', 'intranquilo', 'miedo', 'pánico', 'asustado'],
      depressed: ['deprimido', 'hundido', 'sin esperanza', 'desesperanzado', 'vacío', 'nada', 'sin ganas'],
    };

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        return emotion;
      }
    }

    // Si no detectamos emoción específica, intentar inferir por contexto
    // Buscar patrones de pregunta o interés en géneros
    if (lowerText.includes('acción') || lowerText.includes('pelea') || lowerText.includes('explosiones')) {
      return 'happy'; // Quiere entretenimiento activo
    }
    if (lowerText.includes('terror') || lowerText.includes('miedo') || lowerText.includes('susto')) {
      return 'happy'; // Quiere emociones fuertes
    }
    if (lowerText.includes('comedia') || lowerText.includes('reír') || lowerText.includes('divertido')) {
      return 'stressed'; // Quiere desconectar
    }
    if (lowerText.includes('romance') || lowerText.includes('amor') || lowerText.includes('romántico')) {
      return 'lonely'; // Busca conexión emocional
    }
    if (lowerText.includes('drama') || lowerText.includes('profundo') || lowerText.includes('reflexionar')) {
      return 'sad'; // Quiere catarsis
    }
    if (lowerText.includes('aburrido') || lowerText.includes('nada que hacer') || lowerText.includes('no sé qué ver')) {
      return 'stressed'; // Necesita entretenimiento
    }

    return 'neutral';
  }

  /**
   * Verificar estado del servicio Salamandra
   */
  async healthCheck(): Promise<{
    available: boolean;
    latency?: number;
    model?: string;
  }> {
    if (!this.isEnabled) {
      return { available: false };
    }

    try {
      const startTime = Date.now();

      // Test simple con Salamandra
      const testResponse = await this.httpClient.post(this.salamandraEndpoint, {
        inputs: 'Test de conectividad',
        parameters: {
          max_new_tokens: 10,
          temperature: 0.1,
        },
        options: {
          wait_for_model: true,
        },
      });

      const latency = Date.now() - startTime;

      return {
        available: true,
        latency,
        model: 'google/flan-t5-large',
      };
    } catch (error) {
      this.logger.warn(`Salamandra health check failed: ${error.message}`);
      return { available: false };
    }
  }
}
