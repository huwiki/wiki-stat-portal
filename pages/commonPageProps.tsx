import { IconName } from "@blueprintjs/core";
import { Cookie } from "next-cookie";
import { NextRouter } from "next/router";

export interface ModuleDescriptor {
	id: string;
	icon: IconName;
}

export interface CommonPageProps {
	availableModules?: ModuleDescriptor[];

	i18nData?: { [index: string]: { [index: string ]: string } };
	languageCode?: string;

	cookie?: Cookie;
	router: NextRouter;
}
