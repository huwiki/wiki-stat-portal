import { I18nDictionary } from "./I18nCommon";

export const getLocalizedText = (i18nData: I18nDictionary, group: string, key: string): string => {
	if (!i18nData || !i18nData[group] || !i18nData[group][key])
		return `?[${group}:${key}]`;

	return i18nData[group][key];
};
