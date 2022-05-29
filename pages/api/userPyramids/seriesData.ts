import { isArray } from "lodash";
import moment from "moment";
import { NextApiRequest, NextApiResponse } from "next";
import { ActorResult } from "../../../common/interfaces/statisticsQueryModels";
import { isLocalizedUserPyramidGroup, UserPyramidConfiguration } from "../../../common/modules/userPyramids/userPyramidConfiguration";
import { AppRunningContext } from "../../../server/appRunningContext";
import { createActorEntitiesForWiki } from "../../../server/database/entities/toolsDatabase/actorByWiki";
import { createStatisticsQuery } from "../../../server/database/statisticsQueryBuilder";
import { getLocalizedString, hasLanguage } from "../../../server/helpers/i18nServer";
import { KnownWiki } from "../../../server/interfaces/knownWiki";
import { moduleManager } from "../../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../../server/modules/userPyramidsModule/userPyramidsModule";

interface GroupResult {
	name: string;
	population: number;
	matchingWithPreviousGroup: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const {
		query: {
			wikiId: rawWikiId,
			pyramidId: rawPyramidId,
			date: rawDate,
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

	const languageCode = hasLanguage(rawLanguageCode)
		? rawLanguageCode
		: "en";

	const { isValid, wiki, pyramid, epochDate } = processParameters(appCtx, res, rawWikiId, rawPyramidId, rawDate);
	if (!isValid || !pyramid || !wiki || !epochDate)
		return;

	const conn = await appCtx.getToolsDbConnection();
	try {
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const results: GroupResult[] = [];
		let groupIndex = 0;
		let usersInPreviousGroup: Set<number> = new Set<number>();
		for (const userGroup of pyramid.groups) {
			groupIndex++;

			appCtx.logger.info(`[api/userPyramids/seriesData] running query for '${pyramid.id}', group #${groupIndex}`);

			const users = await createStatisticsQuery({
				appCtx: appCtx,
				toolsDbConnection: conn,
				wiki: wiki,
				wikiEntities,
				userRequirements: userGroup.requirements,
				endDate: epochDate,
			}) as ActorResult[];

			const usersInThisGroup = new Set<number>(users.map(x => x.actorId));

			results.push({
				name: isLocalizedUserPyramidGroup(userGroup)
					? getLocalizedString(languageCode, userGroup.i18nKey)
					: userGroup.name,
				population: users.length,
				matchingWithPreviousGroup: usersInPreviousGroup.size > 0
					? new Set([...usersInThisGroup].filter(x => usersInPreviousGroup.has(x))).size
					: 0,
			});
			usersInPreviousGroup = usersInThisGroup;
		}

		res.status(200).json(results);
	}
	catch (err) {
		appCtx.logger.error(err);
		appCtx.logger.error({
			errorMessage: "Error while serving pyramid data",
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
	rawPyramidId: string | string[],
	rawDate: string | string[]
): {
	isValid: boolean;
	wiki?: KnownWiki;
	pyramid?: UserPyramidConfiguration;
	epochDate?: moment.Moment;
} => {
	const userPyramidModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");
	if (!userPyramidModule) {
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

	if (!rawPyramidId || isArray(rawPyramidId)) {
		res.status(400).json({ errorMessage: "Invalid or missing pyramidId parameter" });
		return { isValid: false };
	}

	if (!rawDate || isArray(rawDate)) {
		res.status(400).json({ errorMessage: "Invalid or missing date parameter" });
		return { isValid: false };
	}

	let date: moment.Moment;
	try {
		date = moment.utc(rawDate, "YYYY-MM-DD").startOf("day");
	}
	catch (err) {
		res.status(400).json({ errorMessage: "Invalid or missing date parameter" });
		return { isValid: false };
	}

	const wikiPyramids = userPyramidModule.userPyramids.find(x => x.wiki === rawWikiId);

	if (userPyramidModule.availableAt.indexOf(rawWikiId) === -1
		|| !wikiPyramids
		|| wikiPyramids.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly for this module" });
		return { isValid: false };
	}

	const pyramidDefinition = wikiPyramids.userPyramids.find(x => x.id === rawPyramidId);
	if (!pyramidDefinition) {
		res.status(400).json({ errorMessage: "Invalid wiki pyramid id" });
		return { isValid: false };
	}

	return {
		isValid: true,
		wiki: wiki,
		pyramid: pyramidDefinition,
		epochDate: date
	};
};


