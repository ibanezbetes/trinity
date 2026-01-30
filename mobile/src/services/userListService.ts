import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserListItem {
  id: string; // formato: "movie-123" o "tv-456"
  title: string;
  poster?: string;
  mediaType: 'movie' | 'tv';
  year: string;
  addedAt: string;
}

class UserListService {
  private readonly STORAGE_KEY = 'userList';

  /**
   * Obtener todos los elementos de la lista del usuario
   */
  async getUserList(): Promise<UserListItem[]> {
    try {
      const listData = await AsyncStorage.getItem(this.STORAGE_KEY);
      return listData ? JSON.parse(listData) : [];
    } catch (error) {
      console.error('Error getting user list:', error);
      return [];
    }
  }

  /**
   * Verificar si un elemento está en la lista
   */
  async isInList(itemId: string): Promise<boolean> {
    try {
      const list = await this.getUserList();
      return list.some(item => item.id === itemId);
    } catch (error) {
      console.error('Error checking if item is in list:', error);
      return false;
    }
  }

  /**
   * Añadir un elemento a la lista
   */
  async addToList(item: UserListItem): Promise<void> {
    try {
      const list = await this.getUserList();
      
      // Verificar si ya está en la lista
      if (list.some(existingItem => existingItem.id === item.id)) {
        return; // Ya está en la lista
      }

      // Añadir al principio de la lista
      const updatedList = [{ ...item, addedAt: new Date().toISOString() }, ...list];
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedList));
    } catch (error) {
      console.error('Error adding to list:', error);
      throw error;
    }
  }

  /**
   * Remover un elemento de la lista
   */
  async removeFromList(itemId: string): Promise<void> {
    try {
      const list = await this.getUserList();
      const updatedList = list.filter(item => item.id !== itemId);
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedList));
    } catch (error) {
      console.error('Error removing from list:', error);
      throw error;
    }
  }

  /**
   * Obtener el número de elementos en la lista
   */
  async getListCount(): Promise<number> {
    try {
      const list = await this.getUserList();
      return list.length;
    } catch (error) {
      console.error('Error getting list count:', error);
      return 0;
    }
  }

  /**
   * Limpiar toda la lista
   */
  async clearList(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing list:', error);
      throw error;
    }
  }
}

export const userListService = new UserListService();