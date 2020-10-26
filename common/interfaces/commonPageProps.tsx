import { NextRouter } from "next/router";
import { ModuleDescriptor } from "./moduleDescriptor";

export interface CommonPageProps {
	availableModules: ModuleDescriptor[];

	i18nData: { [index: string]: { [index: string]: string } };
	languageCode: string;

	appBaseStyle: string;

	router: NextRouter;
}
