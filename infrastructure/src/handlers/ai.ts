import { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import { logBusinessMetric, logError, PerformanceTimer } from '../utils/metrics';
import { movieCacheService } from '../services/movieCacheService';

// For Node.js fetch support
declare global {
  function fetch(input: string, init?: any): Promise<any>;
}

interface SalamandraRequest {
  inputs: string;
  parameters?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    do_sample?: boolean;
  };
}

interface SalamandraResponse {
  generated_text?: string;
  error?: string;
}

interface TriniResponse {
  chatResponse: string;
  recommendedGenres: string[];
  confidence: number;
  reasoning: string;
}

// ============================================
// TRINI - System Prompt con Personalidad
// ============================================
const TRINI_SYSTEM_PROMPT = `Eres Trini, una experta en cine, empática y cercana (como una hermana mayor). 
Has iniciado la conversación preguntando "Hola, soy Trini. ¿Qué te apetece ver hoy?".

Tu objetivo es recomendar cine terapéutico según el ánimo del usuario:
- CATARSIS: Películas que ayudan a procesar emociones difíciles (dramas, películas emotivas)
- EVASIÓN: Películas que distraen y alegran (comedias, aventuras, animación)
- CONFRONTACIÓN: Películas que abordan directamente el tema que preocupa al usuario

Si detectas temas sensibles (bullying, depresión, ansiedad, soledad), sé especialmente cuidadosa, validante y constructiva.
Nunca minimices los sentimientos del usuario. Muestra empatía genuina.

GÉNEROS DISPONIBLES: acción, aventura, animación, comedia, crimen, documental, drama, familia, fantasía, historia, terror, música, misterio, romance, ciencia ficción, thriller, guerra, western

IMPORTANTE: Tu respuesta debe ser ÚNICAMENTE un objeto JSON válido con esta estructura estricta:
{ "chatResponse": "Tu mensaje de texto empático aquí", "recommendedGenres": ["género1", "género2", "género3"], "confidence": 0.85, "reasoning": "Explicación breve de por qué recomiendas estos géneros" }

No incluyas nada más que el JSON. No uses markdown, comillas triples ni explicaciones adicionales.`;

/**
 * AIHandler: Chat Contextual con Trini (Salamandra)
 * Integración con Hugging Face Inference API usando el modelo Salamandra-7b-instruct
 */
export const handler: AppSyncResolverHandler<any, any> = async (event: AppSyncResolverEvent<any>) => {
  console.log('🤖 Trini AI Handler:', JSON.stringify(event, null, 2));

  const fieldName = event.info?.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'getChatRecommendations':
        return await getTriniRecommendations(args.text, args.roomGenres);
      
      default:
        throw new Error(`Operación no soportada: ${fieldName}`);
    }
  } catch (error) {
    console.error(`❌ Error en ${fieldName}:`, error);
    throw error;
  }
};

/**
 * Obtener recomendaciones de Trini basadas en texto del usuario y géneros de la sala
 */
