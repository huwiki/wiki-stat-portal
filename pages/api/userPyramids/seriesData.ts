import { startOfDay, subDays } from "date-fns";
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

interface SeriesResult {
	groups: GroupResult[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
	const { query: { wikiId: rawWikiId, pyramidId: rawPyramidId, date: rawDate } } = req;

	const appCtx = AppRunningContext.getInstance("portal");
	if (appCtx.isValid === false) {
		// TODO: log
		res.status(500).json({ errorMessage: "Internal server error" });
		return;
	}

	const { isValid, wiki, pyramid } = processParameters(appCtx, res, rawWikiId, rawPyramidId, rawDate);
	if (!isValid || !pyramid || !wiki)
		return;

	const conn = await appCtx.getToolsDbConnection();
	try {
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const results: GroupResult[] = [];
		let previousGroupUsers: ActorTypeModel[] = [];
		for (const userGroup of pyramid.groups) {
			let query = conn.getRepository(wikiEntities.actor)
				.createQueryBuilder("actor");

			const reqs = userGroup.requirements;

			// Manage required joins
			if (typeof reqs.totalEditsAtLeast !== "undefined") {
				query = query.leftJoin(wikiEntities.actorStatistics, "totalEditsAtLeast", "totalEditsAtLeast.actorId = actor.actorId");
			}

			if (typeof reqs.totalEditsAtMost !== "undefined") {
				query = query.leftJoin(wikiEntities.actorStatistics, "totalEditsAtMost", "totalEditsAtMost.actorId = actor.actorId");
			}

			if (typeof reqs.inPeriodEditsAtLeast !== "undefined") {
				const startDate = typeof reqs.inPeriodEditsAtLeast.epoch === "number"
					? subDays(startOfDay(new Date()), reqs.inPeriodEditsAtLeast.period + reqs.inPeriodEditsAtLeast.epoch)
					: subDays(startOfDay(new Date()), reqs.inPeriodEditsAtLeast.period);
				const endDate = typeof reqs.inPeriodEditsAtLeast.epoch === "number"
					? subDays(startOfDay(new Date()), reqs.inPeriodEditsAtLeast.epoch)
					: startOfDay(new Date());

				query = query.leftJoin(qb => {
					return qb.subQuery()
						.select("peal.actorId", "actorId")
						.addSelect("SUM(peal.dailyEdits)", "periodEdits")
						.from(wikiEntities.actorStatistics, "peal")
						.where(
							"peal.date >= :startDate AND peal.date <= :endDate",
							{ startDate: startDate, endDate: endDate }
						)
						.groupBy("peal.actorId");
				}, "periodEditsAtLeast", "periodEditsAtLeast.actorId = actor.actorId");
			}

			if (typeof reqs.inPeriodEditsAtMost !== "undefined") {
				const startDate = typeof reqs.inPeriodEditsAtMost.epoch === "number"
					? subDays(startOfDay(new Date()), reqs.inPeriodEditsAtMost.period + reqs.inPeriodEditsAtMost.epoch)
					: subDays(startOfDay(new Date()), reqs.inPeriodEditsAtMost.period);
				const endDate = typeof reqs.inPeriodEditsAtMost.epoch === "number"
					? subDays(startOfDay(new Date()), reqs.inPeriodEditsAtMost.epoch)
					: startOfDay(new Date());

				query = query.leftJoin(qb => {
					return qb.subQuery()
						.select("peam.actorId", "actorId")
						.addSelect("SUM(peam.dailyEdits)", "periodEdits")
						.from(wikiEntities.actorStatistics, "peam")
						.where(
							"peam.date >= :startDate AND peam.date <= :endDate",
							{ startDate: startDate, endDate: endDate }
						)
						.groupBy("peam.actorId");
				}, "periodEditsAtMost", "periodEditsAtMost.actorId = actor.actorId");
			}

			// Registration status filter
			if (reqs.registrationStatus === "anon") {
				query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 0 });
			} else if (reqs.registrationStatus === "registered") {
				query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 1 });
			}

			// Registration age at least
			if (typeof reqs.registrationAgeAtLeast === "number") {
				query = query.andWhere(
					"DATEDIFF(NOW(), actor.registrationTimestamp) >= registrationAgeAtLeast",
					{ registrationAgeAtLeast: true }
				);
			}

			// Registration age at most
			if (typeof reqs.registrationAgeAtMost === "number") {
				query = query.andWhere(
					"DATEDIFF(NOW(), actor.registrationTimestamp) <= registrationAgeAtMost",
					{ registrationAgeAtMost: true }
				);
			}

			// Total edits at least
			if (typeof reqs.totalEditsAtLeast !== "undefined") {
				const date = typeof reqs.totalEditsAtLeast === "number"
					? new Date()
					: subDays(new Date(), reqs.totalEditsAtLeast.epoch);

				query = query.andWhere(qb => {
					const subQuery = qb.subQuery()
						.select("MAX(iats.date)")
						.from(wikiEntities.actorStatistics, "iats")
						.where("iats.date <= :date", { date: date })
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
				const date = typeof reqs.totalEditsAtMost === "number"
					? new Date()
					: subDays(new Date(), reqs.totalEditsAtMost.epoch);

				query = query.andWhere(qb => {
					const subQuery = qb.subQuery()
						.select("MAX(iats.date)")
						.from(wikiEntities.actorStatistics, "iats")
						.where("iats.date <= :date", { date: date })
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

			const users = await query.getMany();

			results.push({
				title: userGroup.name,
				population: users.length,
				matchingWithPreviousGroup: previousGroupUsers != null
					? users.filter(cur =>
						previousGroupUsers.findIndex(prev => cur.actorId === prev.actorId) !== -1
					).length
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
	wikiId: string | string[],
	pyramidId: string | string[],
	date: string | string[]
): {
	isValid: boolean;
	wiki?: KnownWiki;
	pyramid?: UserPyramidConfiguration;
} => {
	const userPyramidModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");
	if (!userPyramidModule) {
		res.status(500).json({ errorMessage: "Internal server error" });
		return { isValid: false };
	}

	if (!wikiId || isArray(wikiId)) {
		res.status(400).json({ errorMessage: "Invalid or missing wikiId parameter" });
		return { isValid: false };
	}

	const wiki = appCtx.getKnownWikiById(wikiId);

	if (!wiki) {
		res.status(400).json({ errorMessage: "Wiki is not supported on this portal" });
		return { isValid: false };
	}

	if (!pyramidId || isArray(pyramidId)) {
		res.status(400).json({ errorMessage: "Invalid or missing pyramidId parameter" });
		return { isValid: false };
	}

	if (!date || isArray(date)) {
		res.status(400).json({ errorMessage: "Invalid or missing date parameter" });
		return { isValid: false };
	}

	const wikiPyramids = userPyramidModule.userPyramids.find(x => x.wiki === wikiId);

	if (userPyramidModule.availableAt.indexOf(wikiId) === -1
		|| !wikiPyramids
		|| wikiPyramids.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly for this module" });
		return { isValid: false };
	}

	const pyramidDefinition = wikiPyramids.userPyramids.find(x => x.id === pyramidId);
	if (!pyramidDefinition) {
		res.status(400).json({ errorMessage: "Invalid wiki pyramid id" });
		return { isValid: false };
	}

	return { isValid: true, wiki: wiki, pyramid: pyramidDefinition };
};


