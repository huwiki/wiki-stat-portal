import { NextPageContext } from "next";
import { parseCookies } from "nookies";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { AppRunningContext } from "../appRunningContext";
import { GetPortalServerSidePropsResult } from "../interfaces/getPortalServerSidePropsResult";
import { moduleManager } from "../modules/moduleManager";
import { getLocalizations, initializeI18nData } from "./i18nServer";

export const withCommonServerSideProps = async <T extends CommonPageProps>(
	ctx: NextPageContext, props: Partial<T>, requiredLanguageGroups?: string[]
): Promise<GetPortalServerSidePropsResult<T>> => {
	const cookies = parseCookies(ctx);

	const languageCode: string = cookies["languageCode"] || "en";
	await initializeI18nData();

	const pageRequiredLanguageGroups = requiredLanguageGroups
		? [...requiredLanguageGroups]
		: [];
	if (pageRequiredLanguageGroups.indexOf("common") === -1)
		pageRequiredLanguageGroups.push("common");

	const appCtx = AppRunningContext.getInstance("portal");

	return {
		props: {
			...props,
			i18nData: getLocalizations(languageCode),
			languageCode: languageCode,
			availableModules: Array.from(moduleManager.getModules()).map(module => ({
				id: module.identifier,
				icon: module.icon,
				availableAt: module.availableAt
			})),
			availableWikis: appCtx.getKnownWikis().map(x => x.id)
		}
	};
};
