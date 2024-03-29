import fs from "fs";
import path from "path";
import { I18nDictionary, MultiLanguageI18nDictionary } from "../../common/interfaces/I18nCommon";
import { getFilesSync } from "./ioUtils";

const i18nData: MultiLanguageI18nDictionary = {};

let isInitialized = false;

export const getResourcesBasePath = (): string => {
	return path.join(process.cwd(), "resources");
};

export const initializeI18nData = (): void => {
	if (isInitialized === true)
		return;

	const i18nBasePath = path.join(getResourcesBasePath(), "i18n") + "/";

	for (const languageFilePath of getFilesSync(i18nBasePath)) {
		const fileName = path.basename(languageFilePath);
		const fnMatch = fileName.match(/^(.+).json$/);
		if (fnMatch && fnMatch.length === 2) {
			const languageCode = path.basename(fnMatch[1]);
			const fileContent = fs.readFileSync(languageFilePath, { encoding: "utf-8" });
			i18nData[languageCode] = JSON.parse(fileContent);
		}
	}

	isInitialized = true;
};

export const hasLanguage = (languageCode: string): boolean => {
	return typeof i18nData[languageCode] === "object";
};

export const getLocalizations = (languageCode: string): I18nDictionary => {
	let usedLanguageCode = languageCode || "en";

	// Fallback to english if the language code is not known
	if (!i18nData[usedLanguageCode])
		usedLanguageCode = "en";

	return i18nData[usedLanguageCode];
};

export const getLocalizedString = (languageCode: string, key: string): string => {
	let usedLanguageCode = languageCode || "en";

	// Fallback to english if the language code is not known
	if (!i18nData[usedLanguageCode])
		usedLanguageCode = "en";

	return i18nData[usedLanguageCode][key] ?? `?[${key}]`;
};
