import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    Linking,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCognitoAuth } from '../../../src/context/CognitoAuthContext';
import { RoomDetails, roomService } from '../../../src/services/roomService';
import { borderRadius, colors, fontSize, spacing } from '../../../src/utils/theme';

// Genre mapping for display
const GENRES = [
  { id: '28', name: 'Acción', icon: '💥' },
  { id: '12', name: 'Aventura', icon: '🗺️' },
  { id: '878', name: 'Ciencia Ficción', icon: '🚀' },
  { id: '35', name: 'Comedia', icon: '😂' },
  { id: '18', name: 'Drama', icon: '🎭' },
  { id: '27', name: 'Terror', icon: '👻' },
  { id: '53', name: 'Thriller', icon: '😱' },
  { id: '10749', name: 'Romance', icon: '💕' },
  { id: '14', name: 'Fantasía', icon: '🧙' },
  { id: '99', name: 'Documental', icon: '📹' },
  { id: '16', name: 'Animación', icon: '🎨' },
  { id: '80', name: 'Crimen', icon: '🔍' },
];

export default function RoomDetailsScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCognitoAuth();
  
  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Helper function to generate share URLs
  const getShareUrl = (inviteCode: string) => {
    // In production, this would be your actual domain
    // For now, we'll use a generic format or just the code
    return `https://trinity.app/join/${inviteCode}`;
  };

  const getShareMessage = (roomName: string, inviteCode: string) => {
    return `¡Únete a mi sala de Trinity! 🎬\n\nSala: ${roomName}\nCódigo: ${inviteCode}\n\nDescarga Trinity y usa el código para unirte.`;
  };
  useEffect(() => {
    if (!roomId) return;
    
    const loadRoomData = async () => {
      try {
        setLoading(true);
        const details = await roomService.getRoomDetails(roomId);
        setRoomDetails(details);
        
        // Check if current user is host by comparing user ID with hostId
        const currentUserId = user?.sub || user?.id;
        const roomHostId = details.room.hostId || details.room.creatorId;
        
        console.log('🔍 Host check:', {
          currentUserId,
          roomHostId,
          userRole: details.userRole,
          isMatch: currentUserId === roomHostId
        });
        
        // User is host if their ID matches the hostId/creatorId OR if userRole indicates they're the creator
        const userIsHost = (currentUserId === roomHostId) || 
                          (details.userRole === 'creator') || 
                          (details.userRole === 'host');
        
        setIsHost(userIsHost);
        
        console.log('✅ User is host:', userIsHost);
        
      } catch (error) {
        console.error('Error loading room details:', error);
        Alert.alert('Error', 'No se pudo cargar los detalles de la sala');
      } finally {
        setLoading(false);
      }
    };

    loadRoomData();
  }, [roomId]);

  const handleStartVoting = () => {
    // Navigate to voting screen
    router.push(`/room/${roomId}`);
  };

  const handleCopyInviteCode = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      Clipboard.setString(inviteCode);
      Alert.alert('¡Copiado!', 'Código de invitación copiado al portapapeles');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'No se pudo copiar el código');
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      Clipboard.setString(inviteCode);
      Alert.alert('¡Copiado!', 'Código de invitación copiado al portapapeles');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'No se pudo copiar el código');
    }
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Salir de la sala',
      '¿Estás seguro de que quieres salir de esta sala?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Salir', 
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  const handleShareWhatsApp = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      const roomName = roomDetails?.room.name || 'Sala';
      const message = getShareMessage(roomName, inviteCode);
      
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp no está instalado en este dispositivo');
      }
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error);
      Alert.alert('Error', 'No se pudo compartir por WhatsApp');
    }
  };

  const handleShareEmail = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      const roomName = roomDetails?.room.name || 'Sala';
      const subject = `Invitación a Trinity - ${roomName}`;
      const body = `¡Hola!\n\nTe invito a unirte a mi sala de Trinity para votar películas juntos.\n\nSala: ${roomName}\nCódigo de invitación: ${inviteCode}\n\nDescarga la app Trinity y usa el código para unirte.\n\n¡Nos vemos allí! 🎬`;
      
      const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await Linking.openURL(emailUrl);
    } catch (error) {
      console.error('Error sharing via email:', error);
      Alert.alert('Error', 'No se pudo abrir el cliente de correo');
    }
  };

  const handleShareSMS = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      const roomName = roomDetails?.room.name || 'Sala';
      const message = getShareMessage(roomName, inviteCode);
      
      const smsUrl = Platform.OS === 'ios' 
        ? `sms:&body=${encodeURIComponent(message)}`
        : `sms:?body=${encodeURIComponent(message)}`;
      
      await Linking.openURL(smsUrl);
    } catch (error) {
      console.error('Error sharing via SMS:', error);
      Alert.alert('Error', 'No se pudo abrir la aplicación de mensajes');
    }
  };

  const handleShareGeneric = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      const roomName = roomDetails?.room.name || 'Sala';
      const message = getShareMessage(roomName, inviteCode);
      
      await Share.share({
        message: message,
        title: `Invitación a ${roomName}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando detalles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!roomDetails) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>No se pudieron cargar los detalles de la sala</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalles de la Sala</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Room Info */}
        <View style={styles.section}>
          <Text style={styles.roomName}>{roomDetails.room.name}</Text>
          {roomDetails.room.description && (
            <Text style={styles.roomDescription}>{roomDetails.room.description}</Text>
          )}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={styles.statusText}>Esperando participantes</Text>
          </View>
        </View>

        {/* Invite Code Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Código de Invitación</Text>
          
          {/* Enhanced Invite Code Display */}
          <View style={styles.enhancedInviteCodeContainer}>
            <View style={styles.inviteCodeBox}>
              <Text style={styles.inviteCodeLabel}>Código</Text>
              <Text style={styles.enhancedInviteCode}>{roomDetails.room.inviteCode || 'ABC123'}</Text>
            </View>
            <TouchableOpacity style={styles.enhancedCopyButton} onPress={handleCopyInviteCode}>
              <Ionicons name="copy-outline" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Prominent Invite Button */}
          <TouchableOpacity style={styles.inviteButton} onPress={() => setShowInviteModal(true)}>
            <View style={styles.inviteButtonContent}>
              <Ionicons name="person-add" size={24} color="#FFF" />
              <Text style={styles.inviteButtonText}>Invitar Amigos</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleCopyInviteCode()}>
            <Text style={styles.shareText}>
              Código: {roomDetails.room.inviteCode || 'ABC123'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Miembros ({roomDetails.room.memberCount || 1})</Text>
          
          {/* Show actual members if available */}
          {roomDetails.members && roomDetails.members.length > 0 ? (
            roomDetails.members.map((member, index) => (
              <View key={member.userId} style={styles.memberItem}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {member.userId.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.userId === roomDetails.room.hostId ? 'Tú (Host)' : member.userId}
                  </Text>
                  <Text style={styles.memberRole}>
                    {member.role === 'creator' ? 'Host' : 'Miembro'}
                  </Text>
                </View>
                <View style={styles.memberStatus}>
                  <View style={[
                    styles.statusDot, 
                    { backgroundColor: member.status === 'active' ? colors.success : colors.textMuted }
                  ]} />
                </View>
              </View>
            ))
          ) : (
            // Fallback display for when member data is not available
            <View style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>T</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>test@trinity.app</Text>
                <Text style={styles.memberRole}>Host</Text>
              </View>
              <View style={styles.memberStatus}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              </View>
            </View>
          )}
          
          {roomDetails.room.memberCount === 1 && (
            <Text style={styles.emptyMembersText}>Solo tú por ahora</Text>
          )}
        </View>

        {/* Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎭 Configuración</Text>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Géneros:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.genrePreferences && roomDetails.room.genrePreferences.length > 0
                ? roomDetails.room.genrePreferences
                    .map(genreId => GENRES.find(g => g.id === genreId)?.name || genreId)
                    .join(', ')
                : 'Todos los géneros'}
            </Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Películas:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.masterList?.length > 0 
                ? `${roomDetails.room.masterList.length} películas` 
                : '~50 películas'}
            </Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Votación:</Text>
            <Text style={styles.configValue}>Sistema Like/Dislike</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Tipo:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.isPrivate ? 'Sala privada' : 'Sala pública'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Ask Trini Button */}
        <TouchableOpacity 
          style={styles.askTriniButton} 
          onPress={() => router.push('/trini-chatbot')}
        >
          <View style={styles.askTriniContent}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
            <Text style={styles.askTriniText}>🤖 Pregunta a Trini</Text>
          </View>
          <Text style={styles.askTriniSubtext}>Recomendaciones con IA</Text>
        </TouchableOpacity>

        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={handleStartVoting}>
            <Ionicons name="play" size={20} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.startButtonText}>🚀 Empezar Votación</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Esperando al host...</Text>
          </View>
        )}
        
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveRoom}>
          <Text style={styles.leaveButtonText}>Salir de la Sala</Text>
        </TouchableOpacity>
      </View>

      {/* Invitation Modal */}
      {showInviteModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invitar a {roomDetails?.room.name}</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Share Options */}
            <View style={styles.shareOptions}>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareWhatsApp}>
                <View style={[styles.shareIconContainer, { backgroundColor: '#25D366' }]}>
                  <Ionicons name="logo-whatsapp" size={28} color="#FFF" />
                </View>
                <Text style={styles.shareOptionText}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={handleShareEmail}>
                <View style={[styles.shareIconContainer, { backgroundColor: '#EA4335' }]}>
                  <Ionicons name="mail" size={28} color="#FFF" />
                </View>
                <Text style={styles.shareOptionText}>Email</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={handleShareSMS}>
                <View style={[styles.shareIconContainer, { backgroundColor: '#34B7F1' }]}>
                  <Ionicons name="chatbubble" size={28} color="#FFF" />
                </View>
                <Text style={styles.shareOptionText}>SMS</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={handleCopyShareLink}>
                <View style={[styles.shareIconContainer, { backgroundColor: colors.primary }]}>
                  <Ionicons name="link" size={28} color="#FFF" />
                </View>
                <Text style={styles.shareOptionText}>Copiar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOption} onPress={handleShareGeneric}>
                <View style={[styles.shareIconContainer, { backgroundColor: '#6C757D' }]}>
                  <Ionicons name="share-social" size={28} color="#FFF" />
                </View>
                <Text style={styles.shareOptionText}>Más</Text>
              </TouchableOpacity>
            </View>

            {/* QR Code Placeholder */}
            <View style={styles.qrCodeSection}>
              <Text style={styles.qrCodeTitle}>Escanea para unirte</Text>
              <View style={styles.qrCodePlaceholder}>
                <Ionicons name="qr-code" size={120} color={colors.textMuted} />
                <Text style={styles.qrCodeText}>Código QR</Text>
              </View>
              <Text style={styles.qrCodeSubtitle}>
                Código: {roomDetails?.room.inviteCode || 'ABC123'}
              </Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerRight: {
    width: 40, // Same width as back button for centering
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  roomName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  roomDescription: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inviteCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  enhancedInviteCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  inviteCodeBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.primary + '40', // 40 = 25% opacity
    alignItems: 'center',
  },
  inviteCodeLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  enhancedInviteCode: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
    fontFamily: 'monospace',
    letterSpacing: 4,
  },
  enhancedCopyButton: {
    backgroundColor: colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  inviteButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inviteButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  inviteCode: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: spacing.sm,
  },
  shareText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: 'monospace',
    textDecorationLine: 'underline',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberRole: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  memberStatus: {
    padding: spacing.xs,
  },
  emptyMembersText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  configLabel: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  configValue: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  actionsContainer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  waitingContainer: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  waitingText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontStyle: 'italic',
  },
  leaveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  shareOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
  },
  shareOption: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  shareIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  shareOptionText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  qrCodeSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  qrCodeTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  qrCodePlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  qrCodeText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  qrCodeSubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  askTriniButton: {
    backgroundColor: '#8B5CF6', // Purple color for Trini
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 3,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  askTriniContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  askTriniText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  askTriniSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});