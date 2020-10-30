import { I18nDictionary } from "../../common/interfaces/I18nCommon";


export class I18nProvider {
	constructor(private i18nData: I18nDictionary) { }

	public getLocalizedText = (key: string): string => {
		if (!this.i18nData || !this.i18nData[key])
			return `?[${key}]`;

		return this.i18nData[key];
	}

	public t = (key: string): string => this.getLocalizedText(key);
}
