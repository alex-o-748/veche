import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import ru from './locales/ru/translation.json';

const LANG_KEY = 'veche.lang';
const isSupported = (lang) => lang === 'ru' || lang === 'en';

// Read language from ?lang= query parameter
function getLanguageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  return isSupported(lang) ? lang : null;
}

// The language the player picked last time
function getSavedLanguage() {
  try {
    const lang = localStorage.getItem(LANG_KEY);
    return isSupported(lang) ? lang : null;
  } catch {
    return null;
  }
}

// Russian-language browsers start in Russian
function getBrowserLanguage() {
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : null;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru }
    },
    lng: getLanguageFromUrl() || getSavedLanguage() || getBrowserLanguage() || 'en',
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
  try {
    localStorage.setItem(LANG_KEY, newLang);
  } catch {
    // Storage unavailable: the choice lasts for this visit only
  }

  const url = new URL(window.location.href);
  if (newLang === 'en') {
    url.searchParams.delete('lang');
  } else {
    url.searchParams.set('lang', newLang);
  }
  window.history.replaceState(null, '', url.toString());
}

// Keep <html lang> and the tab title in the current language
const syncDocument = (lang) => {
  document.documentElement.lang = lang;
  document.title = i18n.t('meta.title');
};
syncDocument(i18n.language);
i18n.on('languageChanged', syncDocument);

export default i18n;
