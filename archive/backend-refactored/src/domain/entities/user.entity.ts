/**
 * User Domain Entity
 * Core business entity representing a user in the Trinity system
 */

export interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}

export class User {
  public readonly preferences: UserPreferences;

  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly googleId: string,
    public readonly cognitoId: string,
    public readonly avatarUrl?: string,
    preferences?: UserPreferences,
    public readonly createdAt: Date = new Date(),
    public readonly lastActiveAt: Date = new Date(),
  ) {
    // Ensure preferences are always set with defaults
    this.preferences = {
      theme: 'light',
      notifications: true,
      language: 'en',
      ...preferences,
    };
  }

  /**
   * Updates the user's last active timestamp
   */
  updateLastActive(): User {
    return new User(
      this.id,
      this.email,
      this.displayName,
      this.googleId,
      this.cognitoId,
      this.avatarUrl,
      this.preferences,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Updates user preferences
   */
  updatePreferences(newPreferences: Partial<UserPreferences>): User {
    // Filter out undefined values to preserve existing preferences
    const filteredPreferences = Object.entries(newPreferences)
      .filter(([_, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return new User(
      this.id,
      this.email,
      this.displayName,
      this.googleId,
      this.cognitoId,
      this.avatarUrl,
      { ...this.preferences, ...filteredPreferences },
      this.createdAt,
      this.lastActiveAt,
    );
  }

  /**
   * Checks if the user is active (last active within 30 days)
   */
  isActive(): boolean {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.lastActiveAt > thirtyDaysAgo;
  }
}