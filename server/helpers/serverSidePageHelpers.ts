import { NextPageContext } from "next/dist/next-server/lib/utils";
import { parseCookies } from "nookies";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { KNOWN_MODULES } from "../../modules";
import { GetServerSidePropsResult } from "../interfaces/getServerSidePropsResult";
import { getLocalizations, initializeI18nData } from "./i18nServer";

export const withCommonServerSideProps = async <T extends CommonPageProps>(
	ctx: NextPageContext, props: Partial<T>, requiredLanguageGroups?: string[]
): Promise<GetServerSidePropsResult<T>> => {
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
			availableModules: KNOWN_MODULES.map(module => ({
				id: module.identifier,
				icon: module.icon,
				availableAt: module.availableAt
			})),
		}
	};
};
