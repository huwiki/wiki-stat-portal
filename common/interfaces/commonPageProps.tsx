import { NextRouter } from "next/router";
import { I18nDictionary } from "./I18nCommon";
import { ModuleDescriptor } from "./moduleDescriptor";

export interface CommonPageProps {
	availableModules: ModuleDescriptor[];

	i18nData: I18nDictionary;
	languageCode: string;

	appBaseStyle: string;

	router: NextRouter;
}
