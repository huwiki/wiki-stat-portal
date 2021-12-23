import { AppRunningContext } from "../../server/appRunningContext";
import { ActorDailyStatisticsTypeModel, createActorEntitiesForWiki } from "../../server/database/entities/toolsDatabase/actorByWiki";

const runTool = async () => {
	const appCtx = AppRunningContext.getInstance("activeDaysUpdater");

	const toolsConnection = await appCtx.getToolsDbConnection();

	const wikis = appCtx.getKnownWikis();
	for (const wiki of wikis) {
		appCtx.logger.log("info", `[activeDaysUpdater] Fetching actors for ${wiki.id}...`);
		const wikiEntities = createActorEntitiesForWiki(wiki.id);

		const actors = await toolsConnection.getRepository(wikiEntities.actor)
			.createQueryBuilder("actor")
			.getMany();

		appCtx.logger.log("info", `[activeDaysUpdater] ${actors.length} actors fetched for ${wiki.id}...`);

		for (const actor of actors) {
			const actorDailyStats = await toolsConnection.getRepository(wikiEntities.actorDailyStatistics)
				.createQueryBuilder("ads")
				.where("ads.actorId = :actorId", { actorId: actor.actorId })
				.orderBy("ads.date")
				.getMany();

			appCtx.logger.log("info", `[activeDaysUpdater/${wiki.id}] Updating actor ${actor.actorName}/${actor.actorId} (${actorDailyStats.length})...`);

			let prevDailyStat: ActorDailyStatisticsTypeModel | null = null;
			for (const actorDailyStat of actorDailyStats) {
				actorDailyStat.dailyActiveDay = actorDailyStat.dailyEdits > 0
					|| actorDailyStat.dailyLogEvents > 0
					? 1
					: 0;
				actorDailyStat.activeDaysToDate = (prevDailyStat?.activeDaysToDate ?? 0) + (prevDailyStat?.dailyActiveDay ?? 0);


				await toolsConnection.getRepository(wikiEntities.actorDailyStatistics)
					.createQueryBuilder()
					.update()
					.set({
						dailyActiveDay: actorDailyStat.dailyActiveDay,
						activeDaysToDate: actorDailyStat.activeDaysToDate,
					})
					.where("actorId = :actorId", { actorId: actor.actorId })
					.andWhere("date = :date", { date: actorDailyStat.date })
					.execute();

				prevDailyStat = actorDailyStat;
			}
		}
	}

	appCtx.logger.log("info", "[activeDaysUpdater] Finished");

	toolsConnection.close();
};

runTool();
