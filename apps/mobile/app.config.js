/** Carrega URL e chave do Supabase no build (APK) e no desenvolvimento local */
const appJson = require('./app.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
