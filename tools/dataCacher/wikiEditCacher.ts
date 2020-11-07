import { compareAsc, isSameDay } from "date-fns";
import * as _ from "lodash";
import moment from "moment";
import "moment-timezone";
import { Connection, EntityManager, getManager, LessThan } from "typeorm";
import { Logger } from "winston";
import { ApplicationConfiguration } from "../../server/configuration/applicationConfiguration";
import { createConnectionToMediaWikiReplica } from "../../server/database/connectionManager";
import { Actor } from "../../server/database/entities/mediawiki/actor";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { createActorEntitiesForWiki, WikiStatisticsTypesResult } from "../../server/database/entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { KnownWiki } from "../../server/interfaces/knownWiki";

const REVISIONS_PROCESSED_AT_ONCE = 1000;

interface WikiEditCacherOptions {
	appConfig: ApplicationConfiguration;
	wiki: KnownWiki;
	toolsConnection: Connection;
	logger: Logger;
}

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

export class WikiEditCacher {
	private appConfig: ApplicationConfiguration;
	private wiki: KnownWiki;
	private toolsConnection: Connection;
	private logger: Logger;
	private wikiStatisticsEntities: WikiStatisticsTypesResult;

	private lastProcessedRevisionId: number;
	private replicatedDatabaseConnection: Connection;
	private totalProcessedRevisions: number = 0;
	private statsByActorList: StatsByActor[] = [];

	constructor(options: WikiEditCacherOptions) {
		this.appConfig = options.appConfig;
		this.wiki = options.wiki;
		this.toolsConnection = options.toolsConnection;
		this.logger = options.logger;

		this.wikiStatisticsEntities = createActorEntitiesForWiki(this.wiki.id);
	}

	public async run(): Promise<void> {
		this.replicatedDatabaseConnection = await createConnectionToMediaWikiReplica(this.appConfig, this.wiki.replicaDatabaseName);

		await this.getLastProcessedRevisionId();

		for (; ;) {
			if (!(await this.tryProcessNextRevisionBatch()))
				break;

			if (this.totalProcessedRevisions > 2000)
				break;
		}
		this.replicatedDatabaseConnection.close();

		await this.saveCachedDataToToolsDb();

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Finished processing ${this.totalProcessedRevisions} revisions for ${this.wiki.id}.`);
	}

	private async getLastProcessedRevisionId(): Promise<void> {
		const wikiProcessEntry = await this.toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: this.wiki.id } });
		this.lastProcessedRevisionId = wikiProcessEntry?.lastProcessedRevisionId ?? 0;
	}

	private async tryProcessNextRevisionBatch(): Promise<boolean> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Getting at most ${REVISIONS_PROCESSED_AT_ONCE} revisions starting at revision ${this.lastProcessedRevisionId + 1}...`);

		const revisions = await this.replicatedDatabaseConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("rev.comment", "comm")
			.leftJoinAndSelect("act.user", "usr")
			.where("rev.id > :lastProcessedRevisionId", { lastProcessedRevisionId: this.lastProcessedRevisionId })
			.orderBy("rev.id", "ASC")
			.limit(REVISIONS_PROCESSED_AT_ONCE)
			.getMany();

