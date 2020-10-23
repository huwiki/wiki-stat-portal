import { I18nDictionary, MultiLangueageI18nDictionary } from "./I18nCommon";

const i18nData: MultiLangueageI18nDictionary = {
};

let isInitialized = false;

export const initializeI18nData = (): void => {
	if (isInitialized === true)
		return;



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
