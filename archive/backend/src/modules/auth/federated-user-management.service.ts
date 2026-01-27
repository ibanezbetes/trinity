import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { MultiTableService } from '../../infrastructure/database/multi-table.service';
import { 
  User, 
  UserProfile, 
  FederatedIdentity, 
  AccountLinkingEvent, 
  FederatedTokenMetadata,
  CreateFederatedUserDto,
  LinkFederatedAccountDto,
  UpdateFederatedUserDto
} from '../../domain/entities/user.entity';

@Injectable()
export class FederatedUserManagementService {
  private readonly logger = new Logger(FederatedUserManagementService.name);

  constructor(
    private multiTableService: MultiTableService,
  ) {}

  /**
   * Crear usuario federado completo
   */
  async createFederatedUser(createDto: CreateFederatedUserDto): Promise<UserProfile> {
    try {
      const { googleUser, cognitoIdentityId, cognitoTokens } = createDto;
      
      const federatedIdentity: FederatedIdentity = {
        provider: 'google',
        providerId: googleUser.sub,
        providerEmail: googleUser.email,
        providerName: googleUser.name,
        providerPicture: googleUser.picture,
        providerLocale: googleUser.locale,
        providerDomain: googleUser.hd,
        linkedAt: new Date(),
        lastSyncAt: new Date(),
        isActive: true,
        metadata: {
          email_verified: googleUser.email_verified,
          given_name: googleUser.given_name,
          family_name: googleUser.family_name,
        },
      };

      const federatedTokens: FederatedTokenMetadata = {
        cognitoIdentityId,
        lastTokenRefresh: new Date(),
        tokenExpiresAt: new Date(Date.now() + (cognitoTokens.expiresIn || 3600) * 1000),
      };

      const linkingEvent: AccountLinkingEvent = {
        eventType: 'linked',
        provider: 'google',
        timestamp: new Date(),
        success: true,
        metadata: {
          cognitoIdentityId,
          initialCreation: true,
        },
      };

      const userId = `federated_${cognitoIdentityId}_${Date.now()}`;

      const user: User = {
        id: userId,
        email: googleUser.email,
        username: googleUser.email,
        emailVerified: googleUser.email_verified,
        createdAt: new Date(),
        updatedAt: new Date(),
        displayName: googleUser.name,
        avatarUrl: googleUser.picture,
        googleId: googleUser.sub,
        isGoogleLinked: true,
        authProviders: ['google'],
        lastGoogleSync: new Date(),
        federatedIdentities: [federatedIdentity],
        primaryAuthProvider: 'google',
        cognitoIdentityId,
        federatedTokens,
        accountLinkingHistory: [linkingEvent],
      };

      // Guardar en DynamoDB
      await this.multiTableService.createUser({
        userId: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        isGoogleLinked: user.isGoogleLinked,
        authProviders: user.authProviders,
        lastGoogleSync: user.lastGoogleSync?.toISOString(),
        federatedIdentities: JSON.stringify(user.federatedIdentities),
        primaryAuthProvider: user.primaryAuthProvider,
        cognitoIdentityId: user.cognitoIdentityId,
        federatedTokens: JSON.stringify(user.federatedTokens),
        accountLinkingHistory: JSON.stringify(user.accountLinkingHistory),
      });

      this.logger.log(`✅ Usuario federado creado: ${user.email} (${userId})`);
      
      return this.toUserProfile(user);
      
    } catch (error) {
      this.logger.error(`❌ Error creando usuario federado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Vincular identidad federada a usuario existente
   */
  async linkFederatedIdentity(linkDto: LinkFederatedAccountDto): Promise<UserProfile> {
    try {
      const { userId, provider, providerId, providerData } = linkDto;
      
      // Obtener usuario existente
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Verificar que no esté ya vinculado
      const existingIdentity = user.federatedIdentities?.find(
        identity => identity.provider === provider && identity.providerId === providerId
      );
      
      if (existingIdentity) {
        throw new ConflictException(`Identidad ${provider} ya está vinculada a este usuario`);
      }

      // Verificar que el proveedor no esté vinculado a otro usuario
      await this.validateProviderNotLinked(provider, providerId, userId);

      // Crear nueva identidad federada
      const newIdentity: FederatedIdentity = {
        provider,
        providerId,
        providerEmail: providerData.email,
        providerName: providerData.name,
        providerPicture: providerData.picture,
        providerLocale: providerData.locale,
        providerDomain: providerData.hd,
        linkedAt: new Date(),
        lastSyncAt: new Date(),
        isActive: true,
        metadata: providerData.metadata || {},
      };

      // Crear evento de vinculación
      const linkingEvent: AccountLinkingEvent = {
        eventType: 'linked',
        provider,
        timestamp: new Date(),
        success: true,
        metadata: {
          providerId,
          providerEmail: providerData.email,
        },
      };

      // Actualizar usuario
      const updatedIdentities = [...(user.federatedIdentities || []), newIdentity];
      const updatedHistory = [...(user.accountLinkingHistory || []), linkingEvent];
      const updatedProviders = [...new Set([...(user.authProviders || []), provider])];

      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: `
          SET federatedIdentities = :identities,
              accountLinkingHistory = :history,
              authProviders = :providers,
              isGoogleLinked = :isGoogleLinked,
              googleId = :googleId,
              lastGoogleSync = :lastSync
        `,
        ExpressionAttributeValues: {
          ':identities': JSON.stringify(updatedIdentities),
          ':history': JSON.stringify(updatedHistory),
          ':providers': updatedProviders,
          ':isGoogleLinked': provider === 'google' ? true : user.isGoogleLinked,
          ':googleId': provider === 'google' ? providerId : user.googleId,
          ':lastSync': provider === 'google' ? new Date().toISOString() : user.lastGoogleSync?.toISOString(),
        },
      });

      this.logger.log(`✅ Identidad ${provider} vinculada al usuario: ${userId}`);
      
      // Retornar usuario actualizado
      const updatedUser = await this.getUserById(userId);
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`❌ Error vinculando identidad federada: ${error.message}`);
      throw error;
    }
  }

  /**
   * Desvincular identidad federada
   */
  async unlinkFederatedIdentity(userId: string, provider: string): Promise<UserProfile> {
    try {
      // Obtener usuario existente
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Verificar que la identidad existe
      const identityIndex = user.federatedIdentities?.findIndex(
        identity => identity.provider === provider && identity.isActive
      );
      
      if (identityIndex === -1 || identityIndex === undefined) {
        throw new NotFoundException(`Identidad ${provider} no encontrada o ya desvinculada`);
      }

      // Verificar que no es el único método de autenticación
      const activeProviders = user.authProviders?.filter(p => p !== provider) || [];
      if (activeProviders.length === 0) {
        throw new ConflictException(
          `No se puede desvincular ${provider}: es el único método de autenticación`
        );
      }

      // Marcar identidad como inactiva
      const updatedIdentities = [...(user.federatedIdentities || [])];
      updatedIdentities[identityIndex] = {
        ...updatedIdentities[identityIndex],
        isActive: false,
        lastSyncAt: new Date(),
      };

      // Crear evento de desvinculación
      const unlinkingEvent: AccountLinkingEvent = {
        eventType: 'unlinked',
        provider,
        timestamp: new Date(),
        success: true,
        metadata: {
          providerId: updatedIdentities[identityIndex].providerId,
        },
      };

      const updatedHistory = [...(user.accountLinkingHistory || []), unlinkingEvent];
      const updatedProviders = user.authProviders?.filter(p => p !== provider) || [];

      // Actualizar campos específicos del proveedor
      const updateFields: any = {
        federatedIdentities: JSON.stringify(updatedIdentities),
        accountLinkingHistory: JSON.stringify(updatedHistory),
        authProviders: updatedProviders,
      };

      if (provider === 'google') {
        updateFields.isGoogleLinked = false;
        updateFields.googleId = null;
      }

      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: `
          SET federatedIdentities = :identities,
              accountLinkingHistory = :history,
              authProviders = :providers,
              isGoogleLinked = :isGoogleLinked,
              googleId = :googleId
        `,
        ExpressionAttributeValues: {
          ':identities': updateFields.federatedIdentities,
          ':history': updateFields.accountLinkingHistory,
          ':providers': updateFields.authProviders,
          ':isGoogleLinked': updateFields.isGoogleLinked || user.isGoogleLinked,
          ':googleId': updateFields.googleId !== undefined ? updateFields.googleId : user.googleId,
        },
      });

      this.logger.log(`✅ Identidad ${provider} desvinculada del usuario: ${userId}`);
      
      // Retornar usuario actualizado
      const updatedUser = await this.getUserById(userId);
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`❌ Error desvinculando identidad federada: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar metadatos de identidad federada
   */
  async updateFederatedIdentity(updateDto: UpdateFederatedUserDto): Promise<UserProfile> {
    try {
      const { userId, federatedIdentity, syncData } = updateDto;
      
      // Obtener usuario existente
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Encontrar y actualizar la identidad
      const identityIndex = user.federatedIdentities?.findIndex(
        identity => identity.provider === federatedIdentity.provider && identity.isActive
      );
      
      if (identityIndex === -1 || identityIndex === undefined) {
        throw new NotFoundException(`Identidad ${federatedIdentity.provider} no encontrada`);
      }

      const updatedIdentities = [...(user.federatedIdentities || [])];
      updatedIdentities[identityIndex] = {
        ...updatedIdentities[identityIndex],
        ...federatedIdentity,
        lastSyncAt: new Date(),
      };

      // Crear evento de sincronización
      const syncEvent: AccountLinkingEvent = {
        eventType: 'token_refreshed',
        provider: federatedIdentity.provider!,
        timestamp: new Date(),
        success: true,
        metadata: syncData || {},
      };

      const updatedHistory = [...(user.accountLinkingHistory || []), syncEvent];

      await this.multiTableService.update('trinity-users-dev', { userId }, {
        UpdateExpression: `
          SET federatedIdentities = :identities,
              accountLinkingHistory = :history,
              lastGoogleSync = :lastSync
        `,
        ExpressionAttributeValues: {
          ':identities': JSON.stringify(updatedIdentities),
          ':history': JSON.stringify(updatedHistory),
          ':lastSync': federatedIdentity.provider === 'google' ? new Date().toISOString() : user.lastGoogleSync?.toISOString(),
        },
      });

      this.logger.log(`✅ Identidad federada actualizada: ${userId} (${federatedIdentity.provider})`);
      
      // Retornar usuario actualizado
      const updatedUser = await this.getUserById(userId);
      return this.toUserProfile(updatedUser!);
      
    } catch (error) {
      this.logger.error(`❌ Error actualizando identidad federada: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener identidades federadas de un usuario
   */
  async getFederatedIdentities(userId: string): Promise<FederatedIdentity[]> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      return user.federatedIdentities?.filter(identity => identity.isActive) || [];
      
    } catch (error) {
      this.logger.error(`❌ Error obteniendo identidades federadas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar usuario por proveedor federado
   */
  async findUserByFederatedProvider(provider: string, providerId: string): Promise<UserProfile | null> {
    try {
      // Buscar por campo específico del proveedor para optimización
      if (provider === 'google') {
        const items = await this.multiTableService.scan('trinity-users-dev', {
          FilterExpression: 'googleId = :googleId',
          ExpressionAttributeValues: {
            ':googleId': providerId,
          },
        });

        if (items.length > 0) {
          const user = this.mapDynamoToUser(items[0]);
          return this.toUserProfile(user);
        }
      }

      // Búsqueda general en identidades federadas
      const items = await this.multiTableService.scan('trinity-users-dev', {
        FilterExpression: 'contains(federatedIdentities, :providerId)',
        ExpressionAttributeValues: {
          ':providerId': providerId,
        },
      });

      for (const item of items) {
        const user = this.mapDynamoToUser(item);
        const hasProvider = user.federatedIdentities?.some(
          identity => identity.provider === provider && 
                     identity.providerId === providerId && 
                     identity.isActive
        );
        
        if (hasProvider) {
          return this.toUserProfile(user);
        }
      }

      return null;
      
    } catch (error) {
      this.logger.error(`❌ Error buscando usuario por proveedor federado: ${error.message}`);
      return null;
    }
  }

  /**
   * Validar que un proveedor no esté vinculado a otro usuario
   */
  private async validateProviderNotLinked(provider: string, providerId: string, excludeUserId: string): Promise<void> {
    const existingUser = await this.findUserByFederatedProvider(provider, providerId);
    
    if (existingUser && existingUser.id !== excludeUserId) {
      throw new ConflictException(
        `Esta cuenta de ${provider} ya está vinculada a otro usuario`
      );
    }
  }

  /**
   * Obtener usuario por ID
   */
  private async getUserById(userId: string): Promise<User | null> {
    try {
      const item = await this.multiTableService.getUser(userId);
      if (!item) return null;
      
      return this.mapDynamoToUser(item);
      
    } catch (error) {
      this.logger.error(`❌ Error obteniendo usuario ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Mapear datos de DynamoDB a User
   */
  private mapDynamoToUser(item: any): User {
    return {
      id: item.userId,
      email: item.email,
      username: item.username,
      emailVerified: item.emailVerified,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      phoneNumber: item.phoneNumber,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      googleId: item.googleId,
      isGoogleLinked: item.isGoogleLinked,
      authProviders: item.authProviders || [],
      lastGoogleSync: item.lastGoogleSync ? new Date(item.lastGoogleSync) : undefined,
      federatedIdentities: item.federatedIdentities ? JSON.parse(item.federatedIdentities) : [],
      primaryAuthProvider: item.primaryAuthProvider,
      cognitoIdentityId: item.cognitoIdentityId,
      federatedTokens: item.federatedTokens ? JSON.parse(item.federatedTokens) : undefined,
      accountLinkingHistory: item.accountLinkingHistory ? JSON.parse(item.accountLinkingHistory) : [],
    };
  }

  /**
   * Convertir User a UserProfile
   */
  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      googleId: user.googleId,
      isGoogleLinked: user.isGoogleLinked,
      authProviders: user.authProviders,
      federatedIdentities: user.federatedIdentities,
      primaryAuthProvider: user.primaryAuthProvider,
      cognitoIdentityId: user.cognitoIdentityId,
    };
  }
}