import { compareAsc, isSameDay, startOfDay } from "date-fns";
import * as _ from "lodash";
import { Connection, EntityManager, getManager } from "typeorm";
import winston from "winston";
import { ApplicationConfiguration } from "../../server/configuration/applicationConfiguration";
import { readApplicationConfiguration, readKnownWikisConfiguration } from "../../server/configuration/configurationReader";
import { createConnectionToMediaWikiReplica, createConnectionToUserDatabase } from "../../server/database/connectionManager";
import { Actor } from "../../server/database/entities/mediawiki/actor";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { createActorEntitiesForWiki } from "../../server/database/entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { createWikiStatLogger } from "../../server/loggingHelper";
import { moduleManager } from "../../server/modules/moduleManager";

moduleManager.getModules();

const REVISIONS_PROCESSED_AT_ONCE = 1000;

interface EditsByDate {
	date: Date;
	edits: number;
}

interface EditsByDateAndNs {
	namespace: number;
	editsByDate: EditsByDate[];
}

interface StatsByActor {
	actorId: number;
	actor: Actor;
	editsByDate: EditsByDate[];
	editsByDateAndNs: EditsByDateAndNs[];
}

const doWikiCacheProcess = async (appConfig: ApplicationConfiguration, toolsConnection: Connection, wiki: string, logger: winston.Logger): Promise<void> => {
	const mwConnection = await createConnectionToMediaWikiReplica(appConfig, "huwiki_p");
	const wikiStatisticsEntities = createActorEntitiesForWiki("huwiki");

	const wikiProcessEntry = await toolsConnection.getRepository(WikiProcessedRevisions)
		.findOne({ where: { wiki: wiki } });

	const lastProcessedRevisionId = wikiProcessEntry?.lastProcessedRevisionId ?? 0;

	logger.info(`[doWikiCacheProcess/${wiki}] Getting at most ${REVISIONS_PROCESSED_AT_ONCE} revisions starting at revision ${lastProcessedRevisionId + 1}...`);

	const ret = await mwConnection.getRepository(Revision)
		.createQueryBuilder("rev")
		.leftJoinAndSelect("rev.page", "page")
		.leftJoinAndSelect("rev.actor", "act")
		.leftJoinAndSelect("rev.comment", "comm")
		.leftJoinAndSelect("act.user", "usr")
		.where("rev.id > :lastProcessedRevisionId", { lastProcessedRevisionId: lastProcessedRevisionId })
		.orderBy("rev.id", "ASC")
		.limit(REVISIONS_PROCESSED_AT_ONCE)
		.getMany();

	if (!ret || ret.length == 0) {
		logger.info(`[doWikiCacheProcess/${wiki}] No new revisions to process.`);
		mwConnection.close();
		return;
	}

	logger.info(`[doWikiCacheProcess/${wiki}] Starting processing ${REVISIONS_PROCESSED_AT_ONCE} revisions.`);

	const statsByActorList: StatsByActor[] = [];

	for (const revision of ret) {
		const actor = revision.actor;

		// TODO: convert to wiki local tz, and then calculate
		const editDate = startOfDay(revision.timestamp);

		let statsByActor = statsByActorList.find(x => x.actorId == actor.id);
		if (!statsByActor) {
			statsByActor = {
				actor: actor,
				actorId: actor.id,
				editsByDate: [{ date: editDate, edits: 1 }],
				editsByDateAndNs: [{
					namespace: revision.page.namespace,
					editsByDate: [{ date: editDate, edits: 1 }]
				}]
			};
			statsByActorList.push(statsByActor);
		} else {
			const dailyBucket = statsByActor.editsByDate.find(x => isSameDay(x.date, editDate));
			if (!dailyBucket) {
				statsByActor.editsByDate.push({ date: editDate, edits: 1 });
			} else {
				dailyBucket.edits++;
			}

			const nsBucket = statsByActor.editsByDateAndNs.find(x => x.namespace == revision.page.namespace);
			if (!nsBucket) {
				statsByActor.editsByDateAndNs.push({
					namespace: revision.page.namespace,
					editsByDate: [{ date: editDate, edits: 1 }]
				});
			} else {
				const dailyNsBucket = nsBucket.editsByDate.find(x => isSameDay(x.date, editDate));
				if (!dailyNsBucket) {
					nsBucket.editsByDate.push({ date: editDate, edits: 1 });
				} else {
					dailyNsBucket.edits++;
				}
			}
		}
	}

	const connMan = getManager(toolsConnection.name);
	await connMan.transaction(async (em: EntityManager) => {
		for (const actorStat of statsByActorList) {
			const existingActor = await em.getRepository(wikiStatisticsEntities.actor)
				.findOne({ where: { actorId: actorStat.actorId } });

			actorStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
			for (const nsStat of actorStat.editsByDateAndNs) {
				nsStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
			}

			const firstEditDate = actorStat.editsByDate[0].date;

			const actorName = actorStat.actor.user ? actorStat.actor.user.name : actorStat.actor.name;
			if (existingActor) {

				// TODO: manage user groups
				if (existingActor.actorName !== actorName) {
					logger.info(`[doWikiCacheProcess/${wiki}] Persistence: Updating actor in db for '${actorName}'...`);
					await em
						.createQueryBuilder()
						.update(wikiStatisticsEntities.actor)
						.set({ actorName: actorName })
						.where("id = :actorId", { actorId: actorStat.actorId })
						.execute();
				} else {
					logger.info(`[doWikiCacheProcess/${wiki}] Persistence: Actor '${actorName}' is up to date in cache db`);
				}

			} else {
				logger.info(`[doWikiCacheProcess/${wiki}] Persistence: Creating actor for '${actorName}'`);
				await em.createQueryBuilder()
					.insert()
					.into(wikiStatisticsEntities.actor)
					.values({
						actorId: actorStat.actorId,
						actorName: actorName,
						isRegistered: !!actorStat.actor.user,
						isRegistrationTimestampFromFirstEdit: actorStat.actor.user
							? actorStat.actor.user.registrationTimestamp == null
							: null,
						registrationTimestamp: actorStat.actor.user
							? (actorStat.actor.user.registrationTimestamp == null
								? firstEditDate
								: actorStat.actor.user.registrationTimestamp)
							: null,
						userGroups: "TEST"
					})
					.execute();
			}

			logger.info(`[doWikiCacheProcess/${wiki}] Persistence: Updating edits by date for ${actorName} (${actorStat.editsByDate.length} items)...`);

			for (const editByDate of actorStat.editsByDate) {
				const existingStat = await em.getRepository(wikiStatisticsEntities.actorStatistics)
					.findOne({ where: { actorId: actorStat.actorId, date: editByDate.date } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(wikiStatisticsEntities.actorStatistics)
						.set({ dailyEdits: existingStat.dailyEdits + editByDate.edits })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.where("date = :date", { date: editByDate.date })
						.execute();
				} else {
					await em.createQueryBuilder()
						.insert()
						.into(wikiStatisticsEntities.actorStatistics)
						.values({
							actorId: actorStat.actorId,
							date: editByDate.date,
							dailyEdits: editByDate.edits,
							// TODO: get proper value
							editsToDate: 0
						})
						.execute();
				}

			}

			const nsItemCount = _.sumBy(actorStat.editsByDateAndNs, x => x.editsByDate.length);
			logger.info(`[doWikiCacheProcess/${wiki}] Persistence: Updating edits by date by namespace for ${actorName} (${nsItemCount} items)...`);

			for (const editByNs of actorStat.editsByDateAndNs) {
				for (const editByDateAndNs of editByNs.editsByDate) {
					const existingStat = await em.getRepository(wikiStatisticsEntities.actorStatisticsByNamespace)
						.findOne({ where: { actorId: actorStat.actorId, namespace: editByNs.namespace, date: editByDateAndNs.date } });

					if (existingStat) {
						await em
							.createQueryBuilder()
							.update(wikiStatisticsEntities.actorStatisticsByNamespace)
							.set({ dailyEdits: existingStat.dailyEdits + editByDateAndNs.edits })
							.where("actorId = :actorId", { actorId: actorStat.actorId })
							.where("date = :date", { date: editByDateAndNs.date })
							.andWhere("namespace = :namespace", { namespace: editByNs.namespace })
							.execute();
					} else {
						await em.createQueryBuilder()
							.insert()
							.into(wikiStatisticsEntities.actorStatisticsByNamespace)
							.values({
								actorId: actorStat.actorId,
								date: editByDateAndNs.date,
								namespace: editByNs.namespace,
								dailyEdits: editByDateAndNs.edits,
								// TODO: get proper value
								editsToDate: 0
							})
							.execute();
					}
				}
			}

			logger.info(`[doWikiCacheProcess/${wiki}] Persistence: ${actorName} successfully finished.`);
		}

		const currentWikiProcessEntry = await toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: wiki } });
		if (!currentWikiProcessEntry) {
			await em.createQueryBuilder()
				.insert()
				.into(WikiProcessedRevisions)
				.values({
					wiki: wiki,
					lastProcessedRevisionId: ret[ret.length - 1].id,
				})
				.execute();
		} else {
			await em
				.createQueryBuilder()
				.update(WikiProcessedRevisions)
				.set({ lastProcessedRevisionId: ret[ret.length - 1].id })
				.andWhere("wiki = :wiki", { wiki: wiki })
				.execute();
		}
	});


	logger.info(`[doWikiCacheProcess/${wiki}] Finished processing ${REVISIONS_PROCESSED_AT_ONCE} revisions for ${wiki}.`);

	mwConnection.close();
};

const runTool = async (): Promise<void> => {
	const logger = createWikiStatLogger("dataCacher");

	const appConfig = await readApplicationConfiguration();
	if (typeof appConfig === "string") {
		logger.error(`[runTool] Failed to start due to invalid application configuration: ${appConfig}`);
		return;
	}

	const knownWikisConfiguration = readKnownWikisConfiguration();
	if (typeof knownWikisConfiguration === "string") {
		logger.error(`[runTool] Failed to start tool due to invalid knownWikis.json: ${knownWikisConfiguration}`);
		return;
	}

	const toolsConnection = await createConnectionToUserDatabase(appConfig, `${appConfig.toolForgeUserName}__userstatistics`, ["huwiki"]);
	await doWikiCacheProcess(appConfig, toolsConnection, "huwiki", logger);
	toolsConnection.close();
};

runTool();
