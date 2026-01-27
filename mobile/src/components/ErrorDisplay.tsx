/**
 * Error Display Component
 * Shows user-friendly error messages with contextual actions
 * Validates: Requirements 9.3, 9.5
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useErrorDisplay } from '../hooks/useErrorLogging';

interface ErrorDisplayProps {
  onRetry?: () => void;
  style?: any;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ onRetry, style }) => {
  const { currentError, isVisible, dismissError, retryAction } = useErrorDisplay();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isVisible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, fadeAnim]);

  if (!currentError || !isVisible) {
    return null;
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    retryAction();
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        { opacity: fadeAnim },
        style
      ]}
    >
      <View style={styles.errorCard}>
        <Text style={styles.errorMessage}>{currentError.message}</Text>
        
        {currentError.action && (
          <Text style={styles.actionText}>{currentError.action}</Text>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.dismissButton} 
            onPress={dismissError}
          >
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
          
          {currentError.canRetry && (
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  errorCard: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEAA7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  errorMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#E9ECEF',
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#495057',
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#007BFF',
  },
  retryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

export default ErrorDisplay;