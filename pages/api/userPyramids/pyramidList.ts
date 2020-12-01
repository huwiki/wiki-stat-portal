import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { isLocalizedUserPyramidConfiguration } from "../../../common/modules/userPyramids/userPyramidConfiguration";
import { getLocalizedString, hasLanguage, initializeI18nData } from "../../../server/helpers/i18nServer";
import { moduleManager } from "../../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../../server/modules/userPyramidsModule/userPyramidsModule";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const { query: { wikiId, languageCode: rawLanguageCode } } = req;

	const userPyramidModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");
	if (!userPyramidModule) {
		res.status(500).json({ errorMessage: "Internal server error" });
		return;
	}

	if (!wikiId || isArray(wikiId)) {
		res.status(400).json({ errorMessage: "Invalid or missing wikiId parameter" });
		return;
	}

	if (!rawLanguageCode || isArray(rawLanguageCode)) {
		res.status(400).json({ errorMessage: "Invalid or missing languageCode parameter" });
		return;
	}

	await initializeI18nData();
	const languageCode = hasLanguage(rawLanguageCode)
		? rawLanguageCode
		: "en";

	const wikiPyramids = userPyramidModule.userPyramids.find(x => x.wiki === wikiId);

	if (userPyramidModule.availableAt.indexOf(wikiId) === -1
		|| !wikiPyramids
		|| wikiPyramids.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly" });
		return;
	}

	res.status(200).json(wikiPyramids.userPyramids.map(pyramid => ({
		id: pyramid.id,
		name: isLocalizedUserPyramidConfiguration(pyramid)
			? getLocalizedString(languageCode, pyramid.i18nKey)
			: pyramid.name
	})));
}
