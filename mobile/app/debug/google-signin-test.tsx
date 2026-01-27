import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { Stack } from 'expo-router';
import GoogleSignInDiagnostics from '../../src/components/GoogleSignInDiagnostics';

export default function GoogleSignInTestScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Google Sign-In Test',
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <View style={styles.content}>
        <GoogleSignInDiagnostics />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
  },
});