import { promises as fsPromises } from "fs";
import path from "path";
import { I18nDictionary, MultiLangueageI18nDictionary } from "../../common/interfaces/I18nCommon";
import { getFilesAsync } from "./pathUtils";

const i18nData: MultiLangueageI18nDictionary = {
};

let isInitialized = false;

export const getResourcesBasePath = (): string => {
	return path.join(process.cwd(), "resources");
};

export const initializeI18nData = async (): Promise<void> => {
	if (isInitialized === true)
		return;

	const i18nBasePath = path.join(getResourcesBasePath(), "i18n") + "/";

	for await (const languageFilePath of getFilesAsync(i18nBasePath)) {
		const fileName = path.basename(languageFilePath);
		const fnMatch = fileName.match(/^(.+).json$/);
		if (fnMatch && fnMatch.length === 2) {
			const languageCode = path.basename(fnMatch[1]);
			const fileContent = await fsPromises.readFile(languageFilePath, { encoding: "utf-8" });
			i18nData[languageCode] = JSON.parse(fileContent);
		}
	}

	isInitialized = true;
};

export const getLocalizations = (languageCode: string): I18nDictionary => {
	let usedLanguageCode = languageCode || "en";

	// Fallback to english if the language code is not known
	if (!i18nData[usedLanguageCode])
		usedLanguageCode = "en";

	return i18nData[usedLanguageCode];
};