		if (!revisions || revisions.length == 0) {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] No new revisions to process.`);
			return false;
		}

		this.totalProcessedRevisions += revisions.length;
		this.lastProcessedRevisionId = revisions[revisions.length - 1].id;
		this.processRevisionList(revisions);

		return true;
	}

	private processRevisionList(revisions: Revision[]): void {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Starting processing ${REVISIONS_PROCESSED_AT_ONCE} revisions.`);

		for (const revision of revisions) {
			if (revision.actor == null) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Revision ${revision.id} does not have a valid actor reference.`);
				continue;
			}

			if (revision.page == null) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Revision ${revision.id} does not have a valid page reference.`);
				continue;
			}

			const actor = revision.actor;

			const editDate = this.getStartOfDayAsPlainDate(revision);

			let statsByActor = this.statsByActorList.find(x => x.actorId == actor.id);
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
				this.statsByActorList.push(statsByActor);
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
	}

	private getStartOfDayAsPlainDate(revision: Revision) {
		return moment(
			moment.tz(revision.timestamp, "UTC")
				.tz(this.wiki.timeZone, false)
				.startOf("day")
				.format("YYYY-MM-DDTHH:mm:ss"),
			"YYYY-MM-DDTHH:mm:ss"
		).toDate();
	}

	private async saveCachedDataToToolsDb(): Promise<void> {
		if (this.statsByActorList.length === 0)
			return;

		const connMan = getManager(this.toolsConnection.name);
		await connMan.transaction(async (em: EntityManager) => {
			for (const actorStat of this.statsByActorList) {
				await this.saveActorStatistics(em, actorStat);
			}
			await this.saveWikiProcessedRevisionInfo(em);
		});
	}

	private async saveActorStatistics(em: EntityManager, actorStat: StatsByActor): Promise<void> {
		const existingActor = await em.getRepository(this.wikiStatisticsEntities.actor)
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
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating actor in db for '${actorName}'...`);
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actor)
					.set({ actorName: actorName })
					.where("id = :actorId", { actorId: actorStat.actorId })
					.execute();
			} else {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Actor '${actorName}' is up to date in cache db`);
			}

		} else {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Creating actor for '${actorName}'`);
			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actor)
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

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date for ${actorName} (${actorStat.editsByDate.length} items)...`);

		for (const editByDate of actorStat.editsByDate) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorStatistics)
				.findOne({ where: { actorId: actorStat.actorId, date: editByDate.date } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorStatistics)
					.set({ dailyEdits: existingStat.dailyEdits + editByDate.edits })
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date = :date", { date: editByDate.date })
					.execute();

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorStatistics)
					.set({
						dailyEdits: () => `daily_edits + ${editByDate.edits}`,
						editsToDate: () => `edits_to_date + ${editByDate.edits}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDate.date })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorStatistics)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							date: LessThan(editByDate.date)
						},
						order: {
							date: "DESC"
						}
					});

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.actorStatistics)
					.values({
						actorId: actorStat.actorId,
						date: editByDate.date,
						dailyEdits: editByDate.edits,
						editsToDate: previousDay
							? previousDay.editsToDate + previousDay.dailyEdits
							: 0
					})
					.execute();
			}

		}

		const nsItemCount = _.sumBy(actorStat.editsByDateAndNs, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for ${actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.editsByDateAndNs) {
			for (const editByDateAndNs of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorStatisticsByNamespace)
					.findOne({ where: { actorId: actorStat.actorId, namespace: editsByNs.namespace, date: editByDateAndNs.date } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorStatisticsByNamespace)
						.set({ dailyEdits: existingStat.dailyEdits + editByDateAndNs.edits })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateAndNs.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorStatistics)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateAndNs.edits}`,
							editsToDate: () => `edits_to_date + ${editByDateAndNs.edits}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date > :date", { date: editByDateAndNs.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorStatisticsByNamespace)
						.findOne({
							where: {
								actorId: actorStat.actorId,
								namespace: editsByNs.namespace,
								date: LessThan(editByDateAndNs.date)
							},
							order: {
								date: "DESC"
							}
						});

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorStatisticsByNamespace)
						.values({
							actorId: actorStat.actorId,
							date: editByDateAndNs.date,
							namespace: editsByNs.namespace,
							dailyEdits: editByDateAndNs.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0
						})
						.execute();
				}
			}
		}

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: ${actorName} successfully finished.`);
	}

	private async saveWikiProcessedRevisionInfo(em: EntityManager): Promise<void> {
		const currentWikiProcessEntry = await em.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: this.wiki.id } });
		if (!currentWikiProcessEntry) {
			await em.createQueryBuilder()
				.insert()
				.into(WikiProcessedRevisions)
				.values({
					wiki: this.wiki.id,
					lastProcessedRevisionId: this.lastProcessedRevisionId,
				})
				.execute();
		} else {
			await em
				.createQueryBuilder()
				.update(WikiProcessedRevisions)
				.set({ lastProcessedRevisionId: this.lastProcessedRevisionId })
				.andWhere("wiki = :wiki", { wiki: this.wiki.id })
				.execute();
		}
	}
}
