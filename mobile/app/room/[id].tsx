import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  PanResponder,
  Alert,
  Easing,
  RefreshControl,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { roomService, RoomDetails } from '../../src/services/roomService';
import { appSyncService } from '../../src/services/appSyncService';
import { matchService, Match } from '../../src/services/matchService';
import { mediaService, MediaItem, MediaItemDetails } from '../../src/services/mediaService';
import { moviePreloadService } from '../../src/services/moviePreloadService';
import { useConnectionStatus, useRoomSubscriptions } from '../../src/hooks/useConnectionStatus';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

interface VoteUpdate {
  roomId: string;
  userId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'POLLING_UPDATE';
  currentVotes: number;
  totalMembers: number;
  timestamp: string;
}

interface MatchFound {
  roomId: string;
  movieId: string;
  movieTitle: string;
  participants: string[];
  timestamp: string;
}

interface RoomUpdate {
  id: string;
  status: string;
  memberCount: number;
  currentMovieIndex: number;
  totalMovies: number;
}

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [currentMedia, setCurrentMedia] = useState<MediaItemDetails | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [voteCount, setVoteCount] = useState(0);
  const [matchFound, setMatchFound] = useState<MatchFound | null>(null);
  const [votingComplete, setVotingComplete] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [matchedMedia, setMatchedMedia] = useState<MediaItemDetails | null>(null);
  const [roomStatus, setRoomStatus] = useState<string>('WAITING');

  const [refreshing, setRefreshing] = useState(false);

  // Track voted movies in this session to prevent duplicates
  const votedMovieIds = useRef<string[]>([]);

  // Helper functions for persisting voted movies
  const getVotedMoviesKey = (roomId: string) => `voted_movies_${roomId}`;

  const loadVotedMovies = async (roomId: string) => {
    try {
      const key = getVotedMoviesKey(roomId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const votedIds = JSON.parse(stored);
        votedMovieIds.current = votedIds;
        console.log(`📱 Loaded ${votedIds.length} voted movies from storage for room ${roomId}`);
      } else {
        votedMovieIds.current = [];
        console.log(`📱 No voted movies found in storage for room ${roomId}`);
      }
    } catch (error) {
      console.error('Error loading voted movies:', error);
      votedMovieIds.current = [];
    }
  };

  const saveVotedMovies = async (roomId: string, votedIds: string[]) => {
    try {
      const key = getVotedMoviesKey(roomId);
      await AsyncStorage.setItem(key, JSON.stringify(votedIds));
      console.log(`💾 Saved ${votedIds.length} voted movies to storage for room ${roomId}`);
    } catch (error) {
      console.error('Error saving voted movies:', error);
    }
  };

  const addVotedMovie = async (roomId: string, movieId: string) => {
    if (!votedMovieIds.current.includes(movieId)) {
      votedMovieIds.current = [...votedMovieIds.current, movieId];
      await saveVotedMovies(roomId, votedMovieIds.current);
      console.log(`✅ Added movie ${movieId} to voted list (total: ${votedMovieIds.current.length})`);
    }
  };

  // Animation values
  const position = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const matchAnimation = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const matchOpacity = useRef(new Animated.Value(0)).current;
  const matchScale = useRef(new Animated.Value(0.8)).current;

  // Connection status
  const { connectionStatus, subscribeToRoom, unsubscribeFromRoom, reconnect } = useConnectionStatus();
  const roomSubscriptions = useRoomSubscriptions(roomId);

  // Progress tracking
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0
  });

  const [preloadStatus, setPreloadStatus] = useState({
    isPreloading: false,
    nextMoviesReady: 0,
    totalPreloaded: 0
  });

  // Load room data
  useEffect(() => {
    if (!roomId) return;

    const loadRoomData = async () => {
      try {
        setLoading(true);
        
        // Load voted movies from storage first
        await loadVotedMovies(roomId);
        console.log(`📱 Room ${roomId}: Loaded ${votedMovieIds.current.length} previously voted movies from storage`);
        
        const details = await roomService.getRoomDetails(roomId);
        setRoomDetails(details);
        setMemberCount(details.room.memberCount || 0);
        
        // Check room status and handle MATCHED state
        const currentStatus = details.room.status || 'WAITING';
        setRoomStatus(currentStatus);
        
        console.log(`🏠 Room ${roomId} status: ${currentStatus}`);
        
        // If room is already MATCHED, show match screen immediately
        if (currentStatus === 'MATCHED' && details.room.resultMovieId) {
          console.log(`🎉 Room already has match: ${details.room.resultMovieId}`);
          try {
            // Load the matched movie details
            const matchedMovie = await mediaService.getMediaDetails(details.room.resultMovieId);
            setMatchedMedia(matchedMovie);
            setShowMatch(true);
            setVotingComplete(true);
            
            // Animate match celebration
            Animated.parallel([
              Animated.timing(matchOpacity, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
              }),
              Animated.spring(matchScale, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
              }),
            ]).start();
            
            return; // Don't load current media if already matched
          } catch (error) {
            console.error('Error loading matched movie details:', error);
          }
        }

        // Load current media using NEW 50-MOVIE CACHE SYSTEM
        console.log('🎬 Loading first movie using NEW 50-MOVIE CACHE SYSTEM...');
        
        try {
          const nextMovieResult = await appSyncService.getNextMovieForUser(roomId);
          
          if (nextMovieResult?.getNextMovieForUser?.isUserFinished) {
            console.log('👤 User already finished all 50 movies');
            setCurrentMedia(null);
            setVotingComplete(true);
            
            // Update progress to show completion
            setProgress({
              current: 50,
              total: 50,
              percentage: 100
            });
            
            // Show appropriate end-game message
            const message = nextMovieResult.getNextMovieForUser.message || 'A ver si hay suerte y haceis un match';
            Alert.alert('Has terminado de votar', message, [{ text: 'OK' }]);
            
          } else if (nextMovieResult?.getNextMovieForUser) {
            const firstMovie = nextMovieResult.getNextMovieForUser;
            
            // Transform to MediaItemDetails format
            const media: MediaItemDetails = {
              id: firstMovie.id,
              remoteId: firstMovie.id,
              title: firstMovie.title,
              overview: firstMovie.overview || '',
              poster: firstMovie.poster,
              release_date: firstMovie.release_date || '',
              runtime: firstMovie.runtime || 0,
              vote_average: firstMovie.vote_average || 0,
              genres: firstMovie.genres || [],
              rating: firstMovie.vote_average || 0,
              voteCount: 0,
              mediaType: 'movie' as const,
              // Properties expected by room screen
              mediaPosterPath: firstMovie.poster,
              mediaTitle: firstMovie.title,
              mediaYear: firstMovie.release_date ? firstMovie.release_date.split('-')[0] : '',
              mediaOverview: firstMovie.overview || '',
              mediaRating: firstMovie.vote_average || null,
            };
            
            setCurrentMedia(media);
            console.log('🎬 First movie loaded (50-MOVIE CACHE):', media.title);
            
            // Update progress if available
            if (firstMovie.progress) {
              setProgress({
                current: firstMovie.progress.votedCount || 0,
                total: firstMovie.progress.totalMovies || 50,
                percentage: Math.round(((firstMovie.progress.votedCount || 0) / (firstMovie.progress.totalMovies || 50)) * 100)
              });
            }
          } else {
            console.warn('⚠️ No movies available for user');
            setCurrentMedia(null);
          }
        } catch (movieError) {
          console.error('❌ Error loading first movie (50-MOVIE CACHE):', movieError);
          
          // Fallback to old system if new system fails
          console.log('🔄 Falling back to old system...');
          const media = await mediaService.getCurrentMedia(roomId, votedMovieIds.current);
          setCurrentMedia(media);
          
          // Set default progress for fallback
          setProgress({
            current: details.room.currentMovieIndex || 0,
            total: details.room.totalMovies || 50,
            percentage: Math.round(((details.room.currentMovieIndex || 0) / (details.room.totalMovies || 50)) * 100)
          });
        }

      } catch (error) {
        console.error('Error loading room:', error);
        Alert.alert('Error', 'No se pudo cargar la sala');
      } finally {
        setLoading(false);
      }
    };

    loadRoomData();
  }, [roomId]);

  // Refresh function with match detection
  const onRefresh = useCallback(async () => {
    // Check for matches before refresh
    const hasMatch = await checkForMatchesBeforeAction('REFRESH');
    if (hasMatch) return; // Don't refresh if match found
    
    setRefreshing(true);
    try {
      // Reload room data
      const details = await roomService.getRoomDetails(roomId!);
      setRoomDetails(details);
      setMemberCount(details.room.memberCount || 0);
      
      // Check room status
      const currentStatus = details.room.status || 'WAITING';
      setRoomStatus(currentStatus);
      
      if (currentStatus === 'MATCHED' && details.room.resultMovieId) {
        const matchedMovie = await mediaService.getMediaDetails(details.room.resultMovieId);
        setMatchedMedia(matchedMovie);
        setShowMatch(true);
        setVotingComplete(true);
      }
      
      console.log('✅ Room data refreshed');
    } catch (error) {
      console.error('❌ Error refreshing room data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [roomId]);

  // Helper function to check for matches before any user action
  const checkForMatchesBeforeAction = async (actionType: string, additionalData?: any) => {
    try {
      console.log(`🔍 Checking for matches before ${actionType} action...`);
      
      const matchCheck = await appSyncService.checkMatchBeforeAction(roomId!, {
        type: actionType,
        ...additionalData
      });

      if (matchCheck?.checkMatchBeforeAction?.isMatch) {
        console.log(`🎉 MATCH FOUND BEFORE ${actionType}!`);
        
        // Update room status
        setRoomStatus('MATCHED');
        
        // Show match found
        const matchData = matchCheck.checkMatchBeforeAction;
        setMatchFound({
          roomId: roomId!,
          movieId: matchData.matchedMovie?.id || 'unknown',
          movieTitle: matchData.matchedMovie?.title || matchData.message || 'Película encontrada',
          participants: [],
          timestamp: new Date().toISOString()
        });
        
        // Animate match overlay
        Animated.spring(matchAnimation, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
        
        return true; // Match found
      }
      
      return false; // No match
    } catch (error) {
      console.warn(`⚠️ Match detection failed for ${actionType}:`, error);
      return false; // Continue with action on error
    }
  };

  // Helper functions for swipe actions
  const swipeLeft = () => completeSwipe('left');
  const swipeRight = () => completeSwipe('right');

  // Cleanup voted movies when leaving room
  useEffect(() => {
    return () => {
      // Optional: Clear voted movies when component unmounts
      // This can be uncommented if you want to reset voted movies when leaving the room
      // votedMovieIds.current = [];
    };
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!roomId) return;

    const handleVoteUpdate = (update: VoteUpdate) => {
      setVoteCount(update.currentVotes);
      setMemberCount(update.totalMembers);
    };

    const handleMatchFound = (match: MatchFound) => {
      setMatchFound(match);
      // Animate match overlay
      Animated.spring(matchAnimation, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    const handleRoomUpdate = (update: RoomUpdate) => {
      setMemberCount(update.memberCount);
      setProgress({
        current: update.currentMovieIndex,
        total: update.totalMovies,
        percentage: Math.round((update.currentMovieIndex / update.totalMovies) * 100)
      });
      
      // Handle status changes
      if (update.status !== roomStatus) {
        console.log(`🔄 Room status changed: ${roomStatus} -> ${update.status}`);
        setRoomStatus(update.status);
        
        // If status changed to MATCHED, handle it
        if (update.status === 'MATCHED') {
          console.log('🎉 Room status changed to MATCHED via subscription');
          handleRoomMatched();
        }
      }
    };

    const handleRoomMatched = async () => {
      try {
        // Refresh room details to get resultMovieId
        const updatedDetails = await roomService.getRoomDetails(roomId);
        
        if (updatedDetails.room.resultMovieId) {
          console.log(`🎉 Loading matched movie: ${updatedDetails.room.resultMovieId}`);
          
          const matchedMovie = await mediaService.getMediaDetails(updatedDetails.room.resultMovieId);
          setMatchedMedia(matchedMovie);
          setShowMatch(true);
          setVotingComplete(true);
          
          // Stop any ongoing voting
          setIsVoting(false);
          
          // Reset animations
          position.setValue({ x: 0, y: 0 });
          opacity.setValue(1);
          scale.setValue(1);
          
          // Animate match celebration
          Animated.parallel([
            Animated.timing(matchOpacity, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.spring(matchScale, {
              toValue: 1,
              tension: 50,
              friction: 7,
              useNativeDriver: true,
            }),
          ]).start();
          
          // Animate match celebration
          Animated.parallel([
            Animated.timing(matchOpacity, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.spring(matchScale, {
              toValue: 1,
              tension: 50,
              friction: 7,
              useNativeDriver: true,
            }),
          ]).start();
        }
      } catch (error) {
        console.error('Error handling room match:', error);
      }
    };

    // Subscribe to room updates
    subscribeToRoom(roomId, {
      onVoteUpdate: handleVoteUpdate,
      onMatchFound: handleMatchFound,
      onRoomUpdate: handleRoomUpdate,
    });

    return () => {
      unsubscribeFromRoom(roomId);
    };
  }, [roomId, subscribeToRoom, unsubscribeFromRoom]);

  // Pan responder for swipe gestures
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 20 || Math.abs(gestureState.dy) > 20;
    },
    onPanResponderMove: (_, gestureState) => {
      position.setValue({ x: gestureState.dx, y: gestureState.dy });

      // Update opacity and scale based on swipe distance
      const swipeProgress = Math.abs(gestureState.dx) / SWIPE_THRESHOLD;
      opacity.setValue(1 - swipeProgress * 0.5);
      scale.setValue(1 - swipeProgress * 0.1);
    },
    onPanResponderRelease: (_, gestureState) => {
      const { dx } = gestureState;

      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Complete the swipe
        const direction = dx > 0 ? 'right' : 'left';
        completeSwipe(direction);
      } else {
        // Return to center
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();

        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: false,
        }).start();

        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
        }).start();
      }
    },
  });

  const completeSwipe = async (direction: 'left' | 'right') => {
    if (!currentMedia || isVoting) return;

    // STEP 1: Check for matches BEFORE any action (CRITICAL BUSINESS LOGIC)
    console.log('🔍 Checking for matches BEFORE voting action...');
    try {
      // Call match detection before action
      const matchCheck = await appSyncService.checkMatchBeforeAction(roomId!, {
        type: 'VOTE',
        movieId: currentMedia.remoteId || currentMedia.id,
        voteType: direction === 'right' ? 'LIKE' : 'DISLIKE'
      });

      if (matchCheck?.checkMatchBeforeAction?.isMatch) {
        console.log('🎉 MATCH FOUND BEFORE ACTION!');
        
        // Update room status
        setRoomStatus('MATCHED');
        
        // Show match found
        const matchData = matchCheck.checkMatchBeforeAction;
        setMatchFound({
          roomId: roomId!,
          movieId: matchData.matchedMovie?.id || currentMedia.id,
          movieTitle: matchData.matchedMovie?.title || matchData.message || 'Película encontrada',
          participants: [],
          timestamp: new Date().toISOString()
        });
        
        // Animate match overlay
        Animated.spring(matchAnimation, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
        
        return; // Exit early, match found!
      }
    } catch (matchError) {
      console.warn('⚠️ Match detection failed, continuing with vote:', matchError);
    }

    // Check if room is already matched - prevent further voting
    if (roomStatus === 'MATCHED') {
      console.log('🚫 Room already has match, preventing vote');
      Alert.alert('¡Match encontrado!', 'Esta sala ya encontró una película perfecta. Ve a la sección de matches para verla.');
      return;
    }

    setIsVoting(true);

    // Animate card out
    Animated.timing(position, {
      toValue: { x: direction === 'right' ? width : -width, y: 0 },
      duration: 300,
      useNativeDriver: false,
    }).start();

    Animated.timing(opacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    try {
      // STEP 2: Submit vote with 50-MOVIE CACHE SYSTEM
      console.log('🔍 Room Component - Current Media:', JSON.stringify(currentMedia, null, 2));
      const voteType = direction === 'right' ? 'LIKE' : 'DISLIKE';
      console.log('🗳️ Room Component - Submitting vote (50-MOVIE CACHE):', {
        roomId: roomId,
        movieId: currentMedia.remoteId || currentMedia.id,
        voteType: voteType,
        direction: direction
      });

      const voteResult = await appSyncService.vote(roomId!, currentMedia.remoteId || currentMedia.id, voteType);
      console.log('✅ Room Component - Vote submitted successfully (50-MOVIE CACHE)');
      
      // Handle 50-MOVIE CACHE SYSTEM responses
      if (voteResult?.vote?.matchFound) {
        console.log('🎉 MATCH FOUND - 50-MOVIE CACHE!');
        
        // Update room status
        setRoomStatus('MATCHED');
        
        // Show match found overlay
        setMatchFound({
          roomId: roomId!,
          movieId: voteResult.vote.resultMovieId || currentMedia.id,
          movieTitle: voteResult.vote.message || currentMedia.title || 'Película encontrada',
          participants: [],
          timestamp: new Date().toISOString()
        });
        
        // Animate match overlay
        Animated.spring(matchAnimation, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
        
        setIsVoting(false);
        return; // Exit early, match found!
      }
      
      if (voteResult?.vote?.userFinished) {
        console.log('👤 USER FINISHED - 50-MOVIE CACHE!');
        
        // Show user finished state
        setCurrentMedia(null);
        setVotingComplete(true);
        
        // Show appropriate end-game message based on user status
        const message = voteResult.vote.message || 'A ver si hay suerte y haceis un match';
        Alert.alert(
          'Has terminado de votar',
          message,
          [{ text: 'OK' }]
        );
        
        setIsVoting(false);
        return;
      }
      
      if (voteResult?.vote?.status === 'NO_CONSENSUS') {
        console.log('❌ NO CONSENSUS - 50-MOVIE CACHE!');
        
        // Show no consensus state
        setCurrentMedia(null);
        setVotingComplete(true);
        
        // Show message to user (last user gets different message)
        const message = voteResult.vote.message || 'No os habeis puesto de acuerdo... Hacer otra sala.';
        Alert.alert(
          'Sin consenso',
          message,
          [
            { text: 'Crear nueva sala', onPress: () => router.push('/(tabs)/rooms') },
            { text: 'OK' }
          ]
        );
        
        setIsVoting(false);
        return;
      }

      // STEP 3: Vote registered successfully, get next movie for this user
      console.log('✅ Vote registered, getting next movie for user...');
      
      // Get next movie using 50-MOVIE CACHE SYSTEM
      const nextMovieResult = await appSyncService.getNextMovieForUser(roomId!);
      
      if (nextMovieResult?.getNextMovieForUser?.isUserFinished) {
        console.log('👤 User finished after getting next movie');
        
        setCurrentMedia(null);
        setVotingComplete(true);
        
        // Show appropriate end-game message
        const message = nextMovieResult.getNextMovieForUser.message || 'A ver si hay suerte y haceis un match';
        Alert.alert(
          'Has terminado de votar',
          message,
          [{ text: 'OK' }]
        );
        
        setIsVoting(false);
        return;
      }
      
      if (nextMovieResult?.getNextMovieForUser) {
        const nextMovie = nextMovieResult.getNextMovieForUser;
        
        // Transform to MediaItemDetails format
        const nextMedia: MediaItemDetails = {
          id: nextMovie.id,
          remoteId: nextMovie.id,
          title: nextMovie.title,
          overview: nextMovie.overview || '',
          poster: nextMovie.poster,
          release_date: nextMovie.release_date || '',
          runtime: nextMovie.runtime || 0,
          vote_average: nextMovie.vote_average || 0,
          genres: nextMovie.genres || [],
          rating: nextMovie.vote_average || 0,
          voteCount: 0,
          mediaType: 'movie' as const,
          // Properties expected by room screen
          mediaPosterPath: nextMovie.poster,
          mediaTitle: nextMovie.title,
          mediaYear: nextMovie.release_date ? nextMovie.release_date.split('-')[0] : '',
          mediaOverview: nextMovie.overview || '',
          mediaRating: nextMovie.vote_average || null,
        };
        
        // Update progress if available
        if (nextMovie.progress) {
          setProgress({
            current: nextMovie.progress.votedCount || 0,
            total: nextMovie.progress.totalMovies || 50,
            percentage: Math.round(((nextMovie.progress.votedCount || 0) / (nextMovie.progress.totalMovies || 50)) * 100)
          });
        }
        
        setCurrentMedia(nextMedia);
        console.log('🎬 Next movie loaded:', nextMedia.title);
      } else {
        console.warn('⚠️ No next movie available');
        setCurrentMedia(null);
      }

      // Reset animations
      setTimeout(() => {
        position.setValue({ x: 0, y: 0 });
        opacity.setValue(1);
        scale.setValue(1);
        setIsVoting(false);
      }, 300);

    } catch (error: any) {
      console.error('❌ Room Component - Error submitting vote (50-MOVIE CACHE):', {
        error: error,
        errorMessage: error?.message,
        errorName: error?.name,
        roomId: roomId,
        movieId: currentMedia?.id,
        voteType: direction === 'right' ? 'LIKE' : 'DISLIKE'
      });

      // Show specific error message based on error type
      let errorMessage = 'No se pudo enviar el voto';

      if (error?.message) {
        if (error.message.includes('already voted') || error.message.includes('Ya has votado')) {
          console.warn('⚠️ Already voted for this movie, getting next movie...');
          
          // Get next movie instead of showing error
          try {
            const nextMovieResult = await appSyncService.getNextMovieForUser(roomId!);
            
            if (nextMovieResult?.getNextMovieForUser?.isUserFinished) {
              setCurrentMedia(null);
              setVotingComplete(true);
              const message = nextMovieResult.getNextMovieForUser.message || 'A ver si hay suerte y haceis un match';
              Alert.alert(
                'Has terminado de votar',
                message,
                [{ text: 'OK' }]
              );
            } else if (nextMovieResult?.getNextMovieForUser) {
              const nextMovie = nextMovieResult.getNextMovieForUser;
              const nextMedia: MediaItemDetails = {
                id: nextMovie.id,
                remoteId: nextMovie.id,
                title: nextMovie.title,
                overview: nextMovie.overview || '',
                poster: nextMovie.poster,
                release_date: nextMovie.release_date || '',
                runtime: nextMovie.runtime || 0,
                vote_average: nextMovie.vote_average || 0,
                genres: nextMovie.genres || [],
                rating: nextMovie.vote_average || 0,
                voteCount: 0,
                mediaType: 'movie' as const,
                mediaPosterPath: nextMovie.poster,
                mediaTitle: nextMovie.title,
                mediaYear: nextMovie.release_date ? nextMovie.release_date.split('-')[0] : '',
                mediaOverview: nextMovie.overview || '',
                mediaRating: nextMovie.vote_average || null,
              };
              setCurrentMedia(nextMedia);
            }
          } catch (nextError) {
            console.error('Error getting next movie after already voted:', nextError);
            setCurrentMedia(null);
          }
          
          // Reset animations
          position.setValue({ x: 0, y: 0 });
          opacity.setValue(1);
          scale.setValue(1);
          setIsVoting(false);
          return;
        }

        if (error.message.includes('Authentication') || error.message.includes('not authenticated')) {
          errorMessage = 'Tu sesión ha expirado. Cierra y abre la app de nuevo.';
        } else if (error.message.includes('Network') || error.message.includes('fetch') || error.message.includes('timeout')) {
          errorMessage = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert('Error', errorMessage);

      // Reset animations on error
      position.setValue({ x: 0, y: 0 });
      opacity.setValue(1);
      scale.setValue(1);
      setIsVoting(false);
    }
  };

  // Helper functions for swipe actions
  const handleSwipeLeft = () => completeSwipe('left');
  const handleSwipeRight = () => completeSwipe('right');

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando sala...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show match celebration screen when match is found
  if (showMatch && matchedMedia) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.matchCelebrationContainer}
        >
          {/* Confetti Animation */}
          <Animated.View style={[
            styles.confettiContainer,
            {
              opacity: matchOpacity,
              transform: [{ scale: matchScale }]
            }
          ]}>
            <Text style={styles.confettiEmoji}>🎉</Text>
            <Text style={styles.confettiEmoji}>🎊</Text>
            <Text style={styles.confettiEmoji}>✨</Text>
            <Text style={styles.confettiEmoji}>🎉</Text>
            <Text style={styles.confettiEmoji}>🎊</Text>
          </Animated.View>

          {/* Match Content */}
          <View style={styles.matchCelebrationContent}>
            <Animated.View style={[
              styles.matchIconContainer,
              {
                transform: [{ scale: matchScale }]
              }
            ]}>
              <Ionicons name="heart" size={80} color="#FF6B9D" />
            </Animated.View>

            <Animated.Text style={[
              styles.matchCelebrationTitle,
              { opacity: matchOpacity }
            ]}>
              ¡Es un Match!
            </Animated.Text>

            <Animated.Text style={[
              styles.matchCelebrationSubtitle,
              { opacity: matchOpacity }
            ]}>
              Todos eligieron la misma película
            </Animated.Text>

            {/* Movie Card */}
            <Animated.View style={[
              styles.matchMovieCard,
              {
                opacity: matchOpacity,
                transform: [{ scale: matchScale }]
              }
            ]}>
              <Image
                source={{
                  uri: matchedMedia.mediaPosterPath
                    ? `https://image.tmdb.org/t/p/w500${matchedMedia.mediaPosterPath}`
                    : 'https://via.placeholder.com/300x450',
                }}
                style={styles.matchMovieImage}
              />
              <View style={styles.matchMovieInfo}>
                <Text style={styles.matchMovieTitle}>{matchedMedia.mediaTitle}</Text>
                <Text style={styles.matchMovieYear}>{matchedMedia.mediaYear}</Text>
                {matchedMedia.mediaRating && (
                  <View style={styles.matchMovieRating}>
                    <Ionicons name="star" size={16} color="#FFD700" />
                    <Text style={styles.matchMovieRatingText}>{matchedMedia.mediaRating}</Text>
                  </View>
                )}
              </View>
            </Animated.View>

            {/* Action Buttons */}
            <Animated.View style={[
              styles.matchActions,
              { opacity: matchOpacity }
            ]}>
              <TouchableOpacity
                style={styles.matchPrimaryButton}
                onPress={() => router.push(`/room/${roomId}/matches`)}
              >
                <Ionicons name="heart" size={20} color="#FFF" style={styles.buttonIcon} />
                <Text style={styles.matchPrimaryButtonText}>Ver Detalles</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.matchSecondaryButton}
                onPress={() => router.push('/(tabs)/rooms')}
              >
                <Ionicons name="home" size={20} color="#667eea" style={styles.buttonIcon} />
                <Text style={styles.matchSecondaryButtonText}>Volver a Salas</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            title="Buscando matches..."
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={async () => {
            // Check for matches before navigation
            const hasMatch = await checkForMatchesBeforeAction('NAVIGATE', { destination: 'back' });
            if (!hasMatch) {
              router.back();
            }
          }} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.roomName} numberOfLines={1}>
              {roomDetails?.room.name || 'Sala'}
            </Text>
            <View style={styles.membersRow}>
              <Ionicons name="people" size={14} color={colors.textMuted} />
              <Text style={styles.membersText}>
                {memberCount || 0} participantes
              </Text>
              {voteCount > 0 && (
                <>
                  <Text style={styles.separator}>•</Text>
                  <Ionicons name="heart" size={12} color={colors.primary} />
                  <Text style={styles.voteCountText}>{voteCount} votos</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.connectionStatus}
              onPress={() => {
                if (!connectionStatus.isConnected) {
                  Alert.alert(
                    'Estado de conexión',
                    `Estado: ${connectionStatus.isConnected ? 'Conectado' : 'Desconectado'}\nEn línea: ${connectionStatus.isOnline ? 'Sí' : 'No'}\nReconectando: ${connectionStatus.isReconnecting ? 'Sí' : 'No'}`,
                    [
                      { text: 'Reconectar', onPress: () => reconnect() },
                      { text: 'Cerrar', style: 'cancel' }
                    ]
                  );
                }
              }}
            >
              <View style={[
                styles.connectionDot,
                {
                  backgroundColor:
                    connectionStatus.isConnected && connectionStatus.isOnline ? '#4ECDC4' :
                      connectionStatus.isReconnecting ? '#FFD93D' : '#FF6B6B'
                }
              ]} />
              {connectionStatus.isReconnecting && (
                <Text style={styles.reconnectionText}>
                  Reconectando...
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View style={[
              styles.progressFill,
              {
                width: progressAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                })
              }
            ]} />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              {progress.current}/{progress.total} • {progress.percentage}%
            </Text>
            {preloadStatus.nextMoviesReady > 0 && (
              <Animated.View style={[
                styles.preloadIndicator,
                {
                  opacity: loadingProgress.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.7, 1, 0.7],
                  })
                }
              ]}>
                <Ionicons name="flash" size={12} color={colors.success} />
                <Text style={styles.preloadText}>
                  {preloadStatus.nextMoviesReady} listas
                </Text>
              </Animated.View>
            )}
            {preloadStatus.isPreloading && (
              <View style={styles.preloadIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.preloadText}>Cargando...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Card Area */}
        <View style={styles.cardContainer}>
          {currentMedia ? (
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.card,
                {
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { scale: scale }
                  ],
                  opacity: opacity
                }
              ]}
            >
              <Image
                source={{
                  uri: currentMedia.mediaPosterPath
                    ? `https://image.tmdb.org/t/p/w500${currentMedia.mediaPosterPath}`
                    : 'https://via.placeholder.com/500x750',
                }}
                style={styles.cardImage}
              />

              {/* Swipe Overlays */}
              <Animated.View style={[
                styles.likeOverlay,
                {
                  opacity: position.x.interpolate({
                    inputRange: [0, SWIPE_THRESHOLD],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  })
                }
              ]}>
                <Text style={styles.overlayText}>LIKE</Text>
              </Animated.View>

              <Animated.View style={[
                styles.dislikeOverlay,
                {
                  opacity: position.x.interpolate({
                    inputRange: [-SWIPE_THRESHOLD, 0],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  })
                }
              ]}>
                <Text style={styles.overlayText}>NOPE</Text>
              </Animated.View>

              {/* Card Info */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.cardGradient}
              >
                <Text style={styles.cardTitle}>{currentMedia.mediaTitle}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardYear}>{currentMedia.mediaYear}</Text>
                  {currentMedia.mediaRating && (
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={styles.ratingText}>{currentMedia.mediaRating}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardOverview} numberOfLines={3}>
                  {currentMedia.mediaOverview}
                </Text>
              </LinearGradient>
            </Animated.View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>¡Has terminado!</Text>
              <Text style={styles.emptySubtitle}>
                A ver si hay suerte y haceis un match
              </Text>
              <View style={styles.completionActions}>
                <TouchableOpacity
                  style={styles.viewMatchesButton}
                  onPress={() => router.push(`/room/${roomId}/matches`)}
                >
                  <Ionicons name="heart" size={20} color="#FFF" style={styles.buttonIcon} />
                  <Text style={styles.viewMatchesText}>Ver matches</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.returnToRoomsButton}
                  onPress={() => router.push('/(tabs)/rooms')}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.primary} style={styles.buttonIcon} />
                  <Text style={styles.returnToRoomsText}>Volver a salas</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {currentMedia && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.dislikeButton]}
              onPress={async () => {
                // Check for matches before dislike action
                const hasMatch = await checkForMatchesBeforeAction('VOTE', { 
                  movieId: currentMedia.remoteId || currentMedia.id,
                  voteType: 'DISLIKE'
                });
                if (!hasMatch) {
                  handleSwipeLeft();
                }
              }}
              disabled={isVoting}
            >
              <Ionicons name="close" size={32} color="#FF6B6B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoButton}
              onPress={async () => {
                // Check for matches before info action
                const hasMatch = await checkForMatchesBeforeAction('INFO', { 
                  movieId: currentMedia.remoteId || currentMedia.id
                });
                if (!hasMatch) {
                  router.push(`/media/${currentMedia.tmdbId}`);
                }
              }}
            >
              <Ionicons name="information-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.likeButton]}
              onPress={async () => {
                // Check for matches before like action
                const hasMatch = await checkForMatchesBeforeAction('VOTE', { 
                  movieId: currentMedia.remoteId || currentMedia.id,
                  voteType: 'LIKE'
                });
                if (!hasMatch) {
                  handleSwipeRight();
                }
              }}
              disabled={isVoting}
            >
              <Ionicons name="heart" size={32} color="#4ECDC4" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Match Found Overlay */}
      {matchFound && (
        <Animated.View
          style={[
            styles.matchOverlay,
            {
              opacity: matchAnimation,
              transform: [
                {
                  scale: matchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  })
                }
              ]
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(78, 205, 196, 0.95)', 'rgba(255, 107, 107, 0.95)']}
            style={styles.matchContent}
          >
            <Ionicons name="heart" size={64} color="#FFF" />
            <Text style={styles.matchTitle}>¡Es un Match!</Text>
            <Text style={styles.matchSubtitle}>
              Ambos eligieron: {matchFound.movieTitle}
            </Text>
            <TouchableOpacity
              style={styles.matchButton}
              onPress={() => {
                setMatchFound(null);
                router.push(`/room/${roomId}/matches`);
              }}
            >
              <Text style={styles.matchButtonText}>Ver detalles</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Voting Complete Overlay */}
      {votingComplete && (
        <Animated.View
          style={[
            styles.matchOverlay,
            {
              opacity: matchAnimation,
              transform: [
                {
                  scale: matchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  })
                }
              ]
            }
          ]}
        >
          <LinearGradient
            colors={['rgba(78, 205, 196, 0.95)', 'rgba(255, 217, 61, 0.95)']}
            style={styles.matchContent}
          >
            <Ionicons name="checkmark-circle" size={64} color="#FFF" />
            <Text style={styles.matchTitle}>¡Votación Completa!</Text>
            <Text style={styles.matchSubtitle}>
              Todos han votado. Revisa los resultados.
            </Text>
            <TouchableOpacity
              style={styles.matchButton}
              onPress={() => {
                setVotingComplete(false);
                router.push(`/room/${roomId}/matches`);
              }}
            >
              <Text style={styles.matchButtonText}>Continuar</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  roomName: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  separator: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  voteCountText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectionStatus: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
  reconnectionText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  menuButton: {
    padding: spacing.xs,
  },
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  preloadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preloadText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '500',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: width - spacing.lg * 2,
    height: height * 0.6,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  likeOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#4ECDC4',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '-20deg' }],
  },
  dislikeOverlay: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#FF6B6B',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '20deg' }],
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardYear: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: fontSize.sm,
    color: '#FFF',
    fontWeight: '600',
  },
  cardOverview: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  completionActions: {
    width: '100%',
    gap: spacing.md,
  },
  viewMatchesButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewMatchesText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  returnToRoomsButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnToRoomsText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xl,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dislikeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  likeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  infoButton: {
    padding: spacing.sm,
  },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchContent: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  matchTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.sm,
  },
  matchSubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.xl,
  },
  matchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  matchButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  // Match Celebration Styles
  matchCelebrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-around',
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: height * 0.1,
  },
  confettiEmoji: {
    fontSize: 40,
    position: 'absolute',
  },
  matchCelebrationContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 1,
  },
  matchIconContainer: {
    marginBottom: spacing.xl,
  },
  matchCelebrationTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  matchCelebrationSubtitle: {
    fontSize: fontSize.lg,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  matchMovieCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xxl,
    minWidth: width * 0.8,
  },
  matchMovieImage: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  matchMovieInfo: {
    alignItems: 'center',
  },
  matchMovieTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  matchMovieYear: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  matchMovieRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  matchMovieRatingText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  matchActions: {
    width: '100%',
    gap: spacing.md,
  },
  matchPrimaryButton: {
    backgroundColor: '#FF6B9D',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  matchPrimaryButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  matchSecondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchSecondaryButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#667eea',
  },
});