import { promises as fsPromises } from "fs";
import path from "path";
import { I18nDictionary, MultiLangueageI18nDictionary } from "../I18nCommon";
import { getFiles, getSubdirectories } from "./pathUtils";

const i18nData: MultiLangueageI18nDictionary = {
};

let isInitialized = false;

export const initializeI18nData = async (): Promise<void> => {
	if (isInitialized === true)
		return;

	const i18nBasePath = path.join(process.cwd(), "resources", "i18n") + "/";

	for await (const languageBasePath of getSubdirectories(i18nBasePath)) {
		const languageCode = path.basename(languageBasePath);
		i18nData[languageCode] = {};

		for await (const fullPath of getFiles(languageBasePath)) {
			const fileName = path.basename(fullPath);

			const fnMatch = fileName.match(/^(.+).json$/);
			if (fnMatch && fnMatch.length === 2) {
				const i18nGroupId = fnMatch[1];
				const fileContent = await fsPromises.readFile(fullPath, { encoding: "utf-8" });
				i18nData[languageCode][i18nGroupId] = JSON.parse(fileContent);
			}
		}
	}

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
		if (languageDictionary && languageDictionary[group]) {
			ret[group] = languageDictionary[group];
		}
	}

	return ret;
};
