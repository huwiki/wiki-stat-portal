import { NextPageContext } from "next/dist/next-server/lib/utils";
import { parseCookies } from "nookies";
import { KNOWN_MODULES } from "../../modules";
import { CommonPageProps } from "../commonPageProps";
import { getLocalizations, initializeI18nData } from "./i18nServer";

export const withCommonServerSideProps = async <T extends CommonPageProps>(
	ctx: NextPageContext, props: Partial<T>, requiredLanguageGroups?: string[]
) => {
	const cookies = parseCookies(ctx);

	const languageCode: string = cookies["languageCode"] || "en";
	await initializeI18nData();

	const appBaseStyle = cookies["appBaseStyle"] === "light" ? "light" : "dark";

	const pageRequiredLanguageGroups = requiredLanguageGroups
		? [...requiredLanguageGroups]
		: [];
	if (pageRequiredLanguageGroups.indexOf("common") === -1)
		pageRequiredLanguageGroups.push("common");

	return {
		props: {
			...props,
			i18nData: getLocalizations(languageCode, pageRequiredLanguageGroups),
			languageCode: languageCode,
			appBaseStyle: appBaseStyle,
			availableModules: KNOWN_MODULES.map(x => ({ id: x.identifier, icon: x.icon })),
		}
	};
};
