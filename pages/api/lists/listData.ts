import { parse, startOfDay } from "date-fns";
import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { ListConfiguration } from "../../../common/modules/lists/listsConfiguration";
import { MODULE_IDENTIFIERS } from "../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../server/appRunningContext";
import { createActorEntitiesForWiki } from "../../../server/database/entities/toolsDatabase/actorByWiki";
import { hasLanguage, initializeI18nData } from "../../../server/helpers/i18nServer";
import { KnownWiki } from "../../../server/interfaces/knownWiki";
import { ListsModule } from "../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../server/modules/moduleManager";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const {
		query: {
			wikiId: rawWikiId,
			listId: rawListId,
			startDate: rawStartDate,
			endDate: rawEndDate,
			languageCode: rawLanguageCode
		}
	} = req;

	const appCtx = AppRunningContext.getInstance("portal");
	if (appCtx.isValid === false) {
		// TODO: log
		res.status(500).json({ errorMessage: "Internal server error" });
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

	const { isValid, wiki, list, startDate, endDate } = processParameters(appCtx, res, rawWikiId, rawListId, rawStartDate, rawEndDate);
	if (!isValid || !list || !wiki || !endDate)
		return;

	const conn = await appCtx.getToolsDbConnection();
	try {
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const results = [];

		res.status(200).json(results);
	}
	catch (err) {
		appCtx.logger.error({
			errorMessage: "Error while serving list data",
			query: req.query,
			error: err
		});
		res.status(500).json({
			errorMessage: "Internal error while calculating data"
		});
	}
	finally {
		conn.close();
	}

}

const processParameters = (
	appCtx: AppRunningContext,
	res: NextApiResponse,
	rawWikiId: string | string[],
	rawFullListId: string | string[],
	rawStartDate: string | string[],
	rawEndDate: string | string[],
): {
	isValid: boolean;
	wiki?: KnownWiki;
	list?: ListConfiguration;
	startDate?: Date;
	endDate?: Date;
} => {
	const listsModule = moduleManager.getModuleById<ListsModule>(MODULE_IDENTIFIERS.lists);
	if (!listsModule) {
		res.status(500).json({ errorMessage: "Internal server error" });
		return { isValid: false };
	}

	if (!rawWikiId || isArray(rawWikiId)) {
		res.status(400).json({ errorMessage: "Invalid or missing wikiId parameter" });
		return { isValid: false };
	}

	const wiki = appCtx.getKnownWikiById(rawWikiId);

	if (!wiki) {
		res.status(400).json({ errorMessage: "Wiki is not supported on this portal" });
		return { isValid: false };
	}

	if (!rawFullListId || isArray(rawFullListId)) {
		res.status(400).json({ errorMessage: "Invalid or missing listId parameter" });
		return { isValid: false };
	}

	let startDate: Date | undefined = undefined;
	if (rawStartDate) {

		if (isArray(rawStartDate)) {
			res.status(400).json({ errorMessage: "Invalid startDate parameter" });
			return { isValid: false };
		}

		try {
			startDate = parse(rawStartDate, "yyyy-MM-dd", startOfDay(new Date()));
		}
		catch (err) {
			res.status(400).json({ errorMessage: "Invalid startDate parameter" });
			return { isValid: false };
		}
	}

	if (!rawEndDate || isArray(rawEndDate)) {
		res.status(400).json({ errorMessage: "Invalid or missing endDate parameter" });
		return { isValid: false };
	}

	let endDate: Date;
	try {
		endDate = parse(rawEndDate, "yyyy-MM-dd", startOfDay(new Date()));
	}
	catch (err) {
		res.status(400).json({ errorMessage: "Invalid or missing endDate parameter" });
		return { isValid: false };
	}

	const wikiLists = listsModule.lists.find(x => x.wikiId === rawWikiId);
	if (listsModule.availableAt.indexOf(rawWikiId) === -1
		|| !wikiLists
		|| wikiLists.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly for this module" });
		return { isValid: false };
	}

	const listDefinition = listsModule.getListByFullId(wiki.id, rawFullListId);
	if (!listDefinition) {
		res.status(400).json({ errorMessage: "Invalid list id" });
		return { isValid: false };
	}

	return {
		isValid: true,
		wiki: wiki,
		list: listDefinition,
		startDate: startDate,
		endDate: endDate
	};
};


