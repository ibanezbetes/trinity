"""
Constants and mappings for Trini Lambda function.
"""

# TMDB Genre ID mapping for Spanish/English terms
TMDB_GENRE_MAP = {
    # Action
    'accion': '28',
    'action': '28',
    'aventura': '12',
    'adventure': '12',
    
    # Comedy
    'comedia': '35',
    'comedy': '35',
    'gracioso': '35',
    'divertido': '35',
    'humor': '35',
    
    # Drama
    'drama': '18',
    'dramatico': '18',
    
    # Horror/Thriller
    'terror': '27',
    'horror': '27',
    'miedo': '27',
    'suspenso': '53',
    'thriller': '53',
    
    # Romance
    'romance': '10749',
    'romantico': '10749',
    'amor': '10749',
    
    # Sci-Fi
    'ciencia ficcion': '878',
    'sci-fi': '878',
    'scifi': '878',
    'futurista': '878',
    
    # Fantasy
    'fantasia': '14',
    'fantasy': '14',
    'magico': '14',
    
    # Crime
    'crimen': '80',
    'crime': '80',
    'policial': '80',
    
    # Animation
    'animacion': '16',
    'animation': '16',
    'animada': '16',
    'dibujos': '16',
    
    # Documentary
    'documental': '99',
    'documentary': '99',
    
    # Family
    'familiar': '10751',
    'family': '10751',
    'ninos': '10751',
    'infantil': '10751',
    
    # History
    'historia': '36',
    'history': '36',
    'historico': '36',
    
    # Music
    'musica': '10402',
    'music': '10402',
    'musical': '10402',
    
    # Mystery
    'misterio': '9648',
    'mystery': '9648',
    
    # War
    'guerra': '10752',
    'war': '10752',
    'belico': '10752',
    
    # Western
    'western': '37',
    'oeste': '37'
}

# Reverse mapping for genre ID to name
GENRE_ID_TO_NAME = {v: k for k, v in TMDB_GENRE_MAP.items()}

# Default movie recommendations for fallback scenarios
DEFAULT_MOVIE_RECOMMENDATIONS = [
    {
        'id': '550',
        'title': 'Fight Club',
        'overview': 'An insomniac office worker and a devil-may-care soapmaker form an underground fight club.',
        'vote_average': 8.4,
        'release_date': '1999-10-15',
        'poster_path': '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
        'genre_ids': [18]
    },
    {
        'id': '13',
        'title': 'Forrest Gump',
        'overview': 'A man with a low IQ has accomplished great things in his life and been present during significant historic events.',
        'vote_average': 8.5,
        'release_date': '1994-06-23',
        'poster_path': '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
        'genre_ids': [35, 18, 10749]
    },
    {
        'id': '278',
        'title': 'The Shawshank Redemption',
        'overview': 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
        'vote_average': 9.3,
        'release_date': '1994-09-23',
        'poster_path': '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
        'genre_ids': [18]
    },
    {
        'id': '238',
        'title': 'The Godfather',
        'overview': 'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.',
        'vote_average': 9.2,
        'release_date': '1972-03-14',
        'poster_path': '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
        'genre_ids': [18, 80]
    },
    {
        'id': '424',
        'title': 'Schindler\'s List',
        'overview': 'In German-occupied Poland during World War II, industrialist Oskar Schindler gradually becomes concerned for his Jewish workforce.',
        'vote_average': 9.0,
        'release_date': '1993-11-30',
        'poster_path': '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg',
        'genre_ids': [18, 36, 10752]
    }
]

# Rate limiting constants
MAX_QUERIES_PER_MINUTE = 5
RATE_LIMIT_WINDOW_SECONDS = 60

# Session management constants
MAX_SESSION_MESSAGES = 10
SESSION_TTL_DAYS = 30

# AI processing constants
MIN_CONFIDENCE_THRESHOLD = 0.5
MAX_AI_RESPONSE_LENGTH = 2000
AI_TIMEOUT_SECONDS = 10

# Movie search constants
MAX_RECOMMENDATIONS = 20
MIN_MOVIE_RATING = 5.0
DEFAULT_MOVIE_LIMIT = 10

# Error messages
ERROR_MESSAGES = {
    'RATE_LIMIT_EXCEEDED': 'Has alcanzado el límite de consultas por minuto. Por favor, espera un momento.',
    'AI_SERVICE_UNAVAILABLE': 'El servicio de IA no está disponible. Usando búsqueda básica.',
    'TMDB_SERVICE_UNAVAILABLE': 'El servicio de películas no está disponible. Usando recomendaciones populares.',
    'INVALID_QUERY': 'Por favor, proporciona una consulta válida sobre películas.',
    'INVALID_USER': 'Usuario no válido.',
    'SESSION_NOT_FOUND': 'Sesión de chat no encontrada.',
    'ROOM_NOT_FOUND': 'Sala de votación no encontrada.',
    'PERMISSION_DENIED': 'No tienes permisos para realizar esta acción.',
    'GENERAL_ERROR': 'Ha ocurrido un error inesperado. Por favor, intenta de nuevo.'
}

# Success messages
SUCCESS_MESSAGES = {
    'MOVIE_ADDED_TO_ROOM': 'Película agregada exitosamente a la sala de votación.',
    'RECOMMENDATIONS_FOUND': 'He encontrado algunas películas que podrían interesarte.',
    'NO_RECOMMENDATIONS': 'No encontré películas que coincidan con tus criterios. ¿Podrías ser más específico?',
    'CLARIFICATION_NEEDED': 'Tu consulta es un poco ambigua. ¿Podrías proporcionar más detalles?'
}

# Hugging Face API constants
HF_API_BASE_URL = 'https://api-inference.huggingface.co/models'
HF_MAX_RETRIES = 3
HF_RETRY_DELAY_SECONDS = 1