import { compareAsc, differenceInHours, isSameDay } from "date-fns";
import * as _ from "lodash";
import moment from "moment";
import "moment-timezone";
import { Connection, EntityManager, getManager, LessThan } from "typeorm";
import { Logger } from "winston";
import { FLAGLESS_BOT_VIRTUAL_GROUP_NAME } from "../../common/consts";
import { AppRunningContext } from "../../server/appRunningContext";
import { ApplicationConfiguration } from "../../server/configuration/applicationConfiguration";
import { createConnectionToMediaWikiReplica } from "../../server/database/connectionManager";
import { UserGroup } from "../../server/database/entities/mediawiki";
import { Actor } from "../../server/database/entities/mediawiki/actor";
import { LogEntry } from "../../server/database/entities/mediawiki/logEntry";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { ActorTypeModel, createActorEntitiesForWiki, WikiStatisticsTypesResult } from "../../server/database/entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { KnownWiki } from "../../server/interfaces/knownWiki";

interface WikiEditCacherOptions {
	appCtx: AppRunningContext;
	wiki: KnownWiki;
	toolsConnection: Connection;
}

interface CounterByDate {
	date: Date;
	events: number;
}

interface EditsByDateAndNs {
	namespace: number;
	editsByDate: CounterByDate[];
}

interface LogEntriesByDateNsAndCt {
	namespace: number;
	logType: string;
	logAction: string;
	editsByDate: CounterByDate[];
}

interface StatsByActor {
	actorId: number;
	actor: Actor;
	actorName: string;
	firstEditTimestamp: moment.Moment | null;
	lastEditTimestamp: moment.Moment | null;
	editsByDate: CounterByDate[];
	editsByDateAndNs: EditsByDateAndNs[];
	logEntriesByDate: CounterByDate[];
	logEntriesByDateNsAndCt: LogEntriesByDateNsAndCt[];
}

interface ActorToUpdate {
	mwDbActor: Actor;
	toolsDbActor: ActorTypeModel | null;
}

export class WikiEditCacher {
	private readonly appConfig: ApplicationConfiguration;
	private readonly wiki: KnownWiki;
	private readonly toolsConnection: Connection;
	private readonly logger: Logger;
	private readonly wikiStatisticsEntities: WikiStatisticsTypesResult;

	private lastProcessedRevisionId: number;
	private totalProcessedRevisions: number = 0;
	private lastProcessedLogId: number;
	private totalProcessedLogEntries: number = 0;

	private lastActorUpdateTimestamp: Date;
	private replicatedDatabaseConnection: Connection;
	private statsByActorList: StatsByActor[] = [];
	private statsByActorDict: { [index: number]: StatsByActor } = {};

	private actorsToUpdate: ActorToUpdate[] = [];

	constructor(options: WikiEditCacherOptions) {
		this.appConfig = options.appCtx.appConfig;
		this.logger = options.appCtx.logger;
		this.wiki = options.wiki;
		this.toolsConnection = options.toolsConnection;

		this.wikiStatisticsEntities = createActorEntitiesForWiki(this.wiki.id);
	}

	public async run(): Promise<void> {
		this.replicatedDatabaseConnection = await createConnectionToMediaWikiReplica(this.appConfig, this.wiki.replicaDatabaseName);

		await this.getLastProcessInfo();

		for (; ;) {
			if (!(await this.tryProcessNextRevisionBatch()))
				break;

			if (this.totalProcessedRevisions >= this.appConfig.dataCacher.maxRevisionsProcessedInASingleRun)
				break;
		}

		for (; ;) {
			if (!(await this.tryProcessNextLogBatch()))
				break;

			if (this.totalProcessedRevisions >= this.appConfig.dataCacher.maxLogEntriesProcessedInASingleRun)
				break;
		}

		const dateDiff = differenceInHours(new Date(), this.lastActorUpdateTimestamp);
		if (dateDiff > 24) {
			await this.getActorsToUpdate();
		}

		this.replicatedDatabaseConnection.close();

		await this.saveCachedDataToToolsDb();

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Finished processing ${this.totalProcessedRevisions} revisions for ${this.wiki.id}.`);
	}

	private async getLastProcessInfo(): Promise<void> {
		const wikiProcessEntry = await this.toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: this.wiki.id } });
		this.lastProcessedRevisionId = wikiProcessEntry?.lastProcessedRevisionId ?? 0;
		this.lastProcessedLogId = wikiProcessEntry?.lastProcessedLogId ?? 0;

		this.lastActorUpdateTimestamp = wikiProcessEntry?.lastActorUpdate ?? new Date(2000, 1, 1);
		if (isNaN(this.lastActorUpdateTimestamp.getTime())) {
			this.lastActorUpdateTimestamp = new Date(2000, 1, 1);
		}
	}

	private async tryProcessNextRevisionBatch(): Promise<boolean> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Getting at most ${this.appConfig.dataCacher.revisionsProcessedAtOnce} revisions starting at revision ${this.lastProcessedRevisionId + 1}...`);

		const revisions = await this.replicatedDatabaseConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("rev.comment", "comm")
			.leftJoinAndSelect("act.user", "usr")
			.where("rev.id > :lastProcessedRevisionId", { lastProcessedRevisionId: this.lastProcessedRevisionId })
			.orderBy("rev.id", "ASC")
			.limit(this.appConfig.dataCacher.revisionsProcessedAtOnce)
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
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Starting processing ${revisions.length} revisions.`);

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

			const editDate = this.getStartOfDayAsPlainDate(revision.timestamp);
			const currentEditTimestamp = moment(revision.timestamp);

			let statsByActor = this.statsByActorDict[actor.id];
			if (!statsByActor) {
				statsByActor = {
					actor: actor,
					actorId: actor.id,
					actorName: actor.user ? actor.user.name : actor.name,
					firstEditTimestamp: currentEditTimestamp,
					lastEditTimestamp: currentEditTimestamp,
					editsByDate: [{ date: editDate, events: 1 }],
					editsByDateAndNs: [{
						namespace: revision.page.namespace,
						editsByDate: [{ date: editDate, events: 1 }]
					}],
					logEntriesByDate: [],
					logEntriesByDateNsAndCt: [],
				};
				this.statsByActorList.push(statsByActor);
				this.statsByActorDict[actor.id] = statsByActor;
			} else {
				if (statsByActor.firstEditTimestamp?.isAfter(currentEditTimestamp))
					statsByActor.firstEditTimestamp = currentEditTimestamp;

				if (statsByActor.lastEditTimestamp?.isBefore(currentEditTimestamp))
					statsByActor.lastEditTimestamp = currentEditTimestamp;

				const dailyBucket = statsByActor.editsByDate.find(x => isSameDay(x.date, editDate));
				if (!dailyBucket) {
					statsByActor.editsByDate.push({ date: editDate, events: 1 });
				} else {
					dailyBucket.events++;
				}

				const nsBucket = statsByActor.editsByDateAndNs.find(x => x.namespace === revision.page.namespace);
				if (!nsBucket) {
					statsByActor.editsByDateAndNs.push({
						namespace: revision.page.namespace,
						editsByDate: [{ date: editDate, events: 1 }]
					});
				} else {
					const dailyNsBucket = nsBucket.editsByDate.find(x => isSameDay(x.date, editDate));
					if (!dailyNsBucket) {
						nsBucket.editsByDate.push({ date: editDate, events: 1 });
					} else {
						dailyNsBucket.events++;
					}
				}
			}
		}
	}

	private async tryProcessNextLogBatch(): Promise<boolean> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Getting at most ${this.appConfig.dataCacher.logEntriesProcessedAtOnce} log entries starting at id ${this.lastProcessedLogId + 1}...`);

		const logEntries = await this.replicatedDatabaseConnection.getRepository(LogEntry)
			.createQueryBuilder("log")
			.leftJoinAndSelect("log.actor", "act")
			.leftJoinAndSelect("act.user", "usr")
			.where("log.id > :lastProcessedLogId", { lastProcessedLogId: this.lastProcessedLogId })
			.orderBy("log.id", "ASC")
			.limit(this.appConfig.dataCacher.logEntriesProcessedAtOnce)
			.getMany();

		if (!logEntries || logEntries.length == 0) {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] No new log entries to process.`);
			return false;
		}

		this.totalProcessedLogEntries += logEntries.length;
		this.lastProcessedLogId = logEntries[logEntries.length - 1].id;
		this.processLogEntryList(logEntries);

		return true;
	}

	private processLogEntryList(logEntries: LogEntry[]): void {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Starting processing ${logEntries.length} log entries.`);

		for (const logEntry of logEntries) {
			if (logEntry.actor == null) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Log entry ${logEntry.id} does not have a valid actor reference.`);
				continue;
			}

			const actor = logEntry.actor;

			const editDate = this.getStartOfDayAsPlainDate(logEntry.timestamp);

			let statsByActor = this.statsByActorDict[actor.id];
			if (!statsByActor) {
				statsByActor = {
					actor: actor,
					actorId: actor.id,
					actorName: actor.user ? actor.user.name : actor.name,
					firstEditTimestamp: null,
					lastEditTimestamp: null,
					editsByDate: [],
					editsByDateAndNs: [],
					logEntriesByDate: [{ date: editDate, events: 1 }],
					logEntriesByDateNsAndCt: [{
						namespace: logEntry.namespace,
						logType: logEntry.type,
						logAction: logEntry.action,
						editsByDate: [{ date: editDate, events: 1 }]
					}]
				};
				this.statsByActorList.push(statsByActor);
				this.statsByActorDict[actor.id] = statsByActor;
			} else {
				const dailyBucket = statsByActor.logEntriesByDate.find(x => isSameDay(x.date, editDate));
				if (!dailyBucket) {
					statsByActor.logEntriesByDate.push({ date: editDate, events: 1 });
				} else {
					dailyBucket.events++;
				}

				const nsctBucket = statsByActor.logEntriesByDateNsAndCt.find(x => x.namespace === logEntry.namespace
					&& x.logType === logEntry.type
					&& x.logAction === logEntry.action);
				if (!nsctBucket) {
					statsByActor.logEntriesByDateNsAndCt.push({
						namespace: logEntry.namespace,
						logType: logEntry.type,
						logAction: logEntry.action,
						editsByDate: [{ date: editDate, events: 1 }]
					});
				} else {
					const dailyNsBucket = nsctBucket.editsByDate.find(x => isSameDay(x.date, editDate));
					if (!dailyNsBucket) {
						nsctBucket.editsByDate.push({ date: editDate, events: 1 });
					} else {
						dailyNsBucket.events++;
					}
				}
			}
		}
	}

	private getStartOfDayAsPlainDate(timestamp: Date) {
		return moment(
			moment.tz(timestamp, "UTC")
				.tz(this.wiki.timeZone, false)
				.startOf("day")
				.format("YYYY-MM-DDTHH:mm:ss"),
			"YYYY-MM-DDTHH:mm:ss"
		).toDate();
	}

	private async getActorsToUpdate(): Promise<void> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActors: Getting actors from replica db`);
		const userActors = await this.replicatedDatabaseConnection.getRepository(Actor)
			.createQueryBuilder("actor")
			.innerJoinAndSelect("actor.user", "user")
			.leftJoinAndSelect("user.userGroups", "groups")
			.getMany();
		this.injectFlaglessBotInfo(userActors);

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActors: Getting actors from stat db`);
		const existingStatActors = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("toolsActor")
			.leftJoinAndSelect("toolsActor.actorGroups", "groups")
			.where("toolsActor.isRegistered = :isRegistered", { isRegistered: 1 })
			.getMany();

		const toolsActorDict: { [index: string]: ActorTypeModel } = {};
		for (const toolsActor of existingStatActors) {
			toolsActorDict[toolsActor.actorId] = toolsActor;
		}

		for (const userActor of userActors) {
			if (!toolsActorDict[userActor.id]) {
				if (!userActor.user.registrationTimestamp)
					continue;

				this.actorsToUpdate.push({
					mwDbActor: userActor,
					toolsDbActor: null
				});
			} else {
				const toolsDbActor = toolsActorDict[userActor.id];

				const toolsDbActorGroups = new Set<string>((toolsDbActor.actorGroups || []).map(x => x.groupName));
				const userActorGroups = new Set<string>((userActor.user.userGroups || []).map(x => x.groupName));

				if (toolsDbActor.actorName !== userActor.user.name
					|| [...userActorGroups.values()].find(x => !toolsDbActorGroups.has(x))
					|| [...toolsDbActorGroups.values()].find(x => !userActorGroups.has(x))) {
					this.actorsToUpdate.push({
						mwDbActor: userActor,
						toolsDbActor: toolsDbActor
					});
				}
			}
		}

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] getActorsToUpdate: Needs to update ${this.actorsToUpdate.length} actors`);
	}

	private injectFlaglessBotInfo(actors: Actor[]): void {
		if (!this.wiki.flaglessBots)
			return;
		for (const actor of actors) {
			if (this.wiki.flaglessBots.indexOf(actor.name) === -1)
				continue;

			const virtualUserGroup: UserGroup = {
				groupName: FLAGLESS_BOT_VIRTUAL_GROUP_NAME,
				user: actor.user,
				userId: actor.user.id,
				expirationTimestamp: new Date(2050, 0, 1),
			};

			if (!actor.user.userGroups) {
				actor.user.userGroups = [virtualUserGroup];
			} else {
				actor.user.userGroups.push(virtualUserGroup);
			}
		}
	}

	private async saveCachedDataToToolsDb(): Promise<void> {
		if (this.statsByActorList.length === 0)
			return;

		const connMan = getManager(this.toolsConnection.name);
		await connMan.transaction(async (em: EntityManager) => {
			const updatedActors = this.actorsToUpdate.length > this.appConfig.dataCacher.maxActorsProcessedInASingleRun
				? this.actorsToUpdate.slice(0, this.appConfig.dataCacher.maxActorsProcessedInASingleRun)
				: this.actorsToUpdate;

			for (const actorToUpdate of updatedActors) {
				await this.updateActor(em, actorToUpdate);
			}
			for (const actorStat of this.statsByActorList) {
				await this.saveActorStatisticsToDatabase(em, actorStat);
			}
			await this.saveWikiProcessedRevisionInfo(em);
		});
	}

	private async updateActor(em: EntityManager, actorToUpdate: ActorToUpdate): Promise<void> {
		const { mwDbActor } = actorToUpdate;

		const existingActor = await em.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("toolsActor")
			.leftJoinAndSelect("toolsActor.actorGroups", "groups")
			.where("toolsActor.actorId = :actorId", { actorId: mwDbActor.id })
			.getMany();

		if (existingActor.length !== 0) {
			if (existingActor[0].actorName !== mwDbActor.user.name) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Updating actor in db for '${mwDbActor.user.name}'...`);
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actor)
					.set({ actorName: mwDbActor.user.name })
					.where("actorId = :actorId", { actorId: mwDbActor.id })
					.execute();
			}

			const toolsDbUserGroups = (existingActor[0].actorGroups || []).map(x => x.groupName);
			const mwUserGroups = (mwDbActor.user.userGroups || []).map(x => x.groupName);

			for (const groupToAdd of mwUserGroups.filter(groupName => toolsDbUserGroups.indexOf(groupName) === -1)) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Adding group '${groupToAdd}' for '${mwDbActor.user.name}'...`);

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.actorGroup)
					.values({
						actorId: mwDbActor.id,
						groupName: groupToAdd
					})
					.execute();
			}

			for (const groupToDelete of toolsDbUserGroups.filter(groupName => mwUserGroups.indexOf(groupName) === -1)) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Deleting groups for '${mwDbActor.user.name}'...`);
				await em.createQueryBuilder()
					.delete()
					.from(this.wikiStatisticsEntities.actorGroup)
					.where("actorId = :actorId", { actorId: mwDbActor.id })
					.andWhere("groupName = :groupName", { groupName: groupToDelete })
					.execute();
			}
		} else {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Creating actor for '${mwDbActor.user.name}'`);
			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actor)
				.values({
					actorId: mwDbActor.id,
					actorName: mwDbActor.user.name,
					isRegistered: true,
					isRegistrationTimestampFromFirstEdit: mwDbActor.user
						? mwDbActor.user.registrationTimestamp == null
						: null,
					registrationTimestamp: mwDbActor.user
						? (mwDbActor.user.registrationTimestamp == null
							? null
							: mwDbActor.user.registrationTimestamp)
						: null,
				})
				.execute();

			for (const group of (mwDbActor.user.userGroups || [])) {
				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.actorGroup)
					.values({
						actorId: mwDbActor.id,
						groupName: group.groupName
					})
					.execute();
			}
		}
	}

	private async saveActorStatisticsToDatabase(em: EntityManager, actorStat: StatsByActor): Promise<void> {
		actorStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
		for (const nsStat of actorStat.editsByDateAndNs) {
			nsStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
		}
		actorStat.logEntriesByDate.sort((a, b) => compareAsc(a.date, b.date));
		for (const nsctStat of actorStat.logEntriesByDateNsAndCt) {
			nsctStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
		}

		await this.saveActorEntityToDatabase(actorStat, em);
		await this.saveActorEditsByDateToDatabase(actorStat, em);
		await this.saveActorEditsByDateAndNsToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateNsAndCtToDatabase(actorStat, em);

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: ${actorStat.actorName} successfully finished.`);
	}

	private async saveActorEntityToDatabase(actorStat: StatsByActor, em: EntityManager) {
		const existingActor = await em.getRepository(this.wikiStatisticsEntities.actor)
			.findOne({ where: { actorId: actorStat.actorId } });

		if (existingActor) {
			await this.updateActorInDatabase(actorStat, existingActor, em);
		} else {
			await this.createActorInDatabase(actorStat, em);
		}
	}

	private async createActorInDatabase(actorStat: StatsByActor, em: EntityManager) {
		const firstEditDate = actorStat.editsByDate.length > 0 ? actorStat.editsByDate[0].date : undefined;

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] createActorInDatabase: Creating actor for '${actorStat.actorName}'`);
		await em.createQueryBuilder()
			.insert()
			.into(this.wikiStatisticsEntities.actor)
			.values({
				actorId: actorStat.actorId,
				actorName: actorStat.actorName,
				firstEditTimestamp: actorStat.firstEditTimestamp?.toDate() ?? undefined,
				lastEditTimestamp: actorStat.lastEditTimestamp?.toDate() ?? undefined,
				isRegistered: !!actorStat.actor.user,
				isRegistrationTimestampFromFirstEdit: actorStat.actor.user
					? actorStat.actor.user.registrationTimestamp == null
					: null,
				registrationTimestamp: actorStat.actor.user
					? (actorStat.actor.user.registrationTimestamp == null
						? (firstEditDate ?? null)
						: actorStat.actor.user.registrationTimestamp)
					: null,
			})
			.execute();
	}

	private async updateActorInDatabase(actorStat: StatsByActor, existingActor: ActorTypeModel, em: EntityManager): Promise<void> {
		if (existingActor.firstEditTimestamp == null && actorStat.firstEditTimestamp == null
			&& existingActor.lastEditTimestamp == null && actorStat.lastEditTimestamp == null)
			return;

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] createActorInDatabase: Updating first/last edit statistics for '${actorStat.actorName}'`);

		const isRegistrationTimestampFromFirstEdit = existingActor.registrationTimestamp != null
			? existingActor.isRegistrationTimestampFromFirstEdit
			: true;
		const actorRegistrationTimestamp = existingActor.registrationTimestamp != null
			? existingActor.registrationTimestamp
			: actorStat.firstEditTimestamp;

		const firstEditTimestamp =
			existingActor.firstEditTimestamp == null && actorStat.firstEditTimestamp == null ? undefined
				: actorStat.firstEditTimestamp == null ? existingActor.firstEditTimestamp
					: existingActor.firstEditTimestamp == null ? actorStat.firstEditTimestamp.toDate()
						: actorStat.firstEditTimestamp.isBefore(moment(existingActor.firstEditTimestamp)) ? actorStat.firstEditTimestamp.toDate() : existingActor.firstEditTimestamp;
		const lastEditTimestamp =
			existingActor.lastEditTimestamp == null && actorStat.lastEditTimestamp == null ? undefined
				: actorStat.lastEditTimestamp == null ? existingActor.lastEditTimestamp
					: existingActor.lastEditTimestamp == null ? actorStat.lastEditTimestamp.toDate()
						: actorStat.lastEditTimestamp.isAfter(moment(existingActor.lastEditTimestamp)) ? actorStat.lastEditTimestamp.toDate() : existingActor.lastEditTimestamp;

		await em
			.createQueryBuilder()
			.update(this.wikiStatisticsEntities.actor)
			.set({
				firstEditTimestamp: firstEditTimestamp,
				lastEditTimestamp: lastEditTimestamp,
				registrationTimestamp: actorRegistrationTimestamp,
				isRegistrationTimestampFromFirstEdit: isRegistrationTimestampFromFirstEdit,
			})
			.where("actorId = :actorId", { actorId: actorStat.actorId })
			.execute();
	}

	private async saveActorEditsByDateToDatabase(actorStat: StatsByActor, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date for ${actorStat.actorName} (${actorStat.editsByDate.length} items)...`);

		for (const editByDate of actorStat.editsByDate) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorEditStatistics)
				.findOne({ where: { actorId: actorStat.actorId, date: editByDate.date } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorEditStatistics)
					.set({ dailyEdits: existingStat.dailyEdits + editByDate.events })
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date = :date", { date: editByDate.date })
					.execute();

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorEditStatistics)
					.set({
						dailyEdits: () => `daily_edits + ${editByDate.events}`,
						editsToDate: () => `edits_to_date + ${editByDate.events}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDate.date })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorEditStatistics)
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
					.into(this.wikiStatisticsEntities.actorEditStatistics)
					.values({
						actorId: actorStat.actorId,
						date: editByDate.date,
						dailyEdits: editByDate.events,
						editsToDate: previousDay
							? previousDay.editsToDate + previousDay.dailyEdits
							: 0
					})
					.execute();
			}

		}
	}

	private async saveActorEditsByDateAndNsToDatabase(actorStat: StatsByActor, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByDateAndNs, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.editsByDateAndNs) {
			for (const editByDateAndNs of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespace)
					.findOne({ where: { actorId: actorStat.actorId, namespace: editsByNs.namespace, date: editByDateAndNs.date } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorEditStatisticsByNamespace)
						.set({ dailyEdits: existingStat.dailyEdits + editByDateAndNs.events })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateAndNs.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorEditStatisticsByNamespace)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateAndNs.events}`,
							editsToDate: () => `edits_to_date + ${editByDateAndNs.events}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date > :date", { date: editByDateAndNs.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespace)
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
						.into(this.wikiStatisticsEntities.actorEditStatisticsByNamespace)
						.values({
							actorId: actorStat.actorId,
							date: editByDateAndNs.date,
							namespace: editsByNs.namespace,
							dailyEdits: editByDateAndNs.events,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0
						})
						.execute();
				}
			}
		}
	}

	private async saveActorLogEntriesByDateToDatabase(actorStat: StatsByActor, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date for ${actorStat.actorName} (${actorStat.editsByDate.length} items)...`);

		for (const editByDate of actorStat.editsByDate) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatistics)
				.findOne({ where: { actorId: actorStat.actorId, date: editByDate.date } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorLogStatistics)
					.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDate.events })
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date = :date", { date: editByDate.date })
					.execute();

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorLogStatistics)
					.set({
						dailyLogEvents: () => `daily_log_events + ${editByDate.events}`,
						logEventsToDate: () => `log_events_to_date + ${editByDate.events}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDate.date })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatistics)
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
					.into(this.wikiStatisticsEntities.actorLogStatistics)
					.values({
						actorId: actorStat.actorId,
						date: editByDate.date,
						dailyLogEvents: editByDate.events,
						logEventsToDate: previousDay
							? previousDay.logEventsToDate + previousDay.dailyLogEvents
							: 0
					})
					.execute();
			}
		}
	}

	private async saveActorLogEntriesByDateNsAndCtToDatabase(actorStat: StatsByActor, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.logEntriesByDateNsAndCt, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date, log type and namespace for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.logEntriesByDateNsAndCt) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndChangeTag)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							namespace: editsByNs.namespace,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							date: editByDateNsAndCt.date
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndChangeTag)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.events })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndChangeTag)
						.set({
							dailyLogEvents: () => `daily_edits + ${editByDateNsAndCt.events}`,
							logEventsToDate: () => `edits_to_date + ${editByDateNsAndCt.events}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date > :date", { date: editByDateNsAndCt.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndChangeTag)
						.findOne({
							where: {
								actorId: actorStat.actorId,
								namespace: editsByNs.namespace,
								logAction: editsByNs.logAction,
								logType: editsByNs.logType,
								date: LessThan(editByDateNsAndCt.date)
							},
							order: {
								date: "DESC"
							}
						});

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndChangeTag)
						.values({
							actorId: actorStat.actorId,
							date: editByDateNsAndCt.date,
							namespace: editsByNs.namespace,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.logEventsToDate
								: 0
						})
						.execute();
				}
			}
		}
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
					lastProcessedLogId: this.lastProcessedLogId,
					lastActorUpdate: this.actorsToUpdate.length > 0
						? moment.utc().toDate()
						: this.lastActorUpdateTimestamp,
				})
				.execute();
		} else {
			await em
				.createQueryBuilder()
				.update(WikiProcessedRevisions)
				.set({
					lastProcessedRevisionId: this.lastProcessedRevisionId,
					lastProcessedLogId: this.lastProcessedLogId,
					lastActorUpdate: this.actorsToUpdate.length > 0
						? moment.utc().toDate()
						: this.lastActorUpdateTimestamp,
				})
				.andWhere("wiki = :wiki", { wiki: this.wiki.id })
				.execute();
		}
	}
}
