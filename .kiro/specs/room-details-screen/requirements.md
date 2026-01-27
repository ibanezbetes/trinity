# Requirements Document

## Introduction

Esta especificación define los requisitos para mejorar la pantalla de detalles de sala con funcionalidades avanzadas de invitación y mejoras estéticas significativas. La pantalla se muestra después de crear o seleccionar una sala, proporcionando información completa sobre la sala antes de iniciar la votación de películas, con un enfoque en la experiencia de usuario moderna y opciones de compartir mejoradas.

## Glossary

- **Room_Details_Screen**: Pantalla que muestra información detallada de una sala específica
- **Room_Host**: Usuario que creó la sala y tiene permisos de administración
- **Room_Member**: Usuario que se ha unido a una sala existente
- **Invite_Code**: Código alfanumérico de 6 caracteres para unirse a una sala
- **Room_Status**: Estado actual de la sala (waiting, active, completed)
- **Connected_Members**: Lista de usuarios actualmente conectados a la sala
- **Room_Genres**: Géneros de películas configurados para la sala
- **Invitation_Modal**: Modal que muestra opciones avanzadas para compartir invitaciones
- **Invitation_Code_Section**: Sección visual mejorada que muestra el código de invitación
- **Member_List**: Lista visual de miembros con avatares y estados de conexión
- **Room_Configuration**: Sección que muestra la configuración de géneros y preferencias
- **Action_Buttons**: Botones de acción como "Empezar Votación" y "Salir de la Sala"

## Requirements

### Requirement 1: Room Details Display

**User Story:** Como usuario que ha creado o seleccionado una sala, quiero ver una pantalla con todos los detalles de la sala, para entender qué va a pasar y quién está participando.

#### Acceptance Criteria

1. WHEN a user creates a new room, THE Room_Details_Screen SHALL display immediately after creation
2. WHEN a user selects an existing room from the sidebar, THE Room_Details_Screen SHALL display before entering voting mode
3. THE Room_Details_Screen SHALL show the room name prominently at the top
4. THE Room_Details_Screen SHALL display the room description if provided
5. THE Room_Details_Screen SHALL show the current room status (waiting, active, completed)

### Requirement 2: Invite Code Management

**User Story:** Como host de una sala, quiero ver y poder compartir el código de invitación, para que otros usuarios puedan unirse fácilmente a mi sala.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL display the invite code prominently
2. WHEN the invite code is displayed, THE System SHALL provide a copy-to-clipboard button
3. WHEN the copy button is clicked, THE System SHALL copy the invite code to clipboard and show confirmation
4. THE Room_Details_Screen SHALL show a shareable link format (e.g., "Comparte: http://localhost:3000/room/ABC123")
5. THE Room_Details_Screen SHALL display instructions on how others can join using the code

### Requirement 3: Connected Members Display

**User Story:** Como usuario en una sala, quiero ver qué otros usuarios están conectados actualmente, para saber quién está participando en la sesión.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL display a list of currently connected members
2. WHEN a member connects or disconnects, THE System SHALL update the member list in real-time
3. THE Room_Details_Screen SHALL show each member's display name or email
4. THE Room_Details_Screen SHALL indicate which user is the room host
5. THE Room_Details_Screen SHALL show the total count of connected members
6. WHEN no other members are connected, THE System SHALL show "Solo tú por ahora" message

### Requirement 4: Room Configuration Display

**User Story:** Como usuario en una sala, quiero ver la configuración de géneros y preferencias de la sala, para entender qué tipo de contenido vamos a votar.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL display the configured movie genres for the room
2. THE Room_Details_Screen SHALL show the total number of movies that will be presented for voting
3. THE Room_Details_Screen SHALL display any additional room settings or preferences
4. WHEN no specific genres are configured, THE System SHALL show "Todos los géneros" message
5. THE Room_Details_Screen SHALL indicate the voting format (like/dislike system)

### Requirement 5: Room Control Actions

**User Story:** Como host de una sala, quiero poder iniciar la sesión de votación desde la pantalla de detalles, para comenzar la actividad cuando todos estén listos.

#### Acceptance Criteria

1. WHEN the user is the room host, THE Room_Details_Screen SHALL display a "Empezar Votación" button
2. WHEN the "Empezar Votación" button is clicked, THE System SHALL transition to the voting interface
3. WHEN the user is not the host, THE Room_Details_Screen SHALL show "Esperando al host..." message
4. THE Room_Details_Screen SHALL provide a "Salir de la Sala" option for all users
5. WHEN "Salir de la Sala" is clicked, THE System SHALL return to the main room selection screen

