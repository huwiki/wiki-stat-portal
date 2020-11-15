import { addDays, parse, startOfDay, subDays } from "date-fns";
import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { UserPyramidConfiguration } from "../../../common/modules/userPyramids/userPyramidConfiguration";
import { AppRunningContext } from "../../../server/appRunningContext";
import { ActorTypeModel, createActorEntitiesForWiki } from "../../../server/database/entities/toolsDatabase/actorByWiki";
import { KnownWiki } from "../../../server/interfaces/knownWiki";
import { moduleManager } from "../../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../../server/modules/userPyramidsModule/userPyramidsModule";

interface GroupResult {
	title: string;
	population: number;
	matchingWithPreviousGroup: number;
	sql: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const { query: { wikiId: rawWikiId, pyramidId: rawPyramidId, date: rawDate } } = req;

	const appCtx = AppRunningContext.getInstance("portal");
	if (appCtx.isValid === false) {
		// TODO: log
		res.status(500).json({ errorMessage: "Internal server error" });
		return;
	}

	const { isValid, wiki, pyramid, epochDate } = processParameters(appCtx, res, rawWikiId, rawPyramidId, rawDate);
	if (!isValid || !pyramid || !wiki || !epochDate)
		return;

	const conn = await appCtx.getToolsDbConnection();
	try {
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const results: GroupResult[] = [];
		let groupIndex = 0;
		let previousGroupUsers: ActorTypeModel[] = [];
		for (const userGroup of pyramid.groups) {
			groupIndex++;

			appCtx.logger.info(`[api/userPyramids/seriesData] running query for '${pyramid.id}', group #${groupIndex}`);

			let query = conn.getRepository(wikiEntities.actor)
				.createQueryBuilder("actor");

			const reqs = userGroup.requirements;
			let needsRegDateFilter = false;

			// Manage required joins
			if (typeof reqs.totalEditsAtLeast !== "undefined") {
				query = query.leftJoin(wikiEntities.actorStatistics, "totalEditsAtLeast", "totalEditsAtLeast.actorId = actor.actorId");
			}

			if (typeof reqs.totalEditsAtMost !== "undefined") {
				query = query.leftJoin(wikiEntities.actorStatistics, "totalEditsAtMost", "totalEditsAtMost.actorId = actor.actorId");
			}

			if (typeof reqs.inPeriodEditsAtLeast !== "undefined") {
				const periodEditsCalculationStartDate = typeof reqs.inPeriodEditsAtLeast.epoch === "number"
					? subDays(epochDate, reqs.inPeriodEditsAtLeast.period + reqs.inPeriodEditsAtLeast.epoch * -1)
					: subDays(epochDate, reqs.inPeriodEditsAtLeast.period);
				const periodEditsCalculationEndDate = typeof reqs.inPeriodEditsAtLeast.epoch === "number"
					? subDays(epochDate, reqs.inPeriodEditsAtLeast.epoch * -1)
					: epochDate;

				query = query.leftJoin(qb => {
					return qb.subQuery()
						.select("peal.actorId", "actorId")
						.addSelect("SUM(peal.dailyEdits)", "periodEdits")
						.from(wikiEntities.actorStatistics, "peal")
						.where(
							"peal.date >= :startDate AND peal.date <= :endDate",
							{ startDate: periodEditsCalculationStartDate, endDate: periodEditsCalculationEndDate }
						)
						.groupBy("peal.actorId");
				}, "periodEditsAtLeast", "periodEditsAtLeast.actorId = actor.actorId");
			}

			if (typeof reqs.inPeriodEditsAtMost !== "undefined") {
				const periodEditsCalculationStartDate = typeof reqs.inPeriodEditsAtMost.epoch === "number"
					? subDays(epochDate, reqs.inPeriodEditsAtMost.period + reqs.inPeriodEditsAtMost.epoch * -1)
					: subDays(epochDate, reqs.inPeriodEditsAtMost.period);
				const periodEditsCalculationEndDate = typeof reqs.inPeriodEditsAtMost.epoch === "number"
					? subDays(epochDate, reqs.inPeriodEditsAtMost.epoch * -1)
					: epochDate;

				query = query.leftJoin(qb => {
					return qb.subQuery()
						.select("peam.actorId", "actorId")
						.addSelect("SUM(peam.dailyEdits)", "periodEdits")
						.from(wikiEntities.actorStatistics, "peam")
						.where(
							"peam.date >= :startDate AND peam.date <= :endDate",
							{ startDate: periodEditsCalculationStartDate, endDate: periodEditsCalculationEndDate }
						)
						.groupBy("peam.actorId");
				}, "periodEditsAtMost", "periodEditsAtMost.actorId = actor.actorId");
			}

			// Registration status filter
			if (reqs.registrationStatus === "anon") {
				query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 0 });
			} else if (reqs.registrationStatus === "registered") {
				query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 1 });
				needsRegDateFilter = true;
			}

			// Registration age at least
			if (typeof reqs.registrationAgeAtLeast === "number") {
				query = query.andWhere(
					"DATEDIFF(:epoch, actor.registrationTimestamp) >= :registrationAgeAtLeast",
					{ epoch: epochDate, registrationAgeAtLeast: reqs.registrationAgeAtLeast }
				);
				needsRegDateFilter = true;
			}

			// Registration age at most
			if (typeof reqs.registrationAgeAtMost === "number") {
				query = query.andWhere(
					"DATEDIFF(:epoch, actor.registrationTimestamp) <= :registrationAgeAtMost",
					{ epoch: epochDate, registrationAgeAtMost: reqs.registrationAgeAtMost }
				);
				needsRegDateFilter = true;
			}

			if (needsRegDateFilter) {
				query = query.andWhere("actor.registrationTimestamp < :nextDate", { nextDate: addDays(epochDate, 1) });
			}

			// Total edits at least
			if (typeof reqs.totalEditsAtLeast !== "undefined") {
				const totalEditsEpochDate = typeof reqs.totalEditsAtLeast === "number"
					? epochDate
					: subDays(epochDate, reqs.totalEditsAtLeast.epoch * -1);

				query = query.andWhere(qb => {
					const subQuery = qb.subQuery()
						.select("MAX(iats.date)")
						.from(wikiEntities.actorStatistics, "iats")
						.where("iats.date <= :date", { date: totalEditsEpochDate })
						.andWhere("iats.actorId = actor.actorId")
						.getQuery();

					return "totalEditsAtLeast.date = " + subQuery;
				});

				const editsAtLeast = typeof reqs.totalEditsAtLeast === "number"
					? reqs.totalEditsAtLeast
					: reqs.totalEditsAtLeast.edits;

				query = query.andWhere("totalEditsAtLeast.editsToDate + totalEditsAtLeast.dailyEdits >= :edits", { edits: editsAtLeast });
			}

			// Total edits at most
			if (typeof reqs.totalEditsAtMost !== "undefined") {
				const totalEditsEpochDate = typeof reqs.totalEditsAtMost === "number"
					? epochDate
					: subDays(epochDate, reqs.totalEditsAtMost.epoch * -1);

				query = query.andWhere(qb => {
					const subQuery = qb.subQuery()
						.select("MAX(iats.date)")
						.from(wikiEntities.actorStatistics, "iats")
						.where("iats.date <= :date", { date: totalEditsEpochDate })
						.andWhere("iats.actorId = actor.actorId")
						.getQuery();

					return "totalEditsAtMost.date = " + subQuery;
				});

				const editsAtLeast = typeof reqs.totalEditsAtMost === "number"
					? reqs.totalEditsAtMost
					: reqs.totalEditsAtMost.edits;

				query = query.andWhere("totalEditsAtMost.editsToDate + totalEditsAtMost.dailyEdits <= :edits", { edits: editsAtLeast });
			}

			// Period edits at least
			if (typeof reqs.inPeriodEditsAtLeast !== "undefined") {
				query = query.andWhere("periodEditsAtLeast.periodEdits >= :editsAtLeast", { editsAtLeast: reqs.inPeriodEditsAtLeast.edits });
			}

			// Period edits at most
			if (typeof reqs.inPeriodEditsAtMost !== "undefined") {
				query = query.andWhere("periodEditsAtMost.periodEdits >= :editsAtMost", { editsAtMost: reqs.inPeriodEditsAtMost.edits });
			}

			appCtx.logger.info(`[api/userPyramids/seriesData] SQL: ${query.getSql()}`);

			const users = await query.getMany();

			const usersInThisGroup = new Set<number>(users.map(x => x.actorId));
			const usersInPreviousGroup = new Set<number>(previousGroupUsers != null
				? previousGroupUsers.map(x => x.actorId)
				: []);

			results.push({
				title: userGroup.name,
				population: users.length,
				matchingWithPreviousGroup: previousGroupUsers != null
					? new Set([...usersInThisGroup].filter(x => usersInPreviousGroup.has(x))).size
					: 0,
				sql: query.getSql()
			});
			previousGroupUsers = users;
		}

		res.status(200).json(results);
	}
	catch (err) {
		console.log(err);
		res.status(500).json({
			errorMessage: "¯\\_(ツ)_/¯"
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
	epochDate?: Date;
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

	let date: Date;
	try {
		date = parse(rawDate, "yyyy-MM-dd", startOfDay(new Date()));
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


