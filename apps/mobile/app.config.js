/** Carrega URL e chave do Supabase no build (APK) e no desenvolvimento local */
const appJson = require('./app.json');

/** Fallback de produção — anon key é pública por design no app mobile */
const DEFAULT_SUPABASE_URL = 'https://cnrxzckicablcanuqwva.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucnh6Y2tpY2FibGNhbnVxd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzExNTYsImV4cCI6MjA5NjMwNzE1Nn0.W7GxRpK83kCLFe-JR_w_K2h3LR9VIcLF-K7Zz-ZAQDs';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_ANON_KEY;

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
};