### Requirement 6: Real-time Updates

**User Story:** Como usuario en una sala, quiero que la información se actualice automáticamente, para ver cambios en tiempo real sin necesidad de refrescar.

#### Acceptance Criteria

1. WHEN the room status changes, THE Room_Details_Screen SHALL update automatically
2. WHEN new members join or leave, THE System SHALL update the member list immediately
3. WHEN the host starts voting, THE System SHALL automatically transition all members to voting mode
4. THE Room_Details_Screen SHALL maintain WebSocket connection for real-time updates
5. WHEN connection is lost, THE System SHALL show connection status and attempt to reconnect

### Requirement 7: Navigation and User Experience

**User Story:** Como usuario, quiero una navegación clara y intuitiva en la pantalla de detalles, para poder moverme fácilmente entre diferentes secciones.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL provide a clear back button to return to room list
2. THE Room_Details_Screen SHALL use consistent styling with the rest of the application
3. THE Room_Details_Screen SHALL be responsive and work on both web and mobile interfaces
4. THE Room_Details_Screen SHALL show loading states while fetching room information
5. WHEN room data fails to load, THE System SHALL show appropriate error messages with retry options

### Requirement 8: Enhanced Invitation System

**User Story:** Como host de una sala, quiero opciones avanzadas para invitar a otros usuarios, para que sea más fácil y atractivo compartir mi sala con amigos.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL display a prominent "Invitar Amigos" button with attractive styling
2. WHEN the "Invitar Amigos" button is clicked, THE System SHALL show a modal with multiple sharing options
3. THE Invitation_Modal SHALL provide options to share via WhatsApp, email, SMS, and copy link
4. WHEN sharing via WhatsApp, THE System SHALL open WhatsApp with pre-formatted invitation message
5. WHEN sharing via email, THE System SHALL open email client with invitation subject and body
6. THE Invitation_Modal SHALL show a QR code for easy mobile scanning
7. THE Room_Details_Screen SHALL display invitation statistics (how many people joined via invite)
8. THE Invitation_Code SHALL be displayed with improved visual design (larger, colored background, copy icon)

### Requirement 9: Visual Design Improvements

**User Story:** Como usuario, quiero una interfaz más atractiva y moderna en la pantalla de detalles de sala, para tener una mejor experiencia visual.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL use improved color scheme with gradients and modern styling
2. THE Room_Status SHALL be displayed with colored indicators (green for waiting, blue for active, gray for completed)
3. THE Member_List SHALL show user avatars or initials in colored circles
4. THE Room_Configuration SHALL use icons for genres and visual indicators for settings
5. THE Invitation_Code_Section SHALL have enhanced visual design with background, borders, and hover effects
6. THE Room_Details_Screen SHALL include subtle animations for loading states and transitions
7. THE Action_Buttons SHALL have improved styling with proper spacing, colors, and hover states
8. THE Room_Details_Screen SHALL use consistent typography hierarchy with proper font sizes and weights

### Requirement 10: Interactive Features Enhancement

**User Story:** Como usuario en una sala, quiero interacciones más fluidas y feedback visual, para una experiencia más engaging.

#### Acceptance Criteria

1. WHEN hovering over interactive elements, THE System SHALL provide visual feedback (hover effects, cursor changes)
2. WHEN copying the invitation code, THE System SHALL show animated confirmation with checkmark icon
3. THE Member_List SHALL show online status indicators with real-time updates
4. WHEN new members join, THE System SHALL show a brief welcome animation or notification
5. THE Room_Configuration SHALL be expandable/collapsible for better space utilization
6. THE Room_Details_Screen SHALL include pull-to-refresh functionality on mobile
7. WHEN actions are loading, THE System SHALL show appropriate loading spinners or skeleton screens
8. THE Room_Details_Screen SHALL provide haptic feedback on mobile for button interactions

### Requirement 11: Mobile and Web Compatibility

**User Story:** Como usuario que accede desde diferentes dispositivos, quiero que la pantalla de detalles funcione correctamente tanto en web como en móvil.

#### Acceptance Criteria

1. THE Room_Details_Screen SHALL render correctly on mobile devices (React Native)
2. THE Room_Details_Screen SHALL render correctly on web browsers (HTML/CSS/JS)
3. THE Room_Details_Screen SHALL maintain consistent functionality across platforms
4. THE Room_Details_Screen SHALL adapt layout appropriately for different screen sizes
5. THE Room_Details_Screen SHALL support touch interactions on mobile and click interactions on web