export type I18nDictionary = {
	[index: string]: {
		[index: string]: string;
	};
};

export type MultiLangueageI18nDictionary = {
	[index: string]: I18nDictionary;
};

export interface SupportedLanguage {
	languageCode: string;
	name: string;
	nativeName: string;
}

export const SupportedLanguages: SupportedLanguage[] = [
	{ "languageCode": "en", name: "English", nativeName: "English" },
	{ "languageCode": "hu", name: "Hungarian", nativeName: "Magyar" },
];
