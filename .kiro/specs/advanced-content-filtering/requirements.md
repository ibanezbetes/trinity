# Requirements Document

## Introduction

El sistema de filtrado avanzado de contenido permite a los usuarios crear salas de votación con filtros específicos de tipo de media y géneros. El sistema pre-carga contenido filtrado de TMDB API y mantiene un flujo continuo de títulos que cumplen los criterios seleccionados, optimizando la experiencia de votación mediante algoritmos de priorización inteligente.

## Glossary

- **System**: Sistema de filtrado avanzado de contenido
- **TMDB_API**: The Movie Database API externa
- **Room**: Sala de votación donde los usuarios votan por películas/series
- **Media_Type**: Tipo de contenido (MOVIE o TV)
- **Genre**: Categoría temática del contenido (acción, comedia, etc.)
- **Content_Pool**: Conjunto de 30 títulos pre-cargados en una sala
- **Filter_Criteria**: Combinación de tipo de media y géneros seleccionados
- **Priority_Algorithm**: Algoritmo que ordena contenido por relevancia de géneros

## Requirements

### Requirement 1: Media Type Selection

**User Story:** Como creador de sala, quiero seleccionar el tipo de contenido (película o serie), para que la sala solo muestre contenido del tipo elegido.

#### Acceptance Criteria

1. WHEN a user creates a new room, THE System SHALL display media type selection options (MOVIE and TV)
2. WHEN a user selects a media type, THE System SHALL store the selection and proceed to genre selection
3. THE System SHALL prevent room creation without media type selection
4. WHEN a media type is selected, THE System SHALL load the corresponding genre list from TMDB_API

### Requirement 2: Genre Selection and Validation

**User Story:** Como creador de sala, quiero seleccionar hasta 3 géneros específicos, para que el contenido mostrado sea relevante a mis preferencias.

#### Acceptance Criteria

1. WHEN genre selection is displayed, THE System SHALL show all available genres for the selected media type
2. WHEN a user selects genres, THE System SHALL allow selection of up to 3 genres maximum
3. IF a user attempts to select more than 3 genres, THEN THE System SHALL prevent the selection and display a validation message
4. THE System SHALL allow room creation with 0, 1, 2, or 3 genres selected
5. WHEN genres are selected, THE System SHALL store them as part of the Filter_Criteria

### Requirement 3: Content Pre-loading with Priority Algorithm

**User Story:** Como usuario de sala, quiero que el contenido mostrado sea relevante a los filtros seleccionados, para que las opciones de votación sean de mi interés.

#### Acceptance Criteria

1. WHEN a room is created with Filter_Criteria, THE System SHALL pre-load exactly 30 titles using the Priority_Algorithm
2. THE Priority_Algorithm SHALL prioritize content in this order:
   - Priority 1: Titles containing ALL selected genres
   - Priority 2: Titles containing AT LEAST ONE selected genre  
   - Priority 3: Popular titles of the same Media_Type
3. WITHIN each priority level, THE System SHALL randomize the order of titles
4. WHEN no genres are selected, THE System SHALL load 30 popular titles of the selected Media_Type randomly
5. IF fewer than 30 titles are available, THE System SHALL load all available titles

### Requirement 4: TMDB API Integration

**User Story:** Como sistema, necesito integrarme correctamente con TMDB API, para obtener contenido filtrado de manera eficiente.

#### Acceptance Criteria

1. THE System SHALL use `/discover/movie` endpoint for MOVIE media type
2. THE System SHALL use `/discover/tv` endpoint for TV media type  
3. WHEN multiple genres are selected for AND logic, THE System SHALL use comma-separated genre IDs in `with_genres` parameter
4. WHEN multiple genres are selected for OR logic, THE System SHALL use pipe-separated genre IDs in `with_genres` parameter
5. THE System SHALL retrieve these fields: id, title/name, poster_path, overview, genre_ids, vote_average, release_date/first_air_date
6. THE System SHALL handle TMDB_API rate limits and errors gracefully

### Requirement 5: Content Pool Management

**User Story:** Como usuario de sala, quiero que siempre haya contenido disponible para votar, para que la experiencia de votación sea continua.

#### Acceptance Criteria

1. WHEN the Content_Pool has fewer than 5 titles remaining, THE System SHALL automatically load 30 additional titles
2. WHEN loading additional content, THE System SHALL exclude titles already shown in the room
3. THE System SHALL maintain the same Filter_Criteria for all content reloads
4. WHEN no more unique content is available, THE System SHALL notify users and suggest broadening filters
5. THE System SHALL cache content efficiently to minimize API calls

### Requirement 6: Filter Immutability

**User Story:** Como participante de sala, quiero que los filtros permanezcan constantes durante toda la sesión, para mantener coherencia en las opciones de votación.

#### Acceptance Criteria

1. WHEN a room is created with Filter_Criteria, THE System SHALL make the criteria immutable
2. THE System SHALL prevent any modification of Media_Type after room creation
3. THE System SHALL prevent any modification of selected genres after room creation
4. THE System SHALL display current Filter_Criteria to all room participants
5. IF filter changes are needed, THE System SHALL require creating a new room

### Requirement 7: Cache Optimization

**User Story:** Como sistema, necesito optimizar el rendimiento del cache, para reducir llamadas a TMDB API y mejorar tiempos de respuesta.

#### Acceptance Criteria

1. THE System SHALL cache content by unique Filter_Criteria combinations
2. WHEN identical Filter_Criteria are used, THE System SHALL serve content from cache when available
3. THE System SHALL implement cache expiration to ensure content freshness
4. THE System SHALL track which titles have been shown in each room to avoid repetition
5. THE System SHALL invalidate cache entries when they become stale

### Requirement 8: User Interface Enhancements

**User Story:** Como usuario, quiero una interfaz clara y intuitiva para configurar filtros, para crear salas fácilmente según mis preferencias.

#### Acceptance Criteria

1. THE System SHALL display a clear media type selector with visual indicators
2. THE System SHALL show genre selection with checkboxes and selection counter
3. WHEN 3 genres are selected, THE System SHALL disable remaining genre options
4. THE System SHALL display estimated content availability for current filter selection
5. THE System SHALL show applied filters prominently in the room interface
6. THE System SHALL provide visual feedback during content loading operations

### Requirement 9: Backward Compatibility

**User Story:** Como administrador del sistema, quiero que las salas existentes sigan funcionando, para mantener la continuidad del servicio.

#### Acceptance Criteria

1. THE System SHALL continue supporting existing rooms without Filter_Criteria
2. WHEN accessing legacy rooms, THE System SHALL use the original content loading mechanism
3. THE System SHALL not apply new filtering logic to pre-existing rooms
4. THE System SHALL maintain all existing GraphQL schema compatibility
5. THE System SHALL handle migration of room data structures gracefully