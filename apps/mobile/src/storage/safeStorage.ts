import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

const noopStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/** Evita crash "window is not defined" no SSR do Expo Web */
export function getSafeStorage(): StateStorage {
  if (typeof window === 'undefined') {
    return noopStorage;
  }
  return AsyncStorage;
}
