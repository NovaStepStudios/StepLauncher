let currentLang = "es"; // fallback

function getValueFromPath(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

async function loadLanguage(langCode) {
  try {
    const response = await fetch(`../lang/${langCode}.json`);
    const languageData = await response.json();

    const elements = document.querySelectorAll("[data-lang]");
    elements.forEach((el) => {
      const path = el.getAttribute("data-lang");
      const value = getValueFromPath(languageData, path);
      if (value) {
        if (el.placeholder !== undefined) el.placeholder = value;
        else if (el.value !== undefined && el.tagName === "INPUT")
          el.value = value;
        else el.innerText = value;
      }
    });

    currentLang = langCode;
    localStorage.setItem("selectedLang", langCode);

    const langSelector = document.getElementById("langSelector");
    if (langSelector) {
      langSelector.value = langCode;
    } else {
      console.log(
        `[Lang]: No se ha encontrado el LangSelector, cambio de idioma automatizado ahora el idioma es ${langCode}`
      );
    }
  } catch (error) {
    console.error(`Error al cargar el idioma "${langCode}":`, error);
  }
}

function changeLanguageTo(langCode) {
  loadLanguage(langCode);
}
function selectedLangFCT() {
  const savedLang = localStorage.getItem("selectedLang");

  if (savedLang) {
    changeLanguageTo(savedLang);
  } else if (
    window.systemLang &&
    typeof window.systemLang.getLang === "function"
  ) {
    window.systemLang
      .getLang()
      .then((lang) => {
        changeLanguageTo(lang);
      })
      .catch(() => {
        loadLanguage(currentLang);
      });
  } else {
    loadLanguage(currentLang);
  }

  const langSelector = document.getElementById("langSelector");
  if (langSelector) {
    langSelector.addEventListener("change", (e) => {
      changeLanguageTo(e.target.value);
    });
  } else {
    console.log(
      "[Lang]: No se ha encontrado el LangSelector, solo funcionará el idioma automático."
    );
  }
}
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Lang] Cargando...");
  setTimeout(() => {
    selectedLangFCT();
    console.log("[Lang] ¡Cargado!");
  }, 1000);
});
