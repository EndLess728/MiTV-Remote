// Custom entry — runs unistyles side-effect BEFORE expo-router/entry
// This is required because route modules transitively load components
// that call StyleSheet.create((theme) => ...) at import time.
// The theme must be configured first.
import '@/styles/unistyles';
import 'expo-router/entry';