async function getTriniRecommendations(userText: string, roomGenres?: string[]): Promise<TriniResponse> {
  const timer = new PerformanceTimer('TriniRecommendations');
  console.log(`🧠 Trini analizando: "${userText}"${roomGenres ? ` con géneros de sala: ${roomGenres.join(', ')}` : ''}`);

  try {
    // 1. Construir prompt con personalidad de Trini y contexto de géneros de sala
    const prompt = buildTriniPrompt(userText, roomGenres);
    
    // 2. Llamar a Hugging Face Inference API
    const aiResponse = await callSalamandraAPI(prompt);
    
    // 3. Procesar respuesta y extraer JSON de Trini
    const triniResponse = parseTriniResponse(aiResponse, userText, roomGenres);
    
    // Log business metric
    logBusinessMetric('AI_RECOMMENDATION', undefined, undefined, {
      userTextLength: userText.length,
      responseSource: 'salamandra',
      recommendedGenres: triniResponse.recommendedGenres,
      roomGenres: roomGenres || [],
      emotionalState: detectEmotionalState(userText.toLowerCase()),
      confidence: triniResponse.confidence,
      genreAlignment: calculateGenreAlignment(triniResponse.recommendedGenres, roomGenres)
    });
    
    console.log(`✅ Trini responde: "${triniResponse.chatResponse.substring(0, 50)}..." (confianza: ${triniResponse.confidence})`);
    timer.finish(true, undefined, { 
      source: 'salamandra',
      genreCount: triniResponse.recommendedGenres.length,
      confidence: triniResponse.confidence
    });
    return triniResponse;

  } catch (error) {
    console.warn('⚠️ Error en Salamandra, intentando fallback con TMDB API:', error);
    
    // Try TMDB API fallback first
    try {
      const tmdbFallbackResponse = await getTMDBFallbackResponse(userText, roomGenres);
      
      // Log business metric for TMDB fallback
      logBusinessMetric('AI_RECOMMENDATION', undefined, undefined, {
        userTextLength: userText.length,
        responseSource: 'tmdb_fallback',
        recommendedGenres: tmdbFallbackResponse.recommendedGenres,
        roomGenres: roomGenres || [],
        emotionalState: detectEmotionalState(userText.toLowerCase()),
        confidence: tmdbFallbackResponse.confidence,
        errorType: (error as Error).name,
        genreAlignment: calculateGenreAlignment(tmdbFallbackResponse.recommendedGenres, roomGenres)
      });
      
      console.log(`✅ TMDB fallback exitoso: "${tmdbFallbackResponse.chatResponse.substring(0, 50)}..." (confianza: ${tmdbFallbackResponse.confidence})`);
      timer.finish(true, 'TMDBFallback', { 
        source: 'tmdb_fallback',
        genreCount: tmdbFallbackResponse.recommendedGenres.length,
        confidence: tmdbFallbackResponse.confidence
      });
      return tmdbFallbackResponse;
      
    } catch (tmdbError) {
      console.warn('⚠️ TMDB API también falló, usando fallback local de Trini:', tmdbError);
    }
    
    // Final fallback to local Trini responses
    const fallbackResponse = getTriniFallbackResponse(userText, roomGenres);
    
    // Log business metric for local fallback
    logBusinessMetric('AI_RECOMMENDATION', undefined, undefined, {
      userTextLength: userText.length,
      responseSource: 'local_fallback',
      recommendedGenres: fallbackResponse.recommendedGenres,
      roomGenres: roomGenres || [],
      emotionalState: detectEmotionalState(userText.toLowerCase()),
      confidence: fallbackResponse.confidence,
      errorType: (error as Error).name,
      genreAlignment: calculateGenreAlignment(fallbackResponse.recommendedGenres, roomGenres)
    });
    
    timer.finish(true, 'LocalFallback', { 
      source: 'local_fallback',
      genreCount: fallbackResponse.recommendedGenres.length,
      confidence: fallbackResponse.confidence
    });
    return fallbackResponse;
  }
}

/**
 * Construir prompt con la personalidad de Trini y contexto de géneros de sala
 */
function buildTriniPrompt(userText: string, roomGenres?: string[]): string {
  let genreContext = '';
  
  if (roomGenres && roomGenres.length > 0) {
    genreContext = `\n\nCONTEXTO DE LA SALA: Los participantes de esta sala han expresado preferencia por los géneros: ${roomGenres.join(', ')}. 
PRIORIZA estos géneros en tus recomendaciones cuando sea apropiado para el estado emocional del usuario, pero no los fuerces si no encajan con lo que necesita.`;
  }

  return `${TRINI_SYSTEM_PROMPT}${genreContext}

Usuario: "${userText}"

Respuesta JSON:`;
}

/**
 * Llamar a la API de Hugging Face con Salamandra
 */
async function callSalamandraAPI(prompt: string): Promise<string> {
  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    throw new Error('HF_API_TOKEN no configurado');
  }

  const requestBody: SalamandraRequest = {
    inputs: prompt,
    parameters: {
      max_new_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
      do_sample: true,
    },
  };

  const response = await fetch(
    'https://api-inference.huggingface.co/models/BSC-LT/salamandra-7b-instruct',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Trinity-Trini/1.0',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as SalamandraResponse[];
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('Respuesta inválida de Hugging Face API');
  }

  const result = data[0];
  if (result.error) {
    throw new Error(`Salamandra error: ${result.error}`);
  }

  if (!result.generated_text) {
    throw new Error('No se generó texto de respuesta');
  }

  // Extraer solo la parte nueva del texto generado (después del prompt)
  const generatedText = result.generated_text.replace(prompt, '').trim();
  
  console.log(`🤖 Salamandra raw response: "${generatedText}"`);
  return generatedText;
}

/**
 * Parsear respuesta de Salamandra y extraer JSON de Trini
 */
function parseTriniResponse(aiResponse: string, originalText: string, roomGenres?: string[]): TriniResponse {
  try {
    // Intentar extraer JSON de la respuesta
    const jsonMatch = aiResponse.match(/\{[\s\S]*?"chatResponse"[\s\S]*?"recommendedGenres"[\s\S]*?"confidence"[\s\S]*?"reasoning"[\s\S]*?\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.chatResponse && Array.isArray(parsed.recommendedGenres) && 
          typeof parsed.confidence === 'number' && parsed.reasoning) {
        // Validar y normalizar géneros
        const validGenres = validateGenres(parsed.recommendedGenres);
        
        // Priorizar géneros de sala si están disponibles
        const prioritizedGenres = prioritizeRoomGenres(validGenres, roomGenres);
        
        return {
          chatResponse: parsed.chatResponse,
          recommendedGenres: prioritizedGenres.length > 0 ? prioritizedGenres : getDefaultGenresForMood(originalText, roomGenres),
          confidence: Math.max(0, Math.min(1, parsed.confidence)), // Clamp between 0 and 1
          reasoning: parsed.reasoning,
        };
      }
    }
    
    throw new Error('JSON inválido en respuesta de Salamandra');
  } catch (error) {
    console.warn('⚠️ Error parseando respuesta de Trini:', error);
    return getTriniFallbackResponse(originalText, roomGenres);
  }
}

/**
 * Validar y normalizar géneros cinematográficos
 */
function validateGenres(genres: string[]): string[] {
  const validGenreMap: { [key: string]: string } = {
    'accion': 'acción', 'acción': 'acción', 'action': 'acción',
    'aventura': 'aventura', 'adventure': 'aventura',
    'animacion': 'animación', 'animación': 'animación', 'animation': 'animación',
    'comedia': 'comedia', 'comedy': 'comedia',
    'crimen': 'crimen', 'crime': 'crimen',
    'documental': 'documental', 'documentary': 'documental',
    'drama': 'drama',
    'familia': 'familia', 'family': 'familia',
    'fantasia': 'fantasía', 'fantasía': 'fantasía', 'fantasy': 'fantasía',
    'historia': 'historia', 'history': 'historia',
    'terror': 'terror', 'horror': 'terror',
    'musica': 'música', 'música': 'música', 'music': 'música',
    'misterio': 'misterio', 'mystery': 'misterio',
    'romance': 'romance',
    'ciencia ficcion': 'ciencia ficción', 'ciencia ficción': 'ciencia ficción',
    'science fiction': 'ciencia ficción', 'sci-fi': 'ciencia ficción',
    'thriller': 'thriller', 'suspense': 'thriller',
    'guerra': 'guerra', 'war': 'guerra',
    'western': 'western',
  };

  return genres
    .map(genre => validGenreMap[genre.toLowerCase().trim()])
    .filter(genre => genre !== undefined)
    .slice(0, 3);
}

/**
 * Obtener respuesta de fallback usando TMDB API
 */
async function getTMDBFallbackResponse(userText: string, roomGenres?: string[]): Promise<TriniResponse> {
  console.log(`🎬 Obteniendo fallback de TMDB API para géneros: ${roomGenres?.join(', ') || 'ninguno'}`);
  
  try {
    // Determine genres to use for TMDB recommendations
    const targetGenres = roomGenres && roomGenres.length > 0 
      ? roomGenres 
      : getDefaultGenresForMood(userText, roomGenres);
    
    // Get movie recommendations from TMDB via movie cache service
    const movies = await movieCacheService.preCacheMovies('tmdb_fallback_temp', targetGenres);
    
    if (movies.length === 0) {
      throw new Error('No movies available from TMDB API');
    }
    
    // Extract genres from the movies we got
    const availableGenres = [...new Set(movies.flatMap(movie => movie.genres))];
    const recommendedGenres = availableGenres.slice(0, 3);
    
    // Detect emotional state for appropriate response
    const emotionalState = detectEmotionalState(userText.toLowerCase());
    
    // Generate contextual response based on emotional state and available movies
    const chatResponse = generateTMDBFallbackMessage(emotionalState, recommendedGenres, movies.length);
    
    // Calculate confidence based on genre alignment and movie availability
    const genreAlignment = calculateGenreAlignment(recommendedGenres, roomGenres);
    const baseConfidence = 0.70; // TMDB fallback has good confidence
    const adjustedConfidence = roomGenres && roomGenres.length > 0 
      ? baseConfidence * (0.8 + 0.2 * genreAlignment)
      : baseConfidence;
    
    const reasoning = `Basado en datos de TMDB API. Encontré ${movies.length} películas populares` + 
      (targetGenres.length > 0 ? ` en los géneros: ${targetGenres.join(', ')}` : '') +
      (genreAlignment > 0 ? ` con ${Math.round(genreAlignment * 100)}% de alineación con preferencias de sala.` : '.');
    
    return {
      chatResponse,
      recommendedGenres,
      confidence: Math.round(adjustedConfidence * 100) / 100,
      reasoning,
    };
    
  } catch (error) {
    console.error('❌ Error en TMDB fallback:', error);
    throw error;
  }
}

/**
 * Generar mensaje contextual para fallback de TMDB
 */
function generateTMDBFallbackMessage(emotionalState: string, genres: string[], movieCount: number): string {
  const genreText = genres.length > 0 ? ` de ${genres.join(', ')}` : '';
  
  const stateResponses: { [key: string]: string } = {
    sad: `Entiendo cómo te sientes. He encontrado ${movieCount} películas populares${genreText} que podrían ayudarte. A veces el cine nos da exactamente lo que necesitamos para procesar nuestras emociones.`,
    stressed: `Veo que necesitas desconectar un poco. Tengo ${movieCount} películas populares${genreText} que son perfectas para relajarse y olvidarse del estrés por un rato.`,
    angry: `Entiendo esa frustración. He seleccionado ${movieCount} películas populares${genreText} que te ayudarán a canalizar esa energía o simplemente desconectar de lo que te molesta.`,
    lonely: `No estás solo/a en esto. Encontré ${movieCount} películas populares${genreText} con historias que te recordarán la belleza de las conexiones humanas.`,
    anxious: `Tranquilo/a, estoy aquí. He encontrado ${movieCount} películas populares${genreText} que son reconfortantes y te ayudarán a sentirte mejor sin sobresaltos.`,
    happy: `¡Qué buena energía! Tengo ${movieCount} películas populares${genreText} que mantendrán esas buenas vibraciones y te harán pasar un rato genial.`,
    bored: `¡Perfecto! He encontrado ${movieCount} películas populares${genreText} que te van a enganchar desde el primer minuto. Nada de aburrimiento aquí.`,
    default: `He encontrado ${movieCount} películas populares${genreText} basándome en las tendencias actuales. Estas son opciones que están funcionando muy bien con otros usuarios.`,
  };
  
  return stateResponses[emotionalState] || stateResponses.default;
}

/**
 * Respuesta de fallback empática de Trini con géneros de sala
 */
