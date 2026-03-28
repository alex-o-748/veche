import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import ru from './locales/ru/translation.json';

// Read language from ?lang= query parameter
function getLanguageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  if (lang === 'ru' || lang === 'en') return lang;
  return null;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru }
    },
    lng: getLanguageFromUrl() || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

/**
 * Toggle between en/ru and sync the URL query parameter.
 */
export function toggleLanguage() {
  const newLang = i18n.language === 'en' ? 'ru' : 'en';
  i18n.changeLanguage(newLang);

  const url = new URL(window.location.href);
  if (newLang === 'en') {
    url.searchParams.delete('lang');
  } else {
    url.searchParams.set('lang', newLang);
  }
  window.history.replaceState(null, '', url.toString());
}

export default i18n;
