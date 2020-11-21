import { NextRouter } from "next/router";
import { I18nDictionary } from "./I18nCommon";
import { ModuleDescriptor } from "./moduleDescriptor";

export interface CommonPageProps {
	availableModules: ModuleDescriptor[];
	availableWikis: string[];

	i18nData: I18nDictionary;
	languageCode: string;

	router: NextRouter;
}