function getTriniFallbackResponse(userText: string, roomGenres?: string[]): TriniResponse {
  const text = userText.toLowerCase();
  const emotionalState = detectEmotionalState(text);
  
  const responses: { [key: string]: Omit<TriniResponse, 'recommendedGenres'> } = {
    sad: {
      chatResponse: "Entiendo cómo te sientes, y está bien sentirse así a veces. Te propongo algo: ¿qué tal si vemos algo que te ayude a soltar esas emociones? A veces un buen drama nos permite conectar con lo que sentimos, o si prefieres, una comedia ligera para desconectar un poco. Tú decides qué necesitas ahora.",
      confidence: 0.75,
      reasoning: "Detecté tristeza en tu mensaje. Recomiendo géneros que permitan catarsis emocional o distracción positiva.",
    },
    stressed: {
      chatResponse: "Vaya, parece que has tenido días intensos. Lo primero: respira. Ahora, déjame ayudarte a desconectar. Te recomiendo algo ligero y entretenido que te saque de la rutina por un rato. ¿Te apetece reír o prefieres una aventura que te transporte a otro mundo?",
      confidence: 0.80,
      reasoning: "Identifico estrés en tu mensaje. Sugiero géneros que ofrezcan escape y relajación mental.",
    },
    angry: {
      chatResponse: "Entiendo esa frustración, es válido sentirse así. A veces necesitamos canalizar esa energía. Te propongo algo con acción que te ayude a liberar tensión, o si prefieres, un thriller que te mantenga enganchado y te haga olvidar por un rato lo que te molesta.",
      confidence: 0.78,
      reasoning: "Percibo frustración o enojo. Recomiendo géneros que permitan canalizar esa energía de forma catártica.",
    },
    lonely: {
      chatResponse: "Oye, que sepas que no estás solo/a en esto. Todos nos sentimos así a veces. Te propongo películas con historias de conexión humana, de esas que te recuerdan lo bonito de las relaciones. ¿Qué te parece algo emotivo o quizás una comedia romántica?",
      confidence: 0.82,
      reasoning: "Detecto sentimientos de soledad. Sugiero géneros que exploren conexiones humanas y relaciones.",
    },
    anxious: {
      chatResponse: "Tranquilo/a, estoy aquí para ayudarte. Cuando la ansiedad aprieta, a veces lo mejor es algo que nos calme y nos haga sentir bien. Te recomiendo algo visualmente bonito y reconfortante, sin sobresaltos. ¿Te apetece animación o un documental de naturaleza?",
      confidence: 0.85,
      reasoning: "Identifico ansiedad en tu mensaje. Recomiendo géneros calmantes y reconfortantes, evitando contenido intenso.",
    },
    happy: {
      chatResponse: "¡Qué bien que estés de buen humor! Vamos a mantener esa energía. Te propongo algo divertido y emocionante que potencie esas buenas vibraciones. ¿Aventura, comedia o quizás algo musical?",
      confidence: 0.90,
      reasoning: "Percibo buen ánimo en tu mensaje. Sugiero géneros que mantengan y potencien esa energía positiva.",
    },
    bored: {
      chatResponse: "¡Hora de sacudir ese aburrimiento! Tengo justo lo que necesitas: algo que te enganche desde el primer minuto. ¿Te apetece acción trepidante, un thriller que te mantenga en vilo, o una aventura épica?",
      confidence: 0.88,
      reasoning: "Detecto aburrimiento. Recomiendo géneros dinámicos y emocionantes que capturen tu atención inmediatamente.",
    },
    default: {
      chatResponse: "Cuéntame más sobre cómo te sientes o qué tipo de experiencia buscas. Mientras tanto, te propongo una selección variada que suele gustar a todo el mundo. ¿Qué te parece empezar por aquí?",
      confidence: 0.60,
      reasoning: "No pude identificar un estado emocional específico. Ofrezco una selección equilibrada de géneros populares.",
    },
  };

  const baseResponse = responses[emotionalState] || responses.default;
  const baseGenres = getDefaultGenresForMood(userText, roomGenres);
  
  // Priorizar géneros de sala cuando sea apropiado
  const prioritizedGenres = prioritizeRoomGenres(baseGenres, roomGenres);
  
  // Ajustar confianza basada en alineación con géneros de sala
  const genreAlignment = calculateGenreAlignment(prioritizedGenres, roomGenres);
  const adjustedConfidence = roomGenres && roomGenres.length > 0 
    ? baseResponse.confidence * (0.7 + 0.3 * genreAlignment)
    : baseResponse.confidence;

  return {
    ...baseResponse,
    recommendedGenres: prioritizedGenres,
    confidence: Math.round(adjustedConfidence * 100) / 100, // Round to 2 decimal places
  };
}

/**
 * Detectar estado emocional del usuario
 */
function detectEmotionalState(text: string): string {
  const emotionKeywords: { [key: string]: string[] } = {
    sad: ['triste', 'deprimido', 'melancólico', 'llorar', 'pena', 'dolor', 'mal', 'bajón'],
    stressed: ['estresado', 'agobiado', 'presión', 'trabajo', 'cansado', 'exhausto', 'saturado'],
    angry: ['enfadado', 'furioso', 'molesto', 'irritado', 'rabia', 'cabreado', 'frustrado'],
    lonely: ['solo', 'solitario', 'aislado', 'abandonado', 'vacío', 'nadie'],
    anxious: ['ansioso', 'nervioso', 'preocupado', 'inquieto', 'ansiedad', 'miedo'],
    happy: ['feliz', 'alegre', 'contento', 'bien', 'genial', 'celebrar', 'emocionado'],
    bored: ['aburrido', 'nada que hacer', 'sin planes', 'monotonía'],
  };

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return emotion;
    }
  }

  return 'default';
}

/**
 * Obtener géneros por defecto según el estado de ánimo y géneros de sala
 */
function getDefaultGenresForMood(text: string, roomGenres?: string[]): string[] {
  const state = detectEmotionalState(text.toLowerCase());
  const moodGenres: { [key: string]: string[] } = {
    sad: ['drama', 'comedia', 'animación'],
    stressed: ['comedia', 'animación', 'aventura'],
    angry: ['acción', 'thriller', 'drama'],
    lonely: ['romance', 'drama', 'comedia'],
    anxious: ['animación', 'documental', 'familia'],
    happy: ['comedia', 'aventura', 'música'],
    bored: ['acción', 'thriller', 'aventura'],
    default: ['drama', 'comedia', 'aventura'],
  };
  
  const baseGenres = moodGenres[state] || moodGenres.default;
  return prioritizeRoomGenres(baseGenres, roomGenres);
}

/**
 * Priorizar géneros de sala cuando sea apropiado
 */
function prioritizeRoomGenres(recommendedGenres: string[], roomGenres?: string[]): string[] {
  if (!roomGenres || roomGenres.length === 0) {
    return recommendedGenres;
  }

  // Normalizar géneros de sala para comparación
  const normalizedRoomGenres = roomGenres.map(g => g.toLowerCase().trim());
  const normalizedRecommended = recommendedGenres.map(g => g.toLowerCase().trim());

  // Encontrar géneros que coinciden
  const matchingGenres: string[] = [];
  const nonMatchingGenres: string[] = [];

  for (const genre of recommendedGenres) {
    const normalized = genre.toLowerCase().trim();
    if (normalizedRoomGenres.includes(normalized)) {
      matchingGenres.push(genre);
    } else {
      nonMatchingGenres.push(genre);
    }
  }

  // Si hay coincidencias, priorizarlas
  if (matchingGenres.length > 0) {
    // Combinar géneros coincidentes primero, luego no coincidentes
    const result = [...matchingGenres, ...nonMatchingGenres].slice(0, 3);
    console.log(`🎯 Priorizando géneros de sala: ${matchingGenres.join(', ')} de ${roomGenres.join(', ')}`);
    return result;
  }

  // Si no hay coincidencias, mantener recomendaciones originales
  return recommendedGenres;
}

/**
 * Calcular alineación entre géneros recomendados y géneros de sala
 */
function calculateGenreAlignment(recommendedGenres: string[], roomGenres?: string[]): number {
  if (!roomGenres || roomGenres.length === 0 || recommendedGenres.length === 0) {
    return 0;
  }

  const normalizedRoomGenres = roomGenres.map(g => g.toLowerCase().trim());
  const normalizedRecommended = recommendedGenres.map(g => g.toLowerCase().trim());

  const matches = normalizedRecommended.filter(genre => 
    normalizedRoomGenres.includes(genre)
  ).length;

  return matches / Math.max(recommendedGenres.length, roomGenres.length);
}
