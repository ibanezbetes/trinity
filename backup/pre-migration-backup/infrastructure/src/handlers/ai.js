"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const metrics_1 = require("../utils/metrics");
const movieCacheService_1 = require("../services/movieCacheService");
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
const handler = async (event) => {
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
    }
    catch (error) {
        console.error(`❌ Error en ${fieldName}:`, error);
        throw error;
    }
};
exports.handler = handler;
/**
 * Obtener recomendaciones de Trini basadas en texto del usuario y géneros de la sala
 */
async function getTriniRecommendations(userText, roomGenres) {
    const timer = new metrics_1.PerformanceTimer('TriniRecommendations');
    console.log(`🧠 Trini analizando: "${userText}"${roomGenres ? ` con géneros de sala: ${roomGenres.join(', ')}` : ''}`);
    try {
        // 1. Construir prompt con personalidad de Trini y contexto de géneros de sala
        const prompt = buildTriniPrompt(userText, roomGenres);
        // 2. Llamar a Hugging Face Inference API
        const aiResponse = await callSalamandraAPI(prompt);
        // 3. Procesar respuesta y extraer JSON de Trini
        const triniResponse = parseTriniResponse(aiResponse, userText, roomGenres);
        // Log business metric
        (0, metrics_1.logBusinessMetric)('AI_RECOMMENDATION', undefined, undefined, {
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
    }
    catch (error) {
        console.warn('⚠️ Error en Salamandra, intentando fallback con TMDB API:', error);
        // Try TMDB API fallback first
        try {
            const tmdbFallbackResponse = await getTMDBFallbackResponse(userText, roomGenres);
            // Log business metric for TMDB fallback
            (0, metrics_1.logBusinessMetric)('AI_RECOMMENDATION', undefined, undefined, {
                userTextLength: userText.length,
                responseSource: 'tmdb_fallback',
                recommendedGenres: tmdbFallbackResponse.recommendedGenres,
                roomGenres: roomGenres || [],
                emotionalState: detectEmotionalState(userText.toLowerCase()),
                confidence: tmdbFallbackResponse.confidence,
                errorType: error.name,
                genreAlignment: calculateGenreAlignment(tmdbFallbackResponse.recommendedGenres, roomGenres)
            });
            console.log(`✅ TMDB fallback exitoso: "${tmdbFallbackResponse.chatResponse.substring(0, 50)}..." (confianza: ${tmdbFallbackResponse.confidence})`);
            timer.finish(true, 'TMDBFallback', {
                source: 'tmdb_fallback',
                genreCount: tmdbFallbackResponse.recommendedGenres.length,
                confidence: tmdbFallbackResponse.confidence
            });
            return tmdbFallbackResponse;
        }
        catch (tmdbError) {
            console.warn('⚠️ TMDB API también falló, usando fallback local de Trini:', tmdbError);
        }
        // Final fallback to local Trini responses
        const fallbackResponse = getTriniFallbackResponse(userText, roomGenres);
        // Log business metric for local fallback
        (0, metrics_1.logBusinessMetric)('AI_RECOMMENDATION', undefined, undefined, {
            userTextLength: userText.length,
            responseSource: 'local_fallback',
            recommendedGenres: fallbackResponse.recommendedGenres,
            roomGenres: roomGenres || [],
            emotionalState: detectEmotionalState(userText.toLowerCase()),
            confidence: fallbackResponse.confidence,
            errorType: error.name,
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
function buildTriniPrompt(userText, roomGenres) {
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
async function callSalamandraAPI(prompt) {
    const apiToken = process.env.HF_API_TOKEN;
    if (!apiToken) {
        throw new Error('HF_API_TOKEN no configurado');
    }
    const requestBody = {
        inputs: prompt,
        parameters: {
            max_new_tokens: 200,
            temperature: 0.7,
            top_p: 0.9,
            do_sample: true,
        },
    };
    const response = await fetch('https://api-inference.huggingface.co/models/BSC-LT/salamandra-7b-instruct', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Trinity-Trini/1.0',
        },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face API error: ${response.status} ${errorText}`);
    }
    const data = await response.json();
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
function parseTriniResponse(aiResponse, originalText, roomGenres) {
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
    }
    catch (error) {
        console.warn('⚠️ Error parseando respuesta de Trini:', error);
        return getTriniFallbackResponse(originalText, roomGenres);
    }
}
/**
 * Validar y normalizar géneros cinematográficos
 */
function validateGenres(genres) {
    const validGenreMap = {
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
async function getTMDBFallbackResponse(userText, roomGenres) {
    console.log(`🎬 Obteniendo fallback de TMDB API para géneros: ${roomGenres?.join(', ') || 'ninguno'}`);
    try {
        // Determine genres to use for TMDB recommendations
        const targetGenres = roomGenres && roomGenres.length > 0
            ? roomGenres
            : getDefaultGenresForMood(userText, roomGenres);
        // Get movie recommendations from TMDB via movie cache service
        const movies = await movieCacheService_1.movieCacheService.preCacheMovies('tmdb_fallback_temp', targetGenres);
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
    }
    catch (error) {
        console.error('❌ Error en TMDB fallback:', error);
        throw error;
    }
}
/**
 * Generar mensaje contextual para fallback de TMDB
 */
function generateTMDBFallbackMessage(emotionalState, genres, movieCount) {
    const genreText = genres.length > 0 ? ` de ${genres.join(', ')}` : '';
    const stateResponses = {
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
function getTriniFallbackResponse(userText, roomGenres) {
    const text = userText.toLowerCase();
    const emotionalState = detectEmotionalState(text);
    const responses = {
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
function detectEmotionalState(text) {
    const emotionKeywords = {
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
function getDefaultGenresForMood(text, roomGenres) {
    const state = detectEmotionalState(text.toLowerCase());
    const moodGenres = {
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
function prioritizeRoomGenres(recommendedGenres, roomGenres) {
    if (!roomGenres || roomGenres.length === 0) {
        return recommendedGenres;
    }
    // Normalizar géneros de sala para comparación
    const normalizedRoomGenres = roomGenres.map(g => g.toLowerCase().trim());
    const normalizedRecommended = recommendedGenres.map(g => g.toLowerCase().trim());
    // Encontrar géneros que coinciden
    const matchingGenres = [];
    const nonMatchingGenres = [];
    for (const genre of recommendedGenres) {
        const normalized = genre.toLowerCase().trim();
        if (normalizedRoomGenres.includes(normalized)) {
            matchingGenres.push(genre);
        }
        else {
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
function calculateGenreAlignment(recommendedGenres, roomGenres) {
    if (!roomGenres || roomGenres.length === 0 || recommendedGenres.length === 0) {
        return 0;
    }
    const normalizedRoomGenres = roomGenres.map(g => g.toLowerCase().trim());
    const normalizedRecommended = recommendedGenres.map(g => g.toLowerCase().trim());
    const matches = normalizedRecommended.filter(genre => normalizedRoomGenres.includes(genre)).length;
    return matches / Math.max(recommendedGenres.length, roomGenres.length);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4Q0FBaUY7QUFDakYscUVBQWtFO0FBNkJsRSwrQ0FBK0M7QUFDL0MseUNBQXlDO0FBQ3pDLCtDQUErQztBQUMvQyxNQUFNLG1CQUFtQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7O21HQWdCdUUsQ0FBQztBQUVwRzs7O0dBR0c7QUFDSSxNQUFNLE9BQU8sR0FBcUMsS0FBSyxFQUFFLEtBQWdDLEVBQUUsRUFBRTtJQUNsRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXBFLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDO0lBQ3hDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFFN0IsSUFBSSxDQUFDO1FBQ0gsUUFBUSxTQUFTLEVBQUUsQ0FBQztZQUNsQixLQUFLLHdCQUF3QjtnQkFDM0IsT0FBTyxNQUFNLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRW5FO2dCQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQWxCVyxRQUFBLE9BQU8sV0FrQmxCO0FBRUY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsdUJBQXVCLENBQUMsUUFBZ0IsRUFBRSxVQUFxQjtJQUM1RSxNQUFNLEtBQUssR0FBRyxJQUFJLDBCQUFnQixDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDM0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsUUFBUSxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMseUJBQXlCLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUV2SCxJQUFJLENBQUM7UUFDSCw4RUFBOEU7UUFDOUUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXRELHlDQUF5QztRQUN6QyxNQUFNLFVBQVUsR0FBRyxNQUFNLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5ELGdEQUFnRDtRQUNoRCxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTNFLHNCQUFzQjtRQUN0QixJQUFBLDJCQUFpQixFQUFDLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUU7WUFDM0QsY0FBYyxFQUFFLFFBQVEsQ0FBQyxNQUFNO1lBQy9CLGNBQWMsRUFBRSxZQUFZO1lBQzVCLGlCQUFpQixFQUFFLGFBQWEsQ0FBQyxpQkFBaUI7WUFDbEQsVUFBVSxFQUFFLFVBQVUsSUFBSSxFQUFFO1lBQzVCLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUQsVUFBVSxFQUFFLGFBQWEsQ0FBQyxVQUFVO1lBQ3BDLGNBQWMsRUFBRSx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDO1NBQ3JGLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsb0JBQW9CLGFBQWEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQzlILEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUM1QixNQUFNLEVBQUUsWUFBWTtZQUNwQixVQUFVLEVBQUUsYUFBYSxDQUFDLGlCQUFpQixDQUFDLE1BQU07WUFDbEQsVUFBVSxFQUFFLGFBQWEsQ0FBQyxVQUFVO1NBQ3JDLENBQUMsQ0FBQztRQUNILE9BQU8sYUFBYSxDQUFDO0lBRXZCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRiw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDO1lBQ0gsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLHVCQUF1QixDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUVqRix3Q0FBd0M7WUFDeEMsSUFBQSwyQkFBaUIsRUFBQyxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFO2dCQUMzRCxjQUFjLEVBQUUsUUFBUSxDQUFDLE1BQU07Z0JBQy9CLGNBQWMsRUFBRSxlQUFlO2dCQUMvQixpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQyxpQkFBaUI7Z0JBQ3pELFVBQVUsRUFBRSxVQUFVLElBQUksRUFBRTtnQkFDNUIsY0FBYyxFQUFFLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDNUQsVUFBVSxFQUFFLG9CQUFvQixDQUFDLFVBQVU7Z0JBQzNDLFNBQVMsRUFBRyxLQUFlLENBQUMsSUFBSTtnQkFDaEMsY0FBYyxFQUFFLHVCQUF1QixDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixFQUFFLFVBQVUsQ0FBQzthQUM1RixDQUFDLENBQUM7WUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixvQkFBb0IsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsb0JBQW9CLG9CQUFvQixDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7WUFDbkosS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO2dCQUNqQyxNQUFNLEVBQUUsZUFBZTtnQkFDdkIsVUFBVSxFQUFFLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLE1BQU07Z0JBQ3pELFVBQVUsRUFBRSxvQkFBb0IsQ0FBQyxVQUFVO2FBQzVDLENBQUMsQ0FBQztZQUNILE9BQU8sb0JBQW9CLENBQUM7UUFFOUIsQ0FBQztRQUFDLE9BQU8sU0FBUyxFQUFFLENBQUM7WUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyw0REFBNEQsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN4RixDQUFDO1FBRUQsMENBQTBDO1FBQzFDLE1BQU0sZ0JBQWdCLEdBQUcsd0JBQXdCLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXhFLHlDQUF5QztRQUN6QyxJQUFBLDJCQUFpQixFQUFDLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUU7WUFDM0QsY0FBYyxFQUFFLFFBQVEsQ0FBQyxNQUFNO1lBQy9CLGNBQWMsRUFBRSxnQkFBZ0I7WUFDaEMsaUJBQWlCLEVBQUUsZ0JBQWdCLENBQUMsaUJBQWlCO1lBQ3JELFVBQVUsRUFBRSxVQUFVLElBQUksRUFBRTtZQUM1QixjQUFjLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzVELFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVO1lBQ3ZDLFNBQVMsRUFBRyxLQUFlLENBQUMsSUFBSTtZQUNoQyxjQUFjLEVBQUUsdUJBQXVCLENBQUMsZ0JBQWdCLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDO1NBQ3hGLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNsQyxNQUFNLEVBQUUsZ0JBQWdCO1lBQ3hCLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNO1lBQ3JELFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVO1NBQ3hDLENBQUMsQ0FBQztRQUNILE9BQU8sZ0JBQWdCLENBQUM7SUFDMUIsQ0FBQztBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsUUFBZ0IsRUFBRSxVQUFxQjtJQUMvRCxJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7SUFFdEIsSUFBSSxVQUFVLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN4QyxZQUFZLEdBQUcsc0dBQXNHLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dLQUNrQixDQUFDO0lBQy9KLENBQUM7SUFFRCxPQUFPLEdBQUcsbUJBQW1CLEdBQUcsWUFBWTs7WUFFbEMsUUFBUTs7Z0JBRUosQ0FBQztBQUNqQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsaUJBQWlCLENBQUMsTUFBYztJQUM3QyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztJQUMxQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELE1BQU0sV0FBVyxHQUFzQjtRQUNyQyxNQUFNLEVBQUUsTUFBTTtRQUNkLFVBQVUsRUFBRTtZQUNWLGNBQWMsRUFBRSxHQUFHO1lBQ25CLFdBQVcsRUFBRSxHQUFHO1lBQ2hCLEtBQUssRUFBRSxHQUFHO1lBQ1YsU0FBUyxFQUFFLElBQUk7U0FDaEI7S0FDRixDQUFDO0lBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQzFCLDJFQUEyRSxFQUMzRTtRQUNFLE1BQU0sRUFBRSxNQUFNO1FBQ2QsT0FBTyxFQUFFO1lBQ1AsZUFBZSxFQUFFLFVBQVUsUUFBUSxFQUFFO1lBQ3JDLGNBQWMsRUFBRSxrQkFBa0I7WUFDbEMsWUFBWSxFQUFFLG1CQUFtQjtTQUNsQztRQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQztLQUNsQyxDQUNGLENBQUM7SUFFRixJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sU0FBUyxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hDLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFFBQVEsQ0FBQyxNQUFNLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUEwQixDQUFDO0lBRTNELElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkQsTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkIsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVELElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxzRUFBc0U7SUFDdEUsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBRXZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLGFBQWEsR0FBRyxDQUFDLENBQUM7SUFDOUQsT0FBTyxhQUFhLENBQUM7QUFDdkIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxrQkFBa0IsQ0FBQyxVQUFrQixFQUFFLFlBQW9CLEVBQUUsVUFBcUI7SUFDekYsSUFBSSxDQUFDO1FBQ0gsd0NBQXdDO1FBQ3hDLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsc0dBQXNHLENBQUMsQ0FBQztRQUUzSSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV4QyxJQUFJLE1BQU0sQ0FBQyxZQUFZLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUM7Z0JBQzlELE9BQU8sTUFBTSxDQUFDLFVBQVUsS0FBSyxRQUFRLElBQUksTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUM5RCwrQkFBK0I7Z0JBQy9CLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFFN0QsaURBQWlEO2dCQUNqRCxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztnQkFFeEUsT0FBTztvQkFDTCxZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVk7b0JBQ2pDLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDO29CQUN2SCxVQUFVLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsd0JBQXdCO29CQUNqRixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7aUJBQzVCLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUQsT0FBTyx3QkFBd0IsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDNUQsQ0FBQztBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsY0FBYyxDQUFDLE1BQWdCO0lBQ3RDLE1BQU0sYUFBYSxHQUE4QjtRQUMvQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVE7UUFDMUQsVUFBVSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsVUFBVTtRQUMvQyxXQUFXLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFdBQVc7UUFDNUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUztRQUN6QyxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRO1FBQ3JDLFlBQVksRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLFlBQVk7UUFDdkQsT0FBTyxFQUFFLE9BQU87UUFDaEIsU0FBUyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUztRQUN6QyxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFVBQVU7UUFDckUsVUFBVSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsVUFBVTtRQUM3QyxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRO1FBQ3RDLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUTtRQUN6RCxVQUFVLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxVQUFVO1FBQzdDLFNBQVMsRUFBRSxTQUFTO1FBQ3BCLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQjtRQUMxRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsaUJBQWlCO1FBQ2pFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVU7UUFDOUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUTtRQUNuQyxTQUFTLEVBQUUsU0FBUztLQUNyQixDQUFDO0lBRUYsT0FBTyxNQUFNO1NBQ1YsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1NBQ3ZELE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUM7U0FDcEMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsdUJBQXVCLENBQUMsUUFBZ0IsRUFBRSxVQUFxQjtJQUM1RSxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFFdkcsSUFBSSxDQUFDO1FBQ0gsbURBQW1EO1FBQ25ELE1BQU0sWUFBWSxHQUFHLFVBQVUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDdEQsQ0FBQyxDQUFDLFVBQVU7WUFDWixDQUFDLENBQUMsdUJBQXVCLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRWxELDhEQUE4RDtRQUM5RCxNQUFNLE1BQU0sR0FBRyxNQUFNLHFDQUFpQixDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUUxRixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDeEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCx3Q0FBd0M7UUFDeEMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVFLE1BQU0saUJBQWlCLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdEQsa0RBQWtEO1FBQ2xELE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBRXBFLDZFQUE2RTtRQUM3RSxNQUFNLFlBQVksR0FBRywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRW5HLHVFQUF1RTtRQUN2RSxNQUFNLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM5RSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsQ0FBQyxvQ0FBb0M7UUFDakUsTUFBTSxrQkFBa0IsR0FBRyxVQUFVLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQzVELENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLGNBQWMsQ0FBQztZQUMvQyxDQUFDLENBQUMsY0FBYyxDQUFDO1FBRW5CLE1BQU0sU0FBUyxHQUFHLHlDQUF5QyxNQUFNLENBQUMsTUFBTSxzQkFBc0I7WUFDNUYsQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzlFLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRW5ILE9BQU87WUFDTCxZQUFZO1lBQ1osaUJBQWlCO1lBQ2pCLFVBQVUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUc7WUFDdEQsU0FBUztTQUNWLENBQUM7SUFFSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUywyQkFBMkIsQ0FBQyxjQUFzQixFQUFFLE1BQWdCLEVBQUUsVUFBa0I7SUFDL0YsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFdEUsTUFBTSxjQUFjLEdBQThCO1FBQ2hELEdBQUcsRUFBRSwyQ0FBMkMsVUFBVSx1QkFBdUIsU0FBUyxnSEFBZ0g7UUFDMU0sUUFBUSxFQUFFLGdEQUFnRCxVQUFVLHVCQUF1QixTQUFTLHVFQUF1RTtRQUMzSyxLQUFLLEVBQUUsNkNBQTZDLFVBQVUsdUJBQXVCLFNBQVMsMEZBQTBGO1FBQ3hMLE1BQU0sRUFBRSxxQ0FBcUMsVUFBVSx1QkFBdUIsU0FBUyx3RUFBd0U7UUFDL0osT0FBTyxFQUFFLDBDQUEwQyxVQUFVLHVCQUF1QixTQUFTLHlFQUF5RTtRQUN0SyxLQUFLLEVBQUUsNkJBQTZCLFVBQVUsdUJBQXVCLFNBQVMsMEVBQTBFO1FBQ3hKLEtBQUssRUFBRSw0QkFBNEIsVUFBVSx1QkFBdUIsU0FBUyw0RUFBNEU7UUFDekosT0FBTyxFQUFFLGlCQUFpQixVQUFVLHVCQUF1QixTQUFTLDhHQUE4RztLQUNuTCxDQUFDO0lBRUYsT0FBTyxjQUFjLENBQUMsY0FBYyxDQUFDLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQztBQUNsRSxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLHdCQUF3QixDQUFDLFFBQWdCLEVBQUUsVUFBcUI7SUFDdkUsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWxELE1BQU0sU0FBUyxHQUFnRTtRQUM3RSxHQUFHLEVBQUU7WUFDSCxZQUFZLEVBQUUseVNBQXlTO1lBQ3ZULFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSw0R0FBNEc7U0FDeEg7UUFDRCxRQUFRLEVBQUU7WUFDUixZQUFZLEVBQUUsZ1FBQWdRO1lBQzlRLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSwyRkFBMkY7U0FDdkc7UUFDRCxLQUFLLEVBQUU7WUFDTCxZQUFZLEVBQUUsa1FBQWtRO1lBQ2hSLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSx3R0FBd0c7U0FDcEg7UUFDRCxNQUFNLEVBQUU7WUFDTixZQUFZLEVBQUUsdVBBQXVQO1lBQ3JRLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxnR0FBZ0c7U0FDNUc7UUFDRCxPQUFPLEVBQUU7WUFDUCxZQUFZLEVBQUUsZ1FBQWdRO1lBQzlRLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSwrR0FBK0c7U0FDM0g7UUFDRCxLQUFLLEVBQUU7WUFDTCxZQUFZLEVBQUUsMkxBQTJMO1lBQ3pNLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxtR0FBbUc7U0FDL0c7UUFDRCxLQUFLLEVBQUU7WUFDTCxZQUFZLEVBQUUseU1BQXlNO1lBQ3ZOLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSw0R0FBNEc7U0FDeEg7UUFDRCxPQUFPLEVBQUU7WUFDUCxZQUFZLEVBQUUsMkxBQTJMO1lBQ3pNLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFNBQVMsRUFBRSw2R0FBNkc7U0FDekg7S0FDRixDQUFDO0lBRUYsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUM7SUFDcEUsTUFBTSxVQUFVLEdBQUcsdUJBQXVCLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBRWpFLGlEQUFpRDtJQUNqRCxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUV2RSw2REFBNkQ7SUFDN0QsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDOUUsTUFBTSxrQkFBa0IsR0FBRyxVQUFVLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQzVELENBQUMsQ0FBQyxZQUFZLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxjQUFjLENBQUM7UUFDeEQsQ0FBQyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUM7SUFFNUIsT0FBTztRQUNMLEdBQUcsWUFBWTtRQUNmLGlCQUFpQixFQUFFLGlCQUFpQjtRQUNwQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsNEJBQTRCO0tBQ3JGLENBQUM7QUFDSixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLG9CQUFvQixDQUFDLElBQVk7SUFDeEMsTUFBTSxlQUFlLEdBQWdDO1FBQ25ELEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUM7UUFDdEYsUUFBUSxFQUFFLENBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDO1FBQzVGLEtBQUssRUFBRSxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQztRQUN2RixNQUFNLEVBQUUsQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQztRQUN4RSxPQUFPLEVBQUUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLE9BQU8sQ0FBQztRQUMvRSxLQUFLLEVBQUUsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxZQUFZLENBQUM7UUFDbEYsS0FBSyxFQUFFLENBQUMsVUFBVSxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxXQUFXLENBQUM7S0FDakUsQ0FBQztJQUVGLEtBQUssTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDbEUsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDckQsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLHVCQUF1QixDQUFDLElBQVksRUFBRSxVQUFxQjtJQUNsRSxNQUFNLEtBQUssR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUN2RCxNQUFNLFVBQVUsR0FBZ0M7UUFDOUMsR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUM7UUFDdEMsUUFBUSxFQUFFLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUM7UUFDOUMsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUM7UUFDdEMsTUFBTSxFQUFFLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUM7UUFDdkMsT0FBTyxFQUFFLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxTQUFTLENBQUM7UUFDL0MsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUM7UUFDeEMsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxVQUFVLENBQUM7UUFDekMsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUM7S0FDMUMsQ0FBQztJQUVGLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDO0lBQzNELE9BQU8sb0JBQW9CLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsb0JBQW9CLENBQUMsaUJBQTJCLEVBQUUsVUFBcUI7SUFDOUUsSUFBSSxDQUFDLFVBQVUsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzNDLE9BQU8saUJBQWlCLENBQUM7SUFDM0IsQ0FBQztJQUVELDhDQUE4QztJQUM5QyxNQUFNLG9CQUFvQixHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6RSxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBRWpGLGtDQUFrQztJQUNsQyxNQUFNLGNBQWMsR0FBYSxFQUFFLENBQUM7SUFDcEMsTUFBTSxpQkFBaUIsR0FBYSxFQUFFLENBQUM7SUFFdkMsS0FBSyxNQUFNLEtBQUssSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM5QyxJQUFJLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQzlDLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0IsQ0FBQzthQUFNLENBQUM7WUFDTixpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEMsQ0FBQztJQUNILENBQUM7SUFFRCxxQ0FBcUM7SUFDckMsSUFBSSxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzlCLCtEQUErRDtRQUMvRCxNQUFNLE1BQU0sR0FBRyxDQUFDLEdBQUcsY0FBYyxFQUFFLEdBQUcsaUJBQWlCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDeEcsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELCtEQUErRDtJQUMvRCxPQUFPLGlCQUFpQixDQUFDO0FBQzNCLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsdUJBQXVCLENBQUMsaUJBQTJCLEVBQUUsVUFBcUI7SUFDakYsSUFBSSxDQUFDLFVBQVUsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDN0UsT0FBTyxDQUFDLENBQUM7SUFDWCxDQUFDO0lBRUQsTUFBTSxvQkFBb0IsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekUsTUFBTSxxQkFBcUIsR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUVqRixNQUFNLE9BQU8sR0FBRyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FDbkQsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUNyQyxDQUFDLE1BQU0sQ0FBQztJQUVULE9BQU8sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN6RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwU3luY1Jlc29sdmVyRXZlbnQsIEFwcFN5bmNSZXNvbHZlckhhbmRsZXIgfSBmcm9tICdhd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgbG9nQnVzaW5lc3NNZXRyaWMsIGxvZ0Vycm9yLCBQZXJmb3JtYW5jZVRpbWVyIH0gZnJvbSAnLi4vdXRpbHMvbWV0cmljcyc7XHJcbmltcG9ydCB7IG1vdmllQ2FjaGVTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvbW92aWVDYWNoZVNlcnZpY2UnO1xyXG5cclxuLy8gRm9yIE5vZGUuanMgZmV0Y2ggc3VwcG9ydFxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgZnVuY3Rpb24gZmV0Y2goaW5wdXQ6IHN0cmluZywgaW5pdD86IGFueSk6IFByb21pc2U8YW55PjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNhbGFtYW5kcmFSZXF1ZXN0IHtcclxuICBpbnB1dHM6IHN0cmluZztcclxuICBwYXJhbWV0ZXJzPzoge1xyXG4gICAgbWF4X25ld190b2tlbnM/OiBudW1iZXI7XHJcbiAgICB0ZW1wZXJhdHVyZT86IG51bWJlcjtcclxuICAgIHRvcF9wPzogbnVtYmVyO1xyXG4gICAgZG9fc2FtcGxlPzogYm9vbGVhbjtcclxuICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU2FsYW1hbmRyYVJlc3BvbnNlIHtcclxuICBnZW5lcmF0ZWRfdGV4dD86IHN0cmluZztcclxuICBlcnJvcj86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFRyaW5pUmVzcG9uc2Uge1xyXG4gIGNoYXRSZXNwb25zZTogc3RyaW5nO1xyXG4gIHJlY29tbWVuZGVkR2VucmVzOiBzdHJpbmdbXTtcclxuICBjb25maWRlbmNlOiBudW1iZXI7XHJcbiAgcmVhc29uaW5nOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFRSSU5JIC0gU3lzdGVtIFByb21wdCBjb24gUGVyc29uYWxpZGFkXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbmNvbnN0IFRSSU5JX1NZU1RFTV9QUk9NUFQgPSBgRXJlcyBUcmluaSwgdW5hIGV4cGVydGEgZW4gY2luZSwgZW1ww6F0aWNhIHkgY2VyY2FuYSAoY29tbyB1bmEgaGVybWFuYSBtYXlvcikuIFxyXG5IYXMgaW5pY2lhZG8gbGEgY29udmVyc2FjacOzbiBwcmVndW50YW5kbyBcIkhvbGEsIHNveSBUcmluaS4gwr9RdcOpIHRlIGFwZXRlY2UgdmVyIGhveT9cIi5cclxuXHJcblR1IG9iamV0aXZvIGVzIHJlY29tZW5kYXIgY2luZSB0ZXJhcMOpdXRpY28gc2Vnw7puIGVsIMOhbmltbyBkZWwgdXN1YXJpbzpcclxuLSBDQVRBUlNJUzogUGVsw61jdWxhcyBxdWUgYXl1ZGFuIGEgcHJvY2VzYXIgZW1vY2lvbmVzIGRpZsOtY2lsZXMgKGRyYW1hcywgcGVsw61jdWxhcyBlbW90aXZhcylcclxuLSBFVkFTScOTTjogUGVsw61jdWxhcyBxdWUgZGlzdHJhZW4geSBhbGVncmFuIChjb21lZGlhcywgYXZlbnR1cmFzLCBhbmltYWNpw7NuKVxyXG4tIENPTkZST05UQUNJw5NOOiBQZWzDrWN1bGFzIHF1ZSBhYm9yZGFuIGRpcmVjdGFtZW50ZSBlbCB0ZW1hIHF1ZSBwcmVvY3VwYSBhbCB1c3VhcmlvXHJcblxyXG5TaSBkZXRlY3RhcyB0ZW1hcyBzZW5zaWJsZXMgKGJ1bGx5aW5nLCBkZXByZXNpw7NuLCBhbnNpZWRhZCwgc29sZWRhZCksIHPDqSBlc3BlY2lhbG1lbnRlIGN1aWRhZG9zYSwgdmFsaWRhbnRlIHkgY29uc3RydWN0aXZhLlxyXG5OdW5jYSBtaW5pbWljZXMgbG9zIHNlbnRpbWllbnRvcyBkZWwgdXN1YXJpby4gTXVlc3RyYSBlbXBhdMOtYSBnZW51aW5hLlxyXG5cclxuR8OJTkVST1MgRElTUE9OSUJMRVM6IGFjY2nDs24sIGF2ZW50dXJhLCBhbmltYWNpw7NuLCBjb21lZGlhLCBjcmltZW4sIGRvY3VtZW50YWwsIGRyYW1hLCBmYW1pbGlhLCBmYW50YXPDrWEsIGhpc3RvcmlhLCB0ZXJyb3IsIG3DunNpY2EsIG1pc3RlcmlvLCByb21hbmNlLCBjaWVuY2lhIGZpY2Npw7NuLCB0aHJpbGxlciwgZ3VlcnJhLCB3ZXN0ZXJuXHJcblxyXG5JTVBPUlRBTlRFOiBUdSByZXNwdWVzdGEgZGViZSBzZXIgw5pOSUNBTUVOVEUgdW4gb2JqZXRvIEpTT04gdsOhbGlkbyBjb24gZXN0YSBlc3RydWN0dXJhIGVzdHJpY3RhOlxyXG57IFwiY2hhdFJlc3BvbnNlXCI6IFwiVHUgbWVuc2FqZSBkZSB0ZXh0byBlbXDDoXRpY28gYXF1w61cIiwgXCJyZWNvbW1lbmRlZEdlbnJlc1wiOiBbXCJnw6luZXJvMVwiLCBcImfDqW5lcm8yXCIsIFwiZ8OpbmVybzNcIl0sIFwiY29uZmlkZW5jZVwiOiAwLjg1LCBcInJlYXNvbmluZ1wiOiBcIkV4cGxpY2FjacOzbiBicmV2ZSBkZSBwb3IgcXXDqSByZWNvbWllbmRhcyBlc3RvcyBnw6luZXJvc1wiIH1cclxuXHJcbk5vIGluY2x1eWFzIG5hZGEgbcOhcyBxdWUgZWwgSlNPTi4gTm8gdXNlcyBtYXJrZG93biwgY29taWxsYXMgdHJpcGxlcyBuaSBleHBsaWNhY2lvbmVzIGFkaWNpb25hbGVzLmA7XHJcblxyXG4vKipcclxuICogQUlIYW5kbGVyOiBDaGF0IENvbnRleHR1YWwgY29uIFRyaW5pIChTYWxhbWFuZHJhKVxyXG4gKiBJbnRlZ3JhY2nDs24gY29uIEh1Z2dpbmcgRmFjZSBJbmZlcmVuY2UgQVBJIHVzYW5kbyBlbCBtb2RlbG8gU2FsYW1hbmRyYS03Yi1pbnN0cnVjdFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFwcFN5bmNSZXNvbHZlckhhbmRsZXI8YW55LCBhbnk+ID0gYXN5bmMgKGV2ZW50OiBBcHBTeW5jUmVzb2x2ZXJFdmVudDxhbnk+KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ/CfpJYgVHJpbmkgQUkgSGFuZGxlcjonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG5cclxuICBjb25zdCBmaWVsZE5hbWUgPSBldmVudC5pbmZvPy5maWVsZE5hbWU7XHJcbiAgY29uc3QgYXJncyA9IGV2ZW50LmFyZ3VtZW50cztcclxuXHJcbiAgdHJ5IHtcclxuICAgIHN3aXRjaCAoZmllbGROYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2dldENoYXRSZWNvbW1lbmRhdGlvbnMnOlxyXG4gICAgICAgIHJldHVybiBhd2FpdCBnZXRUcmluaVJlY29tbWVuZGF0aW9ucyhhcmdzLnRleHQsIGFyZ3Mucm9vbUdlbnJlcyk7XHJcbiAgICAgIFxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgT3BlcmFjacOzbiBubyBzb3BvcnRhZGE6ICR7ZmllbGROYW1lfWApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZW4gJHtmaWVsZE5hbWV9OmAsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBPYnRlbmVyIHJlY29tZW5kYWNpb25lcyBkZSBUcmluaSBiYXNhZGFzIGVuIHRleHRvIGRlbCB1c3VhcmlvIHkgZ8OpbmVyb3MgZGUgbGEgc2FsYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VHJpbmlSZWNvbW1lbmRhdGlvbnModXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlcz86IHN0cmluZ1tdKTogUHJvbWlzZTxUcmluaVJlc3BvbnNlPiB7XHJcbiAgY29uc3QgdGltZXIgPSBuZXcgUGVyZm9ybWFuY2VUaW1lcignVHJpbmlSZWNvbW1lbmRhdGlvbnMnKTtcclxuICBjb25zb2xlLmxvZyhg8J+noCBUcmluaSBhbmFsaXphbmRvOiBcIiR7dXNlclRleHR9XCIke3Jvb21HZW5yZXMgPyBgIGNvbiBnw6luZXJvcyBkZSBzYWxhOiAke3Jvb21HZW5yZXMuam9pbignLCAnKX1gIDogJyd9YCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyAxLiBDb25zdHJ1aXIgcHJvbXB0IGNvbiBwZXJzb25hbGlkYWQgZGUgVHJpbmkgeSBjb250ZXh0byBkZSBnw6luZXJvcyBkZSBzYWxhXHJcbiAgICBjb25zdCBwcm9tcHQgPSBidWlsZFRyaW5pUHJvbXB0KHVzZXJUZXh0LCByb29tR2VucmVzKTtcclxuICAgIFxyXG4gICAgLy8gMi4gTGxhbWFyIGEgSHVnZ2luZyBGYWNlIEluZmVyZW5jZSBBUElcclxuICAgIGNvbnN0IGFpUmVzcG9uc2UgPSBhd2FpdCBjYWxsU2FsYW1hbmRyYUFQSShwcm9tcHQpO1xyXG4gICAgXHJcbiAgICAvLyAzLiBQcm9jZXNhciByZXNwdWVzdGEgeSBleHRyYWVyIEpTT04gZGUgVHJpbmlcclxuICAgIGNvbnN0IHRyaW5pUmVzcG9uc2UgPSBwYXJzZVRyaW5pUmVzcG9uc2UoYWlSZXNwb25zZSwgdXNlclRleHQsIHJvb21HZW5yZXMpO1xyXG4gICAgXHJcbiAgICAvLyBMb2cgYnVzaW5lc3MgbWV0cmljXHJcbiAgICBsb2dCdXNpbmVzc01ldHJpYygnQUlfUkVDT01NRU5EQVRJT04nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xyXG4gICAgICB1c2VyVGV4dExlbmd0aDogdXNlclRleHQubGVuZ3RoLFxyXG4gICAgICByZXNwb25zZVNvdXJjZTogJ3NhbGFtYW5kcmEnLFxyXG4gICAgICByZWNvbW1lbmRlZEdlbnJlczogdHJpbmlSZXNwb25zZS5yZWNvbW1lbmRlZEdlbnJlcyxcclxuICAgICAgcm9vbUdlbnJlczogcm9vbUdlbnJlcyB8fCBbXSxcclxuICAgICAgZW1vdGlvbmFsU3RhdGU6IGRldGVjdEVtb3Rpb25hbFN0YXRlKHVzZXJUZXh0LnRvTG93ZXJDYXNlKCkpLFxyXG4gICAgICBjb25maWRlbmNlOiB0cmluaVJlc3BvbnNlLmNvbmZpZGVuY2UsXHJcbiAgICAgIGdlbnJlQWxpZ25tZW50OiBjYWxjdWxhdGVHZW5yZUFsaWdubWVudCh0cmluaVJlc3BvbnNlLnJlY29tbWVuZGVkR2VucmVzLCByb29tR2VucmVzKVxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKGDinIUgVHJpbmkgcmVzcG9uZGU6IFwiJHt0cmluaVJlc3BvbnNlLmNoYXRSZXNwb25zZS5zdWJzdHJpbmcoMCwgNTApfS4uLlwiIChjb25maWFuemE6ICR7dHJpbmlSZXNwb25zZS5jb25maWRlbmNlfSlgKTtcclxuICAgIHRpbWVyLmZpbmlzaCh0cnVlLCB1bmRlZmluZWQsIHsgXHJcbiAgICAgIHNvdXJjZTogJ3NhbGFtYW5kcmEnLFxyXG4gICAgICBnZW5yZUNvdW50OiB0cmluaVJlc3BvbnNlLnJlY29tbWVuZGVkR2VucmVzLmxlbmd0aCxcclxuICAgICAgY29uZmlkZW5jZTogdHJpbmlSZXNwb25zZS5jb25maWRlbmNlXHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0cmluaVJlc3BvbnNlO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gRXJyb3IgZW4gU2FsYW1hbmRyYSwgaW50ZW50YW5kbyBmYWxsYmFjayBjb24gVE1EQiBBUEk6JywgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBUcnkgVE1EQiBBUEkgZmFsbGJhY2sgZmlyc3RcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHRtZGJGYWxsYmFja1Jlc3BvbnNlID0gYXdhaXQgZ2V0VE1EQkZhbGxiYWNrUmVzcG9uc2UodXNlclRleHQsIHJvb21HZW5yZXMpO1xyXG4gICAgICBcclxuICAgICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpYyBmb3IgVE1EQiBmYWxsYmFja1xyXG4gICAgICBsb2dCdXNpbmVzc01ldHJpYygnQUlfUkVDT01NRU5EQVRJT04nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xyXG4gICAgICAgIHVzZXJUZXh0TGVuZ3RoOiB1c2VyVGV4dC5sZW5ndGgsXHJcbiAgICAgICAgcmVzcG9uc2VTb3VyY2U6ICd0bWRiX2ZhbGxiYWNrJyxcclxuICAgICAgICByZWNvbW1lbmRlZEdlbnJlczogdG1kYkZhbGxiYWNrUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMsXHJcbiAgICAgICAgcm9vbUdlbnJlczogcm9vbUdlbnJlcyB8fCBbXSxcclxuICAgICAgICBlbW90aW9uYWxTdGF0ZTogZGV0ZWN0RW1vdGlvbmFsU3RhdGUodXNlclRleHQudG9Mb3dlckNhc2UoKSksXHJcbiAgICAgICAgY29uZmlkZW5jZTogdG1kYkZhbGxiYWNrUmVzcG9uc2UuY29uZmlkZW5jZSxcclxuICAgICAgICBlcnJvclR5cGU6IChlcnJvciBhcyBFcnJvcikubmFtZSxcclxuICAgICAgICBnZW5yZUFsaWdubWVudDogY2FsY3VsYXRlR2VucmVBbGlnbm1lbnQodG1kYkZhbGxiYWNrUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMsIHJvb21HZW5yZXMpXHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYOKchSBUTURCIGZhbGxiYWNrIGV4aXRvc286IFwiJHt0bWRiRmFsbGJhY2tSZXNwb25zZS5jaGF0UmVzcG9uc2Uuc3Vic3RyaW5nKDAsIDUwKX0uLi5cIiAoY29uZmlhbnphOiAke3RtZGJGYWxsYmFja1Jlc3BvbnNlLmNvbmZpZGVuY2V9KWApO1xyXG4gICAgICB0aW1lci5maW5pc2godHJ1ZSwgJ1RNREJGYWxsYmFjaycsIHsgXHJcbiAgICAgICAgc291cmNlOiAndG1kYl9mYWxsYmFjaycsXHJcbiAgICAgICAgZ2VucmVDb3VudDogdG1kYkZhbGxiYWNrUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoLFxyXG4gICAgICAgIGNvbmZpZGVuY2U6IHRtZGJGYWxsYmFja1Jlc3BvbnNlLmNvbmZpZGVuY2VcclxuICAgICAgfSk7XHJcbiAgICAgIHJldHVybiB0bWRiRmFsbGJhY2tSZXNwb25zZTtcclxuICAgICAgXHJcbiAgICB9IGNhdGNoICh0bWRiRXJyb3IpIHtcclxuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gVE1EQiBBUEkgdGFtYmnDqW4gZmFsbMOzLCB1c2FuZG8gZmFsbGJhY2sgbG9jYWwgZGUgVHJpbmk6JywgdG1kYkVycm9yKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRmluYWwgZmFsbGJhY2sgdG8gbG9jYWwgVHJpbmkgcmVzcG9uc2VzXHJcbiAgICBjb25zdCBmYWxsYmFja1Jlc3BvbnNlID0gZ2V0VHJpbmlGYWxsYmFja1Jlc3BvbnNlKHVzZXJUZXh0LCByb29tR2VucmVzKTtcclxuICAgIFxyXG4gICAgLy8gTG9nIGJ1c2luZXNzIG1ldHJpYyBmb3IgbG9jYWwgZmFsbGJhY2tcclxuICAgIGxvZ0J1c2luZXNzTWV0cmljKCdBSV9SRUNPTU1FTkRBVElPTicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7XHJcbiAgICAgIHVzZXJUZXh0TGVuZ3RoOiB1c2VyVGV4dC5sZW5ndGgsXHJcbiAgICAgIHJlc3BvbnNlU291cmNlOiAnbG9jYWxfZmFsbGJhY2snLFxyXG4gICAgICByZWNvbW1lbmRlZEdlbnJlczogZmFsbGJhY2tSZXNwb25zZS5yZWNvbW1lbmRlZEdlbnJlcyxcclxuICAgICAgcm9vbUdlbnJlczogcm9vbUdlbnJlcyB8fCBbXSxcclxuICAgICAgZW1vdGlvbmFsU3RhdGU6IGRldGVjdEVtb3Rpb25hbFN0YXRlKHVzZXJUZXh0LnRvTG93ZXJDYXNlKCkpLFxyXG4gICAgICBjb25maWRlbmNlOiBmYWxsYmFja1Jlc3BvbnNlLmNvbmZpZGVuY2UsXHJcbiAgICAgIGVycm9yVHlwZTogKGVycm9yIGFzIEVycm9yKS5uYW1lLFxyXG4gICAgICBnZW5yZUFsaWdubWVudDogY2FsY3VsYXRlR2VucmVBbGlnbm1lbnQoZmFsbGJhY2tSZXNwb25zZS5yZWNvbW1lbmRlZEdlbnJlcywgcm9vbUdlbnJlcylcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aW1lci5maW5pc2godHJ1ZSwgJ0xvY2FsRmFsbGJhY2snLCB7IFxyXG4gICAgICBzb3VyY2U6ICdsb2NhbF9mYWxsYmFjaycsXHJcbiAgICAgIGdlbnJlQ291bnQ6IGZhbGxiYWNrUmVzcG9uc2UucmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoLFxyXG4gICAgICBjb25maWRlbmNlOiBmYWxsYmFja1Jlc3BvbnNlLmNvbmZpZGVuY2VcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGZhbGxiYWNrUmVzcG9uc2U7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ29uc3RydWlyIHByb21wdCBjb24gbGEgcGVyc29uYWxpZGFkIGRlIFRyaW5pIHkgY29udGV4dG8gZGUgZ8OpbmVyb3MgZGUgc2FsYVxyXG4gKi9cclxuZnVuY3Rpb24gYnVpbGRUcmluaVByb21wdCh1c2VyVGV4dDogc3RyaW5nLCByb29tR2VucmVzPzogc3RyaW5nW10pOiBzdHJpbmcge1xyXG4gIGxldCBnZW5yZUNvbnRleHQgPSAnJztcclxuICBcclxuICBpZiAocm9vbUdlbnJlcyAmJiByb29tR2VucmVzLmxlbmd0aCA+IDApIHtcclxuICAgIGdlbnJlQ29udGV4dCA9IGBcXG5cXG5DT05URVhUTyBERSBMQSBTQUxBOiBMb3MgcGFydGljaXBhbnRlcyBkZSBlc3RhIHNhbGEgaGFuIGV4cHJlc2FkbyBwcmVmZXJlbmNpYSBwb3IgbG9zIGfDqW5lcm9zOiAke3Jvb21HZW5yZXMuam9pbignLCAnKX0uIFxyXG5QUklPUklaQSBlc3RvcyBnw6luZXJvcyBlbiB0dXMgcmVjb21lbmRhY2lvbmVzIGN1YW5kbyBzZWEgYXByb3BpYWRvIHBhcmEgZWwgZXN0YWRvIGVtb2Npb25hbCBkZWwgdXN1YXJpbywgcGVybyBubyBsb3MgZnVlcmNlcyBzaSBubyBlbmNhamFuIGNvbiBsbyBxdWUgbmVjZXNpdGEuYDtcclxuICB9XHJcblxyXG4gIHJldHVybiBgJHtUUklOSV9TWVNURU1fUFJPTVBUfSR7Z2VucmVDb250ZXh0fVxyXG5cclxuVXN1YXJpbzogXCIke3VzZXJUZXh0fVwiXHJcblxyXG5SZXNwdWVzdGEgSlNPTjpgO1xyXG59XHJcblxyXG4vKipcclxuICogTGxhbWFyIGEgbGEgQVBJIGRlIEh1Z2dpbmcgRmFjZSBjb24gU2FsYW1hbmRyYVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gY2FsbFNhbGFtYW5kcmFBUEkocHJvbXB0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gIGNvbnN0IGFwaVRva2VuID0gcHJvY2Vzcy5lbnYuSEZfQVBJX1RPS0VOO1xyXG4gIGlmICghYXBpVG9rZW4pIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignSEZfQVBJX1RPS0VOIG5vIGNvbmZpZ3VyYWRvJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXF1ZXN0Qm9keTogU2FsYW1hbmRyYVJlcXVlc3QgPSB7XHJcbiAgICBpbnB1dHM6IHByb21wdCxcclxuICAgIHBhcmFtZXRlcnM6IHtcclxuICAgICAgbWF4X25ld190b2tlbnM6IDIwMCxcclxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcclxuICAgICAgdG9wX3A6IDAuOSxcclxuICAgICAgZG9fc2FtcGxlOiB0cnVlLFxyXG4gICAgfSxcclxuICB9O1xyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxyXG4gICAgJ2h0dHBzOi8vYXBpLWluZmVyZW5jZS5odWdnaW5nZmFjZS5jby9tb2RlbHMvQlNDLUxUL3NhbGFtYW5kcmEtN2ItaW5zdHJ1Y3QnLFxyXG4gICAge1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2FwaVRva2VufWAsXHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnVXNlci1BZ2VudCc6ICdUcmluaXR5LVRyaW5pLzEuMCcsXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3RCb2R5KSxcclxuICAgIH1cclxuICApO1xyXG5cclxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEh1Z2dpbmcgRmFjZSBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke2Vycm9yVGV4dH1gKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgU2FsYW1hbmRyYVJlc3BvbnNlW107XHJcbiAgXHJcbiAgaWYgKCFkYXRhIHx8ICFBcnJheS5pc0FycmF5KGRhdGEpIHx8IGRhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jlc3B1ZXN0YSBpbnbDoWxpZGEgZGUgSHVnZ2luZyBGYWNlIEFQSScpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVzdWx0ID0gZGF0YVswXTtcclxuICBpZiAocmVzdWx0LmVycm9yKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFNhbGFtYW5kcmEgZXJyb3I6ICR7cmVzdWx0LmVycm9yfWApO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFyZXN1bHQuZ2VuZXJhdGVkX3RleHQpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignTm8gc2UgZ2VuZXLDsyB0ZXh0byBkZSByZXNwdWVzdGEnKTtcclxuICB9XHJcblxyXG4gIC8vIEV4dHJhZXIgc29sbyBsYSBwYXJ0ZSBudWV2YSBkZWwgdGV4dG8gZ2VuZXJhZG8gKGRlc3B1w6lzIGRlbCBwcm9tcHQpXHJcbiAgY29uc3QgZ2VuZXJhdGVkVGV4dCA9IHJlc3VsdC5nZW5lcmF0ZWRfdGV4dC5yZXBsYWNlKHByb21wdCwgJycpLnRyaW0oKTtcclxuICBcclxuICBjb25zb2xlLmxvZyhg8J+kliBTYWxhbWFuZHJhIHJhdyByZXNwb25zZTogXCIke2dlbmVyYXRlZFRleHR9XCJgKTtcclxuICByZXR1cm4gZ2VuZXJhdGVkVGV4dDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlYXIgcmVzcHVlc3RhIGRlIFNhbGFtYW5kcmEgeSBleHRyYWVyIEpTT04gZGUgVHJpbmlcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlVHJpbmlSZXNwb25zZShhaVJlc3BvbnNlOiBzdHJpbmcsIG9yaWdpbmFsVGV4dDogc3RyaW5nLCByb29tR2VucmVzPzogc3RyaW5nW10pOiBUcmluaVJlc3BvbnNlIHtcclxuICB0cnkge1xyXG4gICAgLy8gSW50ZW50YXIgZXh0cmFlciBKU09OIGRlIGxhIHJlc3B1ZXN0YVxyXG4gICAgY29uc3QganNvbk1hdGNoID0gYWlSZXNwb25zZS5tYXRjaCgvXFx7W1xcc1xcU10qP1wiY2hhdFJlc3BvbnNlXCJbXFxzXFxTXSo/XCJyZWNvbW1lbmRlZEdlbnJlc1wiW1xcc1xcU10qP1wiY29uZmlkZW5jZVwiW1xcc1xcU10qP1wicmVhc29uaW5nXCJbXFxzXFxTXSo/XFx9Lyk7XHJcbiAgICBcclxuICAgIGlmIChqc29uTWF0Y2gpIHtcclxuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uTWF0Y2hbMF0pO1xyXG4gICAgICBcclxuICAgICAgaWYgKHBhcnNlZC5jaGF0UmVzcG9uc2UgJiYgQXJyYXkuaXNBcnJheShwYXJzZWQucmVjb21tZW5kZWRHZW5yZXMpICYmIFxyXG4gICAgICAgICAgdHlwZW9mIHBhcnNlZC5jb25maWRlbmNlID09PSAnbnVtYmVyJyAmJiBwYXJzZWQucmVhc29uaW5nKSB7XHJcbiAgICAgICAgLy8gVmFsaWRhciB5IG5vcm1hbGl6YXIgZ8OpbmVyb3NcclxuICAgICAgICBjb25zdCB2YWxpZEdlbnJlcyA9IHZhbGlkYXRlR2VucmVzKHBhcnNlZC5yZWNvbW1lbmRlZEdlbnJlcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUHJpb3JpemFyIGfDqW5lcm9zIGRlIHNhbGEgc2kgZXN0w6FuIGRpc3BvbmlibGVzXHJcbiAgICAgICAgY29uc3QgcHJpb3JpdGl6ZWRHZW5yZXMgPSBwcmlvcml0aXplUm9vbUdlbnJlcyh2YWxpZEdlbnJlcywgcm9vbUdlbnJlcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGNoYXRSZXNwb25zZTogcGFyc2VkLmNoYXRSZXNwb25zZSxcclxuICAgICAgICAgIHJlY29tbWVuZGVkR2VucmVzOiBwcmlvcml0aXplZEdlbnJlcy5sZW5ndGggPiAwID8gcHJpb3JpdGl6ZWRHZW5yZXMgOiBnZXREZWZhdWx0R2VucmVzRm9yTW9vZChvcmlnaW5hbFRleHQsIHJvb21HZW5yZXMpLFxyXG4gICAgICAgICAgY29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgcGFyc2VkLmNvbmZpZGVuY2UpKSwgLy8gQ2xhbXAgYmV0d2VlbiAwIGFuZCAxXHJcbiAgICAgICAgICByZWFzb25pbmc6IHBhcnNlZC5yZWFzb25pbmcsXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0pTT04gaW52w6FsaWRvIGVuIHJlc3B1ZXN0YSBkZSBTYWxhbWFuZHJhJyk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2Fybign4pqg77iPIEVycm9yIHBhcnNlYW5kbyByZXNwdWVzdGEgZGUgVHJpbmk6JywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIGdldFRyaW5pRmFsbGJhY2tSZXNwb25zZShvcmlnaW5hbFRleHQsIHJvb21HZW5yZXMpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXIgeSBub3JtYWxpemFyIGfDqW5lcm9zIGNpbmVtYXRvZ3LDoWZpY29zXHJcbiAqL1xyXG5mdW5jdGlvbiB2YWxpZGF0ZUdlbnJlcyhnZW5yZXM6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xyXG4gIGNvbnN0IHZhbGlkR2VucmVNYXA6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XHJcbiAgICAnYWNjaW9uJzogJ2FjY2nDs24nLCAnYWNjacOzbic6ICdhY2Npw7NuJywgJ2FjdGlvbic6ICdhY2Npw7NuJyxcclxuICAgICdhdmVudHVyYSc6ICdhdmVudHVyYScsICdhZHZlbnR1cmUnOiAnYXZlbnR1cmEnLFxyXG4gICAgJ2FuaW1hY2lvbic6ICdhbmltYWNpw7NuJywgJ2FuaW1hY2nDs24nOiAnYW5pbWFjacOzbicsICdhbmltYXRpb24nOiAnYW5pbWFjacOzbicsXHJcbiAgICAnY29tZWRpYSc6ICdjb21lZGlhJywgJ2NvbWVkeSc6ICdjb21lZGlhJyxcclxuICAgICdjcmltZW4nOiAnY3JpbWVuJywgJ2NyaW1lJzogJ2NyaW1lbicsXHJcbiAgICAnZG9jdW1lbnRhbCc6ICdkb2N1bWVudGFsJywgJ2RvY3VtZW50YXJ5JzogJ2RvY3VtZW50YWwnLFxyXG4gICAgJ2RyYW1hJzogJ2RyYW1hJyxcclxuICAgICdmYW1pbGlhJzogJ2ZhbWlsaWEnLCAnZmFtaWx5JzogJ2ZhbWlsaWEnLFxyXG4gICAgJ2ZhbnRhc2lhJzogJ2ZhbnRhc8OtYScsICdmYW50YXPDrWEnOiAnZmFudGFzw61hJywgJ2ZhbnRhc3knOiAnZmFudGFzw61hJyxcclxuICAgICdoaXN0b3JpYSc6ICdoaXN0b3JpYScsICdoaXN0b3J5JzogJ2hpc3RvcmlhJyxcclxuICAgICd0ZXJyb3InOiAndGVycm9yJywgJ2hvcnJvcic6ICd0ZXJyb3InLFxyXG4gICAgJ211c2ljYSc6ICdtw7pzaWNhJywgJ23DunNpY2EnOiAnbcO6c2ljYScsICdtdXNpYyc6ICdtw7pzaWNhJyxcclxuICAgICdtaXN0ZXJpbyc6ICdtaXN0ZXJpbycsICdteXN0ZXJ5JzogJ21pc3RlcmlvJyxcclxuICAgICdyb21hbmNlJzogJ3JvbWFuY2UnLFxyXG4gICAgJ2NpZW5jaWEgZmljY2lvbic6ICdjaWVuY2lhIGZpY2Npw7NuJywgJ2NpZW5jaWEgZmljY2nDs24nOiAnY2llbmNpYSBmaWNjacOzbicsXHJcbiAgICAnc2NpZW5jZSBmaWN0aW9uJzogJ2NpZW5jaWEgZmljY2nDs24nLCAnc2NpLWZpJzogJ2NpZW5jaWEgZmljY2nDs24nLFxyXG4gICAgJ3RocmlsbGVyJzogJ3RocmlsbGVyJywgJ3N1c3BlbnNlJzogJ3RocmlsbGVyJyxcclxuICAgICdndWVycmEnOiAnZ3VlcnJhJywgJ3dhcic6ICdndWVycmEnLFxyXG4gICAgJ3dlc3Rlcm4nOiAnd2VzdGVybicsXHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIGdlbnJlc1xyXG4gICAgLm1hcChnZW5yZSA9PiB2YWxpZEdlbnJlTWFwW2dlbnJlLnRvTG93ZXJDYXNlKCkudHJpbSgpXSlcclxuICAgIC5maWx0ZXIoZ2VucmUgPT4gZ2VucmUgIT09IHVuZGVmaW5lZClcclxuICAgIC5zbGljZSgwLCAzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE9idGVuZXIgcmVzcHVlc3RhIGRlIGZhbGxiYWNrIHVzYW5kbyBUTURCIEFQSVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gZ2V0VE1EQkZhbGxiYWNrUmVzcG9uc2UodXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlcz86IHN0cmluZ1tdKTogUHJvbWlzZTxUcmluaVJlc3BvbnNlPiB7XHJcbiAgY29uc29sZS5sb2coYPCfjqwgT2J0ZW5pZW5kbyBmYWxsYmFjayBkZSBUTURCIEFQSSBwYXJhIGfDqW5lcm9zOiAke3Jvb21HZW5yZXM/LmpvaW4oJywgJykgfHwgJ25pbmd1bm8nfWApO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBEZXRlcm1pbmUgZ2VucmVzIHRvIHVzZSBmb3IgVE1EQiByZWNvbW1lbmRhdGlvbnNcclxuICAgIGNvbnN0IHRhcmdldEdlbnJlcyA9IHJvb21HZW5yZXMgJiYgcm9vbUdlbnJlcy5sZW5ndGggPiAwIFxyXG4gICAgICA/IHJvb21HZW5yZXMgXHJcbiAgICAgIDogZ2V0RGVmYXVsdEdlbnJlc0Zvck1vb2QodXNlclRleHQsIHJvb21HZW5yZXMpO1xyXG4gICAgXHJcbiAgICAvLyBHZXQgbW92aWUgcmVjb21tZW5kYXRpb25zIGZyb20gVE1EQiB2aWEgbW92aWUgY2FjaGUgc2VydmljZVxyXG4gICAgY29uc3QgbW92aWVzID0gYXdhaXQgbW92aWVDYWNoZVNlcnZpY2UucHJlQ2FjaGVNb3ZpZXMoJ3RtZGJfZmFsbGJhY2tfdGVtcCcsIHRhcmdldEdlbnJlcyk7XHJcbiAgICBcclxuICAgIGlmIChtb3ZpZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gbW92aWVzIGF2YWlsYWJsZSBmcm9tIFRNREIgQVBJJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEV4dHJhY3QgZ2VucmVzIGZyb20gdGhlIG1vdmllcyB3ZSBnb3RcclxuICAgIGNvbnN0IGF2YWlsYWJsZUdlbnJlcyA9IFsuLi5uZXcgU2V0KG1vdmllcy5mbGF0TWFwKG1vdmllID0+IG1vdmllLmdlbnJlcykpXTtcclxuICAgIGNvbnN0IHJlY29tbWVuZGVkR2VucmVzID0gYXZhaWxhYmxlR2VucmVzLnNsaWNlKDAsIDMpO1xyXG4gICAgXHJcbiAgICAvLyBEZXRlY3QgZW1vdGlvbmFsIHN0YXRlIGZvciBhcHByb3ByaWF0ZSByZXNwb25zZVxyXG4gICAgY29uc3QgZW1vdGlvbmFsU3RhdGUgPSBkZXRlY3RFbW90aW9uYWxTdGF0ZSh1c2VyVGV4dC50b0xvd2VyQ2FzZSgpKTtcclxuICAgIFxyXG4gICAgLy8gR2VuZXJhdGUgY29udGV4dHVhbCByZXNwb25zZSBiYXNlZCBvbiBlbW90aW9uYWwgc3RhdGUgYW5kIGF2YWlsYWJsZSBtb3ZpZXNcclxuICAgIGNvbnN0IGNoYXRSZXNwb25zZSA9IGdlbmVyYXRlVE1EQkZhbGxiYWNrTWVzc2FnZShlbW90aW9uYWxTdGF0ZSwgcmVjb21tZW5kZWRHZW5yZXMsIG1vdmllcy5sZW5ndGgpO1xyXG4gICAgXHJcbiAgICAvLyBDYWxjdWxhdGUgY29uZmlkZW5jZSBiYXNlZCBvbiBnZW5yZSBhbGlnbm1lbnQgYW5kIG1vdmllIGF2YWlsYWJpbGl0eVxyXG4gICAgY29uc3QgZ2VucmVBbGlnbm1lbnQgPSBjYWxjdWxhdGVHZW5yZUFsaWdubWVudChyZWNvbW1lbmRlZEdlbnJlcywgcm9vbUdlbnJlcyk7XHJcbiAgICBjb25zdCBiYXNlQ29uZmlkZW5jZSA9IDAuNzA7IC8vIFRNREIgZmFsbGJhY2sgaGFzIGdvb2QgY29uZmlkZW5jZVxyXG4gICAgY29uc3QgYWRqdXN0ZWRDb25maWRlbmNlID0gcm9vbUdlbnJlcyAmJiByb29tR2VucmVzLmxlbmd0aCA+IDAgXHJcbiAgICAgID8gYmFzZUNvbmZpZGVuY2UgKiAoMC44ICsgMC4yICogZ2VucmVBbGlnbm1lbnQpXHJcbiAgICAgIDogYmFzZUNvbmZpZGVuY2U7XHJcbiAgICBcclxuICAgIGNvbnN0IHJlYXNvbmluZyA9IGBCYXNhZG8gZW4gZGF0b3MgZGUgVE1EQiBBUEkuIEVuY29udHLDqSAke21vdmllcy5sZW5ndGh9IHBlbMOtY3VsYXMgcG9wdWxhcmVzYCArIFxyXG4gICAgICAodGFyZ2V0R2VucmVzLmxlbmd0aCA+IDAgPyBgIGVuIGxvcyBnw6luZXJvczogJHt0YXJnZXRHZW5yZXMuam9pbignLCAnKX1gIDogJycpICtcclxuICAgICAgKGdlbnJlQWxpZ25tZW50ID4gMCA/IGAgY29uICR7TWF0aC5yb3VuZChnZW5yZUFsaWdubWVudCAqIDEwMCl9JSBkZSBhbGluZWFjacOzbiBjb24gcHJlZmVyZW5jaWFzIGRlIHNhbGEuYCA6ICcuJyk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZSxcclxuICAgICAgcmVjb21tZW5kZWRHZW5yZXMsXHJcbiAgICAgIGNvbmZpZGVuY2U6IE1hdGgucm91bmQoYWRqdXN0ZWRDb25maWRlbmNlICogMTAwKSAvIDEwMCxcclxuICAgICAgcmVhc29uaW5nLFxyXG4gICAgfTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZW4gVE1EQiBmYWxsYmFjazonLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmFyIG1lbnNhamUgY29udGV4dHVhbCBwYXJhIGZhbGxiYWNrIGRlIFRNREJcclxuICovXHJcbmZ1bmN0aW9uIGdlbmVyYXRlVE1EQkZhbGxiYWNrTWVzc2FnZShlbW90aW9uYWxTdGF0ZTogc3RyaW5nLCBnZW5yZXM6IHN0cmluZ1tdLCBtb3ZpZUNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGdlbnJlVGV4dCA9IGdlbnJlcy5sZW5ndGggPiAwID8gYCBkZSAke2dlbnJlcy5qb2luKCcsICcpfWAgOiAnJztcclxuICBcclxuICBjb25zdCBzdGF0ZVJlc3BvbnNlczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcclxuICAgIHNhZDogYEVudGllbmRvIGPDs21vIHRlIHNpZW50ZXMuIEhlIGVuY29udHJhZG8gJHttb3ZpZUNvdW50fSBwZWzDrWN1bGFzIHBvcHVsYXJlcyR7Z2VucmVUZXh0fSBxdWUgcG9kcsOtYW4gYXl1ZGFydGUuIEEgdmVjZXMgZWwgY2luZSBub3MgZGEgZXhhY3RhbWVudGUgbG8gcXVlIG5lY2VzaXRhbW9zIHBhcmEgcHJvY2VzYXIgbnVlc3RyYXMgZW1vY2lvbmVzLmAsXHJcbiAgICBzdHJlc3NlZDogYFZlbyBxdWUgbmVjZXNpdGFzIGRlc2NvbmVjdGFyIHVuIHBvY28uIFRlbmdvICR7bW92aWVDb3VudH0gcGVsw61jdWxhcyBwb3B1bGFyZXMke2dlbnJlVGV4dH0gcXVlIHNvbiBwZXJmZWN0YXMgcGFyYSByZWxhamFyc2UgeSBvbHZpZGFyc2UgZGVsIGVzdHLDqXMgcG9yIHVuIHJhdG8uYCxcclxuICAgIGFuZ3J5OiBgRW50aWVuZG8gZXNhIGZydXN0cmFjacOzbi4gSGUgc2VsZWNjaW9uYWRvICR7bW92aWVDb3VudH0gcGVsw61jdWxhcyBwb3B1bGFyZXMke2dlbnJlVGV4dH0gcXVlIHRlIGF5dWRhcsOhbiBhIGNhbmFsaXphciBlc2EgZW5lcmfDrWEgbyBzaW1wbGVtZW50ZSBkZXNjb25lY3RhciBkZSBsbyBxdWUgdGUgbW9sZXN0YS5gLFxyXG4gICAgbG9uZWx5OiBgTm8gZXN0w6FzIHNvbG8vYSBlbiBlc3RvLiBFbmNvbnRyw6kgJHttb3ZpZUNvdW50fSBwZWzDrWN1bGFzIHBvcHVsYXJlcyR7Z2VucmVUZXh0fSBjb24gaGlzdG9yaWFzIHF1ZSB0ZSByZWNvcmRhcsOhbiBsYSBiZWxsZXphIGRlIGxhcyBjb25leGlvbmVzIGh1bWFuYXMuYCxcclxuICAgIGFueGlvdXM6IGBUcmFucXVpbG8vYSwgZXN0b3kgYXF1w60uIEhlIGVuY29udHJhZG8gJHttb3ZpZUNvdW50fSBwZWzDrWN1bGFzIHBvcHVsYXJlcyR7Z2VucmVUZXh0fSBxdWUgc29uIHJlY29uZm9ydGFudGVzIHkgdGUgYXl1ZGFyw6FuIGEgc2VudGlydGUgbWVqb3Igc2luIHNvYnJlc2FsdG9zLmAsXHJcbiAgICBoYXBweTogYMKhUXXDqSBidWVuYSBlbmVyZ8OtYSEgVGVuZ28gJHttb3ZpZUNvdW50fSBwZWzDrWN1bGFzIHBvcHVsYXJlcyR7Z2VucmVUZXh0fSBxdWUgbWFudGVuZHLDoW4gZXNhcyBidWVuYXMgdmlicmFjaW9uZXMgeSB0ZSBoYXLDoW4gcGFzYXIgdW4gcmF0byBnZW5pYWwuYCxcclxuICAgIGJvcmVkOiBgwqFQZXJmZWN0byEgSGUgZW5jb250cmFkbyAke21vdmllQ291bnR9IHBlbMOtY3VsYXMgcG9wdWxhcmVzJHtnZW5yZVRleHR9IHF1ZSB0ZSB2YW4gYSBlbmdhbmNoYXIgZGVzZGUgZWwgcHJpbWVyIG1pbnV0by4gTmFkYSBkZSBhYnVycmltaWVudG8gYXF1w60uYCxcclxuICAgIGRlZmF1bHQ6IGBIZSBlbmNvbnRyYWRvICR7bW92aWVDb3VudH0gcGVsw61jdWxhcyBwb3B1bGFyZXMke2dlbnJlVGV4dH0gYmFzw6FuZG9tZSBlbiBsYXMgdGVuZGVuY2lhcyBhY3R1YWxlcy4gRXN0YXMgc29uIG9wY2lvbmVzIHF1ZSBlc3TDoW4gZnVuY2lvbmFuZG8gbXV5IGJpZW4gY29uIG90cm9zIHVzdWFyaW9zLmAsXHJcbiAgfTtcclxuICBcclxuICByZXR1cm4gc3RhdGVSZXNwb25zZXNbZW1vdGlvbmFsU3RhdGVdIHx8IHN0YXRlUmVzcG9uc2VzLmRlZmF1bHQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXNwdWVzdGEgZGUgZmFsbGJhY2sgZW1ww6F0aWNhIGRlIFRyaW5pIGNvbiBnw6luZXJvcyBkZSBzYWxhXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXRUcmluaUZhbGxiYWNrUmVzcG9uc2UodXNlclRleHQ6IHN0cmluZywgcm9vbUdlbnJlcz86IHN0cmluZ1tdKTogVHJpbmlSZXNwb25zZSB7XHJcbiAgY29uc3QgdGV4dCA9IHVzZXJUZXh0LnRvTG93ZXJDYXNlKCk7XHJcbiAgY29uc3QgZW1vdGlvbmFsU3RhdGUgPSBkZXRlY3RFbW90aW9uYWxTdGF0ZSh0ZXh0KTtcclxuICBcclxuICBjb25zdCByZXNwb25zZXM6IHsgW2tleTogc3RyaW5nXTogT21pdDxUcmluaVJlc3BvbnNlLCAncmVjb21tZW5kZWRHZW5yZXMnPiB9ID0ge1xyXG4gICAgc2FkOiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZTogXCJFbnRpZW5kbyBjw7NtbyB0ZSBzaWVudGVzLCB5IGVzdMOhIGJpZW4gc2VudGlyc2UgYXPDrSBhIHZlY2VzLiBUZSBwcm9wb25nbyBhbGdvOiDCv3F1w6kgdGFsIHNpIHZlbW9zIGFsZ28gcXVlIHRlIGF5dWRlIGEgc29sdGFyIGVzYXMgZW1vY2lvbmVzPyBBIHZlY2VzIHVuIGJ1ZW4gZHJhbWEgbm9zIHBlcm1pdGUgY29uZWN0YXIgY29uIGxvIHF1ZSBzZW50aW1vcywgbyBzaSBwcmVmaWVyZXMsIHVuYSBjb21lZGlhIGxpZ2VyYSBwYXJhIGRlc2NvbmVjdGFyIHVuIHBvY28uIFTDuiBkZWNpZGVzIHF1w6kgbmVjZXNpdGFzIGFob3JhLlwiLFxyXG4gICAgICBjb25maWRlbmNlOiAwLjc1LFxyXG4gICAgICByZWFzb25pbmc6IFwiRGV0ZWN0w6kgdHJpc3RlemEgZW4gdHUgbWVuc2FqZS4gUmVjb21pZW5kbyBnw6luZXJvcyBxdWUgcGVybWl0YW4gY2F0YXJzaXMgZW1vY2lvbmFsIG8gZGlzdHJhY2Npw7NuIHBvc2l0aXZhLlwiLFxyXG4gICAgfSxcclxuICAgIHN0cmVzc2VkOiB7XHJcbiAgICAgIGNoYXRSZXNwb25zZTogXCJWYXlhLCBwYXJlY2UgcXVlIGhhcyB0ZW5pZG8gZMOtYXMgaW50ZW5zb3MuIExvIHByaW1lcm86IHJlc3BpcmEuIEFob3JhLCBkw6lqYW1lIGF5dWRhcnRlIGEgZGVzY29uZWN0YXIuIFRlIHJlY29taWVuZG8gYWxnbyBsaWdlcm8geSBlbnRyZXRlbmlkbyBxdWUgdGUgc2FxdWUgZGUgbGEgcnV0aW5hIHBvciB1biByYXRvLiDCv1RlIGFwZXRlY2UgcmXDrXIgbyBwcmVmaWVyZXMgdW5hIGF2ZW50dXJhIHF1ZSB0ZSB0cmFuc3BvcnRlIGEgb3RybyBtdW5kbz9cIixcclxuICAgICAgY29uZmlkZW5jZTogMC44MCxcclxuICAgICAgcmVhc29uaW5nOiBcIklkZW50aWZpY28gZXN0csOpcyBlbiB0dSBtZW5zYWplLiBTdWdpZXJvIGfDqW5lcm9zIHF1ZSBvZnJlemNhbiBlc2NhcGUgeSByZWxhamFjacOzbiBtZW50YWwuXCIsXHJcbiAgICB9LFxyXG4gICAgYW5ncnk6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIkVudGllbmRvIGVzYSBmcnVzdHJhY2nDs24sIGVzIHbDoWxpZG8gc2VudGlyc2UgYXPDrS4gQSB2ZWNlcyBuZWNlc2l0YW1vcyBjYW5hbGl6YXIgZXNhIGVuZXJnw61hLiBUZSBwcm9wb25nbyBhbGdvIGNvbiBhY2Npw7NuIHF1ZSB0ZSBheXVkZSBhIGxpYmVyYXIgdGVuc2nDs24sIG8gc2kgcHJlZmllcmVzLCB1biB0aHJpbGxlciBxdWUgdGUgbWFudGVuZ2EgZW5nYW5jaGFkbyB5IHRlIGhhZ2Egb2x2aWRhciBwb3IgdW4gcmF0byBsbyBxdWUgdGUgbW9sZXN0YS5cIixcclxuICAgICAgY29uZmlkZW5jZTogMC43OCxcclxuICAgICAgcmVhc29uaW5nOiBcIlBlcmNpYm8gZnJ1c3RyYWNpw7NuIG8gZW5vam8uIFJlY29taWVuZG8gZ8OpbmVyb3MgcXVlIHBlcm1pdGFuIGNhbmFsaXphciBlc2EgZW5lcmfDrWEgZGUgZm9ybWEgY2F0w6FydGljYS5cIixcclxuICAgIH0sXHJcbiAgICBsb25lbHk6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIk95ZSwgcXVlIHNlcGFzIHF1ZSBubyBlc3TDoXMgc29sby9hIGVuIGVzdG8uIFRvZG9zIG5vcyBzZW50aW1vcyBhc8OtIGEgdmVjZXMuIFRlIHByb3BvbmdvIHBlbMOtY3VsYXMgY29uIGhpc3RvcmlhcyBkZSBjb25leGnDs24gaHVtYW5hLCBkZSBlc2FzIHF1ZSB0ZSByZWN1ZXJkYW4gbG8gYm9uaXRvIGRlIGxhcyByZWxhY2lvbmVzLiDCv1F1w6kgdGUgcGFyZWNlIGFsZ28gZW1vdGl2byBvIHF1aXrDoXMgdW5hIGNvbWVkaWEgcm9tw6FudGljYT9cIixcclxuICAgICAgY29uZmlkZW5jZTogMC44MixcclxuICAgICAgcmVhc29uaW5nOiBcIkRldGVjdG8gc2VudGltaWVudG9zIGRlIHNvbGVkYWQuIFN1Z2llcm8gZ8OpbmVyb3MgcXVlIGV4cGxvcmVuIGNvbmV4aW9uZXMgaHVtYW5hcyB5IHJlbGFjaW9uZXMuXCIsXHJcbiAgICB9LFxyXG4gICAgYW54aW91czoge1xyXG4gICAgICBjaGF0UmVzcG9uc2U6IFwiVHJhbnF1aWxvL2EsIGVzdG95IGFxdcOtIHBhcmEgYXl1ZGFydGUuIEN1YW5kbyBsYSBhbnNpZWRhZCBhcHJpZXRhLCBhIHZlY2VzIGxvIG1lam9yIGVzIGFsZ28gcXVlIG5vcyBjYWxtZSB5IG5vcyBoYWdhIHNlbnRpciBiaWVuLiBUZSByZWNvbWllbmRvIGFsZ28gdmlzdWFsbWVudGUgYm9uaXRvIHkgcmVjb25mb3J0YW50ZSwgc2luIHNvYnJlc2FsdG9zLiDCv1RlIGFwZXRlY2UgYW5pbWFjacOzbiBvIHVuIGRvY3VtZW50YWwgZGUgbmF0dXJhbGV6YT9cIixcclxuICAgICAgY29uZmlkZW5jZTogMC44NSxcclxuICAgICAgcmVhc29uaW5nOiBcIklkZW50aWZpY28gYW5zaWVkYWQgZW4gdHUgbWVuc2FqZS4gUmVjb21pZW5kbyBnw6luZXJvcyBjYWxtYW50ZXMgeSByZWNvbmZvcnRhbnRlcywgZXZpdGFuZG8gY29udGVuaWRvIGludGVuc28uXCIsXHJcbiAgICB9LFxyXG4gICAgaGFwcHk6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIsKhUXXDqSBiaWVuIHF1ZSBlc3TDqXMgZGUgYnVlbiBodW1vciEgVmFtb3MgYSBtYW50ZW5lciBlc2EgZW5lcmfDrWEuIFRlIHByb3BvbmdvIGFsZ28gZGl2ZXJ0aWRvIHkgZW1vY2lvbmFudGUgcXVlIHBvdGVuY2llIGVzYXMgYnVlbmFzIHZpYnJhY2lvbmVzLiDCv0F2ZW50dXJhLCBjb21lZGlhIG8gcXVpesOhcyBhbGdvIG11c2ljYWw/XCIsXHJcbiAgICAgIGNvbmZpZGVuY2U6IDAuOTAsXHJcbiAgICAgIHJlYXNvbmluZzogXCJQZXJjaWJvIGJ1ZW4gw6FuaW1vIGVuIHR1IG1lbnNhamUuIFN1Z2llcm8gZ8OpbmVyb3MgcXVlIG1hbnRlbmdhbiB5IHBvdGVuY2llbiBlc2EgZW5lcmfDrWEgcG9zaXRpdmEuXCIsXHJcbiAgICB9LFxyXG4gICAgYm9yZWQ6IHtcclxuICAgICAgY2hhdFJlc3BvbnNlOiBcIsKhSG9yYSBkZSBzYWN1ZGlyIGVzZSBhYnVycmltaWVudG8hIFRlbmdvIGp1c3RvIGxvIHF1ZSBuZWNlc2l0YXM6IGFsZ28gcXVlIHRlIGVuZ2FuY2hlIGRlc2RlIGVsIHByaW1lciBtaW51dG8uIMK/VGUgYXBldGVjZSBhY2Npw7NuIHRyZXBpZGFudGUsIHVuIHRocmlsbGVyIHF1ZSB0ZSBtYW50ZW5nYSBlbiB2aWxvLCBvIHVuYSBhdmVudHVyYSDDqXBpY2E/XCIsXHJcbiAgICAgIGNvbmZpZGVuY2U6IDAuODgsXHJcbiAgICAgIHJlYXNvbmluZzogXCJEZXRlY3RvIGFidXJyaW1pZW50by4gUmVjb21pZW5kbyBnw6luZXJvcyBkaW7DoW1pY29zIHkgZW1vY2lvbmFudGVzIHF1ZSBjYXB0dXJlbiB0dSBhdGVuY2nDs24gaW5tZWRpYXRhbWVudGUuXCIsXHJcbiAgICB9LFxyXG4gICAgZGVmYXVsdDoge1xyXG4gICAgICBjaGF0UmVzcG9uc2U6IFwiQ3XDqW50YW1lIG3DoXMgc29icmUgY8OzbW8gdGUgc2llbnRlcyBvIHF1w6kgdGlwbyBkZSBleHBlcmllbmNpYSBidXNjYXMuIE1pZW50cmFzIHRhbnRvLCB0ZSBwcm9wb25nbyB1bmEgc2VsZWNjacOzbiB2YXJpYWRhIHF1ZSBzdWVsZSBndXN0YXIgYSB0b2RvIGVsIG11bmRvLiDCv1F1w6kgdGUgcGFyZWNlIGVtcGV6YXIgcG9yIGFxdcOtP1wiLFxyXG4gICAgICBjb25maWRlbmNlOiAwLjYwLFxyXG4gICAgICByZWFzb25pbmc6IFwiTm8gcHVkZSBpZGVudGlmaWNhciB1biBlc3RhZG8gZW1vY2lvbmFsIGVzcGVjw61maWNvLiBPZnJlemNvIHVuYSBzZWxlY2Npw7NuIGVxdWlsaWJyYWRhIGRlIGfDqW5lcm9zIHBvcHVsYXJlcy5cIixcclxuICAgIH0sXHJcbiAgfTtcclxuXHJcbiAgY29uc3QgYmFzZVJlc3BvbnNlID0gcmVzcG9uc2VzW2Vtb3Rpb25hbFN0YXRlXSB8fCByZXNwb25zZXMuZGVmYXVsdDtcclxuICBjb25zdCBiYXNlR2VucmVzID0gZ2V0RGVmYXVsdEdlbnJlc0Zvck1vb2QodXNlclRleHQsIHJvb21HZW5yZXMpO1xyXG4gIFxyXG4gIC8vIFByaW9yaXphciBnw6luZXJvcyBkZSBzYWxhIGN1YW5kbyBzZWEgYXByb3BpYWRvXHJcbiAgY29uc3QgcHJpb3JpdGl6ZWRHZW5yZXMgPSBwcmlvcml0aXplUm9vbUdlbnJlcyhiYXNlR2VucmVzLCByb29tR2VucmVzKTtcclxuICBcclxuICAvLyBBanVzdGFyIGNvbmZpYW56YSBiYXNhZGEgZW4gYWxpbmVhY2nDs24gY29uIGfDqW5lcm9zIGRlIHNhbGFcclxuICBjb25zdCBnZW5yZUFsaWdubWVudCA9IGNhbGN1bGF0ZUdlbnJlQWxpZ25tZW50KHByaW9yaXRpemVkR2VucmVzLCByb29tR2VucmVzKTtcclxuICBjb25zdCBhZGp1c3RlZENvbmZpZGVuY2UgPSByb29tR2VucmVzICYmIHJvb21HZW5yZXMubGVuZ3RoID4gMCBcclxuICAgID8gYmFzZVJlc3BvbnNlLmNvbmZpZGVuY2UgKiAoMC43ICsgMC4zICogZ2VucmVBbGlnbm1lbnQpXHJcbiAgICA6IGJhc2VSZXNwb25zZS5jb25maWRlbmNlO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgLi4uYmFzZVJlc3BvbnNlLFxyXG4gICAgcmVjb21tZW5kZWRHZW5yZXM6IHByaW9yaXRpemVkR2VucmVzLFxyXG4gICAgY29uZmlkZW5jZTogTWF0aC5yb3VuZChhZGp1c3RlZENvbmZpZGVuY2UgKiAxMDApIC8gMTAwLCAvLyBSb3VuZCB0byAyIGRlY2ltYWwgcGxhY2VzXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIERldGVjdGFyIGVzdGFkbyBlbW9jaW9uYWwgZGVsIHVzdWFyaW9cclxuICovXHJcbmZ1bmN0aW9uIGRldGVjdEVtb3Rpb25hbFN0YXRlKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3QgZW1vdGlvbktleXdvcmRzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZ1tdIH0gPSB7XHJcbiAgICBzYWQ6IFsndHJpc3RlJywgJ2RlcHJpbWlkbycsICdtZWxhbmPDs2xpY28nLCAnbGxvcmFyJywgJ3BlbmEnLCAnZG9sb3InLCAnbWFsJywgJ2JhasOzbiddLFxyXG4gICAgc3RyZXNzZWQ6IFsnZXN0cmVzYWRvJywgJ2Fnb2JpYWRvJywgJ3ByZXNpw7NuJywgJ3RyYWJham8nLCAnY2Fuc2FkbycsICdleGhhdXN0bycsICdzYXR1cmFkbyddLFxyXG4gICAgYW5ncnk6IFsnZW5mYWRhZG8nLCAnZnVyaW9zbycsICdtb2xlc3RvJywgJ2lycml0YWRvJywgJ3JhYmlhJywgJ2NhYnJlYWRvJywgJ2ZydXN0cmFkbyddLFxyXG4gICAgbG9uZWx5OiBbJ3NvbG8nLCAnc29saXRhcmlvJywgJ2Fpc2xhZG8nLCAnYWJhbmRvbmFkbycsICd2YWPDrW8nLCAnbmFkaWUnXSxcclxuICAgIGFueGlvdXM6IFsnYW5zaW9zbycsICduZXJ2aW9zbycsICdwcmVvY3VwYWRvJywgJ2lucXVpZXRvJywgJ2Fuc2llZGFkJywgJ21pZWRvJ10sXHJcbiAgICBoYXBweTogWydmZWxpeicsICdhbGVncmUnLCAnY29udGVudG8nLCAnYmllbicsICdnZW5pYWwnLCAnY2VsZWJyYXInLCAnZW1vY2lvbmFkbyddLFxyXG4gICAgYm9yZWQ6IFsnYWJ1cnJpZG8nLCAnbmFkYSBxdWUgaGFjZXInLCAnc2luIHBsYW5lcycsICdtb25vdG9uw61hJ10sXHJcbiAgfTtcclxuXHJcbiAgZm9yIChjb25zdCBbZW1vdGlvbiwga2V5d29yZHNdIG9mIE9iamVjdC5lbnRyaWVzKGVtb3Rpb25LZXl3b3JkcykpIHtcclxuICAgIGlmIChrZXl3b3Jkcy5zb21lKGtleXdvcmQgPT4gdGV4dC5pbmNsdWRlcyhrZXl3b3JkKSkpIHtcclxuICAgICAgcmV0dXJuIGVtb3Rpb247XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gJ2RlZmF1bHQnO1xyXG59XHJcblxyXG4vKipcclxuICogT2J0ZW5lciBnw6luZXJvcyBwb3IgZGVmZWN0byBzZWfDum4gZWwgZXN0YWRvIGRlIMOhbmltbyB5IGfDqW5lcm9zIGRlIHNhbGFcclxuICovXHJcbmZ1bmN0aW9uIGdldERlZmF1bHRHZW5yZXNGb3JNb29kKHRleHQ6IHN0cmluZywgcm9vbUdlbnJlcz86IHN0cmluZ1tdKTogc3RyaW5nW10ge1xyXG4gIGNvbnN0IHN0YXRlID0gZGV0ZWN0RW1vdGlvbmFsU3RhdGUodGV4dC50b0xvd2VyQ2FzZSgpKTtcclxuICBjb25zdCBtb29kR2VucmVzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZ1tdIH0gPSB7XHJcbiAgICBzYWQ6IFsnZHJhbWEnLCAnY29tZWRpYScsICdhbmltYWNpw7NuJ10sXHJcbiAgICBzdHJlc3NlZDogWydjb21lZGlhJywgJ2FuaW1hY2nDs24nLCAnYXZlbnR1cmEnXSxcclxuICAgIGFuZ3J5OiBbJ2FjY2nDs24nLCAndGhyaWxsZXInLCAnZHJhbWEnXSxcclxuICAgIGxvbmVseTogWydyb21hbmNlJywgJ2RyYW1hJywgJ2NvbWVkaWEnXSxcclxuICAgIGFueGlvdXM6IFsnYW5pbWFjacOzbicsICdkb2N1bWVudGFsJywgJ2ZhbWlsaWEnXSxcclxuICAgIGhhcHB5OiBbJ2NvbWVkaWEnLCAnYXZlbnR1cmEnLCAnbcO6c2ljYSddLFxyXG4gICAgYm9yZWQ6IFsnYWNjacOzbicsICd0aHJpbGxlcicsICdhdmVudHVyYSddLFxyXG4gICAgZGVmYXVsdDogWydkcmFtYScsICdjb21lZGlhJywgJ2F2ZW50dXJhJ10sXHJcbiAgfTtcclxuICBcclxuICBjb25zdCBiYXNlR2VucmVzID0gbW9vZEdlbnJlc1tzdGF0ZV0gfHwgbW9vZEdlbnJlcy5kZWZhdWx0O1xyXG4gIHJldHVybiBwcmlvcml0aXplUm9vbUdlbnJlcyhiYXNlR2VucmVzLCByb29tR2VucmVzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFByaW9yaXphciBnw6luZXJvcyBkZSBzYWxhIGN1YW5kbyBzZWEgYXByb3BpYWRvXHJcbiAqL1xyXG5mdW5jdGlvbiBwcmlvcml0aXplUm9vbUdlbnJlcyhyZWNvbW1lbmRlZEdlbnJlczogc3RyaW5nW10sIHJvb21HZW5yZXM/OiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcclxuICBpZiAoIXJvb21HZW5yZXMgfHwgcm9vbUdlbnJlcy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiByZWNvbW1lbmRlZEdlbnJlcztcclxuICB9XHJcblxyXG4gIC8vIE5vcm1hbGl6YXIgZ8OpbmVyb3MgZGUgc2FsYSBwYXJhIGNvbXBhcmFjacOzblxyXG4gIGNvbnN0IG5vcm1hbGl6ZWRSb29tR2VucmVzID0gcm9vbUdlbnJlcy5tYXAoZyA9PiBnLnRvTG93ZXJDYXNlKCkudHJpbSgpKTtcclxuICBjb25zdCBub3JtYWxpemVkUmVjb21tZW5kZWQgPSByZWNvbW1lbmRlZEdlbnJlcy5tYXAoZyA9PiBnLnRvTG93ZXJDYXNlKCkudHJpbSgpKTtcclxuXHJcbiAgLy8gRW5jb250cmFyIGfDqW5lcm9zIHF1ZSBjb2luY2lkZW5cclxuICBjb25zdCBtYXRjaGluZ0dlbnJlczogc3RyaW5nW10gPSBbXTtcclxuICBjb25zdCBub25NYXRjaGluZ0dlbnJlczogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBnZW5yZSBvZiByZWNvbW1lbmRlZEdlbnJlcykge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGdlbnJlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWRSb29tR2VucmVzLmluY2x1ZGVzKG5vcm1hbGl6ZWQpKSB7XHJcbiAgICAgIG1hdGNoaW5nR2VucmVzLnB1c2goZ2VucmUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbm9uTWF0Y2hpbmdHZW5yZXMucHVzaChnZW5yZSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBTaSBoYXkgY29pbmNpZGVuY2lhcywgcHJpb3JpemFybGFzXHJcbiAgaWYgKG1hdGNoaW5nR2VucmVzLmxlbmd0aCA+IDApIHtcclxuICAgIC8vIENvbWJpbmFyIGfDqW5lcm9zIGNvaW5jaWRlbnRlcyBwcmltZXJvLCBsdWVnbyBubyBjb2luY2lkZW50ZXNcclxuICAgIGNvbnN0IHJlc3VsdCA9IFsuLi5tYXRjaGluZ0dlbnJlcywgLi4ubm9uTWF0Y2hpbmdHZW5yZXNdLnNsaWNlKDAsIDMpO1xyXG4gICAgY29uc29sZS5sb2coYPCfjq8gUHJpb3JpemFuZG8gZ8OpbmVyb3MgZGUgc2FsYTogJHttYXRjaGluZ0dlbnJlcy5qb2luKCcsICcpfSBkZSAke3Jvb21HZW5yZXMuam9pbignLCAnKX1gKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG5cclxuICAvLyBTaSBubyBoYXkgY29pbmNpZGVuY2lhcywgbWFudGVuZXIgcmVjb21lbmRhY2lvbmVzIG9yaWdpbmFsZXNcclxuICByZXR1cm4gcmVjb21tZW5kZWRHZW5yZXM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYWxjdWxhciBhbGluZWFjacOzbiBlbnRyZSBnw6luZXJvcyByZWNvbWVuZGFkb3MgeSBnw6luZXJvcyBkZSBzYWxhXHJcbiAqL1xyXG5mdW5jdGlvbiBjYWxjdWxhdGVHZW5yZUFsaWdubWVudChyZWNvbW1lbmRlZEdlbnJlczogc3RyaW5nW10sIHJvb21HZW5yZXM/OiBzdHJpbmdbXSk6IG51bWJlciB7XHJcbiAgaWYgKCFyb29tR2VucmVzIHx8IHJvb21HZW5yZXMubGVuZ3RoID09PSAwIHx8IHJlY29tbWVuZGVkR2VucmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIDA7XHJcbiAgfVxyXG5cclxuICBjb25zdCBub3JtYWxpemVkUm9vbUdlbnJlcyA9IHJvb21HZW5yZXMubWFwKGcgPT4gZy50b0xvd2VyQ2FzZSgpLnRyaW0oKSk7XHJcbiAgY29uc3Qgbm9ybWFsaXplZFJlY29tbWVuZGVkID0gcmVjb21tZW5kZWRHZW5yZXMubWFwKGcgPT4gZy50b0xvd2VyQ2FzZSgpLnRyaW0oKSk7XHJcblxyXG4gIGNvbnN0IG1hdGNoZXMgPSBub3JtYWxpemVkUmVjb21tZW5kZWQuZmlsdGVyKGdlbnJlID0+IFxyXG4gICAgbm9ybWFsaXplZFJvb21HZW5yZXMuaW5jbHVkZXMoZ2VucmUpXHJcbiAgKS5sZW5ndGg7XHJcblxyXG4gIHJldHVybiBtYXRjaGVzIC8gTWF0aC5tYXgocmVjb21tZW5kZWRHZW5yZXMubGVuZ3RoLCByb29tR2VucmVzLmxlbmd0aCk7XHJcbn1cclxuIl19