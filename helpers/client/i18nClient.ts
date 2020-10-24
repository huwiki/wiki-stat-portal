import { I18nDictionary } from "../I18nCommon";


export class I18nProvider {
	constructor(private i18nData: I18nDictionary) { }

	public getLocalizedText = (group: string, key: string): string => {
		if (!this.i18nData || !this.i18nData[group] || !this.i18nData[group][key])
			return `?[${group}:${key}]`;

		return this.i18nData[group][key];
	}

	public t = (group: string, key: string): string => this.getLocalizedText(group, key);
}
