import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TriniAITCGService, { CardPack, MovieCard } from '../src/services/TriniAITCGService';

export default function TriniAITCGTestScreen() {
  const [loading, setLoading] = useState(false);
  const [cardPack, setCardPack] = useState<CardPack | null>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);

  const generatePack = async () => {
    try {
      setLoading(true);
      const pack = await TriniAITCGService.generateCardPack({
        pack_type: 'standard',
        language: 'es',
        user_id: 'test-mobile-user'
      });
      setCardPack(pack);
      Alert.alert('¡Éxito!', `Pack generado con ${pack.cards.length} cartas`);
    } catch (error) {
      Alert.alert('Error', `No se pudo generar el pack: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    try {
      const health = await TriniAITCGService.getHealthStatus();
      setHealthStatus(health);
      Alert.alert('Estado del Sistema', `Status: ${health.status}`);
    } catch (error) {
      Alert.alert('Error', `No se pudo verificar el estado: ${error}`);
    }
  };

  const renderCard = (card: MovieCard, index: number) => (
    <View key={card.id} style={[styles.card, { borderColor: TriniAITCGService.getRarityColor(card.rarity) }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardRarity}>
          {TriniAITCGService.getRarityEmoji(card.rarity)} {card.rarity}
        </Text>
      </View>
      
      {card.metadata.poster_path && (
        <Image
          source={{ uri: TriniAITCGService.getTMDBImageURL(card.metadata.poster_path) }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      )}
      
      <View style={styles.cardContent}>
        <Text style={styles.cardYear}>{card.year} • {card.genre}</Text>
        <Text style={styles.cardFlavor}>{card.flavor_text}</Text>
        <Text style={styles.cardOverview} numberOfLines={3}>
          {card.metadata.overview}
        </Text>
        
        <View style={styles.cardStats}>
          <Text style={styles.cardStat}>⭐ {card.metadata.vote_average.toFixed(1)}</Text>
          <Text style={styles.cardStat}>👥 {card.metadata.vote_count}</Text>
          <Text style={styles.cardStat}>🔥 {card.metadata.popularity.toFixed(0)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>🎮 Trini AI TCG Test</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={generatePack}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>🎲 Generar Pack de Cartas</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={checkHealth}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>🏥 Check Health</Text>
          </TouchableOpacity>
        </View>

        {healthStatus && (
          <View style={styles.healthContainer}>
            <Text style={styles.sectionTitle}>Estado del Sistema</Text>
            <Text style={styles.healthText}>
              Status: {healthStatus.status} {healthStatus.status === 'healthy' ? '✅' : '⚠️'}
            </Text>
            <Text style={styles.healthText}>
              TMDB: {healthStatus.services?.tmdb?.status === 'healthy' ? '✅' : '❌'}
            </Text>
            <Text style={styles.healthText}>
              Cache: {healthStatus.services?.cache?.status === 'healthy' ? '✅' : '❌'}
            </Text>
          </View>
        )}

        {cardPack && (
          <View style={styles.packContainer}>
            <Text style={styles.sectionTitle}>
              🎁 Pack: {cardPack.pack_type} ({cardPack.cards.length} cartas)
            </Text>
            <Text style={styles.packId}>ID: {cardPack.pack_id}</Text>
            
            {cardPack.cards.map(renderCard)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  secondaryButtonText: {
    color: '#3B82F6',
  },
  healthContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  healthText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#666',
  },
  packContainer: {
    marginBottom: 20,
  },
  packId: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  cardRarity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  cardImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardContent: {
    gap: 8,
  },
  cardYear: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  cardFlavor: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#8B5CF6',
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 8,
  },
  cardOverview: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cardStat: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});