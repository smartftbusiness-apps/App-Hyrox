/** Carrega URL e chave do Supabase no build (APK) e no desenvolvimento local */
const appJson = require('./app.json');
const productionDefaults = require('./supabase.config.json');

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || productionDefaults.url;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || productionDefaults.anonKey;

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
