import { I18nDictionary, MultiLangueageI18nDictionary } from "./I18nCommon";

const i18nData: MultiLangueageI18nDictionary = {
};

let isInitialized = false;

export const initializeI18nData = (): void => {
	if (isInitialized === true)
		return;

	// TODO: move to external json files
	i18nData["hu"] = {
		"common": {
			"siteTitle": "WikiStatPortál",

			"button.go": "Tovább",

			"module.funnel": "Funnel modul",
			"module.funnel.description": "Ide jön majd, hogy mire is jó valójában ez a funnel modul.",
			"module.another": "Másik",
			"module.another.description": "Másik modul leírása.",
			"module.third": "Harmadik",
			"module.third.description": "Harmadik modul leírása.",

			"changeLanguage": "Nyelv változtatása",
		},
		"index": {
			"title": "Kezdőlap",
			"description": "Üdvözlünk a Wikipédia Statisztikai Portálon! Válassz egy modult a folytatáshoz!",
		}
	};

	i18nData["en"] = {
		"common": {
			"siteTitle": "WikiStatPortal",

			"button.go": "Go",

			"module.funnel": "Funnel",
			"module.funnel.description": "In nulla veniam in minim. Id dolor mollit fugiat.",
			"module.another": "Another",
			"module.another.description": "Another module.",
			"module.third": "Third module",
			"module.third.description": "Description of the third module.",

			"changeLanguage": "Change language",
		},
		"index": {
			"title": "Main Page",
			"description": "Welcome to the Wikipedia Statistics Portal. Select a module to continue."
		}
	};

	isInitialized = true;
};

export const getLocalizations = (languageCode: string, groups: string[]): I18nDictionary => {
	const ret: I18nDictionary = {};
	let usedLanguageCode = languageCode || "en";

	// Fallback to english if the language code is not known
	if (!i18nData[usedLanguageCode])
		usedLanguageCode = "en";

	const languageDictionary = i18nData[usedLanguageCode];
	for (const group of groups) {
		if (languageDictionary[group]) {
			ret[group] = languageDictionary[group];
		}
	}

	return ret;
};
