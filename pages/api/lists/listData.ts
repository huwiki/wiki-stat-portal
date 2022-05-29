import { isArray } from "lodash";
import moment from "moment";
import { NextApiRequest, NextApiResponse } from "next";
import { ActorResult, GroupActor, GroupedResult } from "../../../common/interfaces/statisticsQueryModels";
import { ListConfiguration } from "../../../common/modules/lists/listsConfiguration";
import { MODULE_IDENTIFIERS } from "../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../server/appRunningContext";
import { CacheEntryTypeModel, createActorEntitiesForWiki } from "../../../server/database/entities/toolsDatabase/actorByWiki";
import { createStatisticsQuery as createAndRunStatisticsQuery } from "../../../server/database/statisticsQueryBuilder";
import { KnownWiki } from "../../../server/interfaces/knownWiki";
import { ListsModule } from "../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../server/modules/moduleManager";

export interface ListDataResult {
	list: ListConfiguration;
	results: ListDataActorEntry[] | ListDataGroupEntry[];
}

export interface ListDataActorEntry {
	actorId: number;
	name: string;
	groups: string[] | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	columnData: unknown[];
}

export interface ListDataGroupEntry {
	data: unknown[];
	users: GroupActor[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const {
		body: {
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

	const { isValid, wiki, list, startDate, endDate } = processParameters(appCtx, res, rawWikiId, rawListId, rawStartDate, rawEndDate);
	if (!isValid || !list || !wiki || !endDate)
		return;

	const conn = await appCtx.getToolsDbConnection();
	try {
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const startDateKeySource = startDate == null ? moment.utc([1900, 0, 0]) : startDate;

		let cachedEntry: CacheEntryTypeModel | undefined = undefined;
		const cacheKey = getQueryCacheKey(list, startDateKeySource, endDate);

		if (list.enableCaching === true) {
			cachedEntry = await conn.getRepository(wikiEntities.cacheEntry)
				.createQueryBuilder("ce")
				.where("ce.key = :key", { key: cacheKey })
				.getOne();
		}

		let resultSet: ActorResult[] | GroupedResult[];
		if (!cachedEntry) {
			appCtx.logger.info(`[api/lists/listData] running query for '${list.id}'`);
			resultSet = await createAndRunStatisticsQuery({
				appCtx: appCtx,
				toolsDbConnection: conn,
				wiki: wiki,
				wikiEntities,
				userRequirements: list.userRequirements,
				columns: list.columns,
				orderBy: list.orderBy,
				itemCount: list.itemCount,
				startDate: startDate,
				groupBy: list.groupBy,
				endDate: endDate,
				skipBotsFromCounting: list.displaySettings?.skipBotsFromCounting ?? false,
			});
		} else {
			resultSet = JSON.parse(cachedEntry.content);
		}

		const listDataResult: ListDataResult = {
			list: list,
			results: []
		};

		if (list.groupBy && list.groupBy.length > 0) {
			const groupResultSet = resultSet as GroupedResult[];
			const results: ListDataGroupEntry[] = [];

			for (const group of groupResultSet) {
				results.push({
					data: group.columnData,
					users: group.users
				});
			}

			listDataResult.results = results;
		} else {
			const actorResultSet = resultSet as ActorResult[];
			const results: ListDataActorEntry[] = [];

			for (const actor of actorResultSet) {
				results.push({
					actorId: actor.actorId,
					name: actor.name ?? "?",
					groups: actor.groups ?? null,
					columnData: actor.columnData ?? [],
				});
			}

			listDataResult.results = results;
		}

		if (!cachedEntry && list.enableCaching) {
			await conn.getRepository(wikiEntities.cacheEntry)
				.delete(cacheKey);

			await conn.getRepository(wikiEntities.cacheEntry)
				.insert({
					key: cacheKey,
					cacheTimestamp: moment.utc().toDate(),
					startDate: startDateKeySource.toDate(),
					endDate: endDate.toDate(),
					content: JSON.stringify(resultSet)
				});
		}

		appCtx.logger.info("[api/lists/listData] returning data");

		res.status(200).json(listDataResult);
	} catch (err) {
		console.log(err);
		appCtx.logger.error(err);
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
	startDate?: moment.Moment;
	endDate?: moment.Moment;
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

	let startDate: moment.Moment | undefined = undefined;
	if (rawStartDate) {

		if (isArray(rawStartDate)) {
			res.status(400).json({ errorMessage: "Invalid startDate parameter" });
			return { isValid: false };
		}

		try {
			startDate = moment.utc(rawStartDate, "YYYY-MM-DD").startOf("day");
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

	let endDate: moment.Moment;
	try {
		endDate = moment.utc(rawEndDate, "YYYY-MM-DD").startOf("day");
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

function getQueryCacheKey(list: ListConfiguration, startDate: moment.Moment, endDate: moment.Moment): string {
	const startDateSubKey = startDate == null ? "1900-00-00" : startDate.format("YYYY-MM-DD");
	const endDateSubKey = endDate.format("YYYY-MM-DD");
	const listVersionSubKey = typeof list.version === "number" && Number.isInteger(list.version)
		? list.version
		: 1;
	return `list-${list.id}/${listVersionSubKey}-${startDateSubKey}-${endDateSubKey}`;
}


