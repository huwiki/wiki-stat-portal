import { CommonPageProps } from "../pages/commonPageProps";
import * as React from "react";
import { getLocalizedText } from "./i18nClient";
import { NextPageContext } from "next";
import { getLocalizations, initializeI18nData } from "./i18nServer";
import { KNOWN_MODULES } from "../modules";

export abstract class NextBasePage<T extends CommonPageProps> extends React.Component<T> {
	protected t(group: string, key: string): string {
		return getLocalizedText(this.props.i18nData, group, key);
	}

	constructor(props: T) {
		super(props);
	}

	protected static withCommonInitialProps<T extends CommonPageProps>(ctx: NextPageContext, props: Partial<T>, requiredLanguageGroups?: string[]): Partial<T> {
		const languageCode: string = ctx.cookie?.get("languageCode") || "en";
		initializeI18nData();

		const pageRequiredLanguageGroups = requiredLanguageGroups
			? [...requiredLanguageGroups]
			: [];
		if (pageRequiredLanguageGroups.indexOf("common") === -1)
			pageRequiredLanguageGroups.push("common");

		return {
			...props,
			i18nData: getLocalizations(languageCode, pageRequiredLanguageGroups),
			languageCode: languageCode,
			availableModules: KNOWN_MODULES.map(x => ({id: x.identifier, icon: x.icon})),
		};
	}
}
