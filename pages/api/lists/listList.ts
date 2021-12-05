import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { isLocalizedListConfiguration } from "../../../common/modules/lists/listsConfiguration";
import { getLocalizedString, hasLanguage, initializeI18nData } from "../../../server/helpers/i18nServer";
import { ListsModule } from "../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../server/modules/moduleManager";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const { query: { wikiId, languageCode: rawLanguageCode } } = req;

	const listsModule = moduleManager.getModuleById<ListsModule>("lists");
	if (!listsModule) {
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

	const wikiLists = listsModule.lists.find(x => x.wiki === wikiId);

	if (listsModule.availableAt.indexOf(wikiId) === -1
		|| !wikiLists
		|| wikiLists.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly" });
		return;
	}

	res.status(200).json(wikiLists.lists.map(list => ({
		id: list.id,
		name: isLocalizedListConfiguration(list)
			? getLocalizedString(languageCode, list.i18nKey)
			: list.name
	})));
}
