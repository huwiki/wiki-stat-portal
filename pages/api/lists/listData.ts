import { parse, startOfDay } from "date-fns";
import { isArray, isDate } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { ListConfiguration } from "../../../common/modules/lists/listsConfiguration";
import { MODULE_IDENTIFIERS } from "../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../server/appRunningContext";
import { createActorEntitiesForWiki } from "../../../server/database/entities/toolsDatabase/actorByWiki";
import { ActorLike, createStatisticsQuery } from "../../../server/database/statisticsQueryBuilder";
import { hasLanguage, initializeI18nData } from "../../../server/helpers/i18nServer";
import { KnownWiki } from "../../../server/interfaces/knownWiki";
import { ServiceAwardLevelDefinition } from "../../../server/interfaces/serviceAwardLevelDefinition";
import { ListsModule } from "../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../server/modules/moduleManager";

export interface ListDataResult {
	list: ListConfiguration;
	results: ListDataEntry[];
}

export interface ListDataEntry {
	id: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any[];
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

		appCtx.logger.info(`[api/lists/listData] running query for '${list.id}'`);

		const users = await createStatisticsQuery({
			appCtx: appCtx,
			toolsDbConnection: conn,
			wikiEntities,
			userRequirements: list.userRequirements,
			columns: list.columns,
			orderBy: list.orderBy,
			itemCount: list.itemCount,
			startDate: startDate,
			endDate: endDate,
		});

		const actorGroupMap: Map<number, string[]> = new Map();
		if (list.columns.find(x => x.type === "userGroups")) {
			const actorGroups = await conn.getRepository(wikiEntities.actorGroup)
				.createQueryBuilder()
				.getMany();

			for (const actorGroup of actorGroups) {
				const actorArr = actorGroupMap.get(actorGroup.actorId);
				if (actorArr) {
					actorArr.push(actorGroup.groupName);
				} else {
					actorGroupMap.set(actorGroup.actorId, [actorGroup.groupName]);
				}
			}
		}

		const listData: ListDataResult = {
			list: list,
			results: [],
		};

		// console.log(users);
		console.log(users.length);

		let counter = 1;
		for (const user of users) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const columns: any[] = [];

			let columnIndex = 0;
			for (const columnDefinition of list.columns) {
				const dataFromQuery = user[`column${columnIndex}`];

				if (columnDefinition.type === "counter") {
					columns.push(counter);
				} else if (columnDefinition.type === "userGroups") {
					const userGroups = actorGroupMap.get(user.aId);
					columns.push(userGroups ?? null);
				} else if (columnDefinition.type === "levelAtPeriodStart") {
					const startLevel = getUserLevel(wiki.serviceAwardLevels, user, columnIndex, "start");
					if (startLevel) {
						columns.push([startLevel.id, startLevel.label]);
					} else {
						columns.push(null);
					}
				} else if (columnDefinition.type === "levelAtPeriodEnd") {
					const endLevel = getUserLevel(wiki.serviceAwardLevels, user, columnIndex, "end");
					if (endLevel) {
						columns.push([endLevel.id, endLevel.label]);
					} else {
						columns.push(null);
					}
				} else if (columnDefinition.type === "levelAtPeriodEndWithChange") {
					const startLevel = getUserLevel(wiki.serviceAwardLevels, user, columnIndex, "start");
					const endLevel = getUserLevel(wiki.serviceAwardLevels, user, columnIndex, "end");
					if (endLevel) {
						columns.push([endLevel.id, endLevel.label, startLevel === null || startLevel.id !== endLevel.id]);
					} else {
						columns.push(null);
					}
				} else if (isDate(dataFromQuery)) {
					columns.push([dataFromQuery.getFullYear(), dataFromQuery.getMonth(), dataFromQuery.getDate()]);
				} else {
					columns.push(dataFromQuery ?? null);
				}

				columnIndex++;
			}

			listData.results.push({
				id: user.aId,
				data: columns,
			});
			counter++;
		}

		// TODO: format results

		res.status(200).json(listData);
	}
	// catch (err) {
	// 	appCtx.logger.error(err);
	// 	appCtx.logger.error({
	// 		errorMessage: "Error while serving list data",
	// 		query: req.query,
	// 		error: err
	// 	});
	// 	res.status(500).json({
	// 		errorMessage: "Internal error while calculating data"
	// 	});
	// }
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
			console.log(startDate);
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
		console.log(endDate);
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

function getUserLevel(serviceAwardLevels: ServiceAwardLevelDefinition[] | null, user: ActorLike, columnIndex: number, where: "start" | "end") {
	if (!serviceAwardLevels)
		return null;

	const edits = user[`column${columnIndex}_${where}Edits`];
	// TODO: do something with log events
	//const logEntries = user[`column${columnIndex}_${where}LogEvents`];
	const activeDays = user[`column${columnIndex}_${where}ActiveDays`];

	let matchingServiceAvardLevel: ServiceAwardLevelDefinition | null = null;
	for (const serviceAwardLevel of serviceAwardLevels) {
		if (edits > serviceAwardLevel.requiredEdits
			&& activeDays > serviceAwardLevel.requiredActiveDays) {
			matchingServiceAvardLevel = serviceAwardLevel;
		}
	}

	return matchingServiceAvardLevel;
}
