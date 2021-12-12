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

const BASE_TIMESTAMP: string = "20211113000000";

interface WikiEditCacherOptions {
	appCtx: AppRunningContext;
	wiki: KnownWiki;
	toolsConnection: Connection;
}

interface DailyStatistics {
	date: Date;
	edits: number;
	revertedEdits: number;
	characterChanges: number;
	thanks: number;
	logEvents: number;
}

interface LogStatisticsOnDate {
	date: Date;
	logEntries: number;
}

interface EditsByDateAndNamespace {
	namespace: number;
	editsByDate: DailyStatistics[];
}

interface EditsByDateNamespaceAndChangeTag {
	namespace: number;
	changeTagId: number;
	editsByDate: DailyStatistics[];
}

interface LogEntriesByDateNamespaceAndChangeTag {
	namespace: number;
	logType: string;
	logAction: string;
	editsByDate: LogStatisticsOnDate[];
}

interface WikiStatisticsUpdateCollection {
	dailyStatistics: DailyStatistics[];
	editsByDateAndNs: EditsByDateAndNamespace[];
	editsByDateNsAndChangeTag: EditsByDateNamespaceAndChangeTag[];
	logEntriesByDateNsAndCt: LogEntriesByDateNamespaceAndChangeTag[];
}

interface ActorStatisticsUpdateCollection extends WikiStatisticsUpdateCollection {
	actorId: number;
	actor: Actor;
	actorName: string;
	firstEditTimestamp: moment.Moment | null;
	lastEditTimestamp: moment.Moment | null;
	firstLogEntryTimestamp: moment.Moment | null;
	lastLogEntryTimestamp: moment.Moment | null;
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
	private statsByActorList: ActorStatisticsUpdateCollection[] = [];
	private statsByActorDict: { [index: number]: ActorStatisticsUpdateCollection } = {};
	private statsByWiki: WikiStatisticsUpdateCollection = WikiEditCacher.createNewStatsByWikiInstance();

	private wikiActors: Actor[] = [];
	private wikiActorsById: Map<number, Actor> = new Map<number, Actor>();
	private wikiActorsByName: Map<string, Actor> = new Map<string, Actor>();
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
		await this.getAllWikiActors();

		for (; ;) {
			if (!(await this.tryProcessNextRevisionBatch()))
				break;

			if (this.totalProcessedRevisions >= this.appConfig.dataCacher.maxRevisionsProcessedInASingleRun)
				break;
		}

		for (; ;) {
			if (!(await this.tryProcessNextLogBatch()))
				break;

			if (this.totalProcessedLogEntries >= this.appConfig.dataCacher.maxLogEntriesProcessedInASingleRun)
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

	private async getAllWikiActors(): Promise<void> {
		this.logger.info(`[getAllWikiActors/${this.wiki.id}] updateActors: Getting actors from replica db`);
		this.wikiActors = await this.replicatedDatabaseConnection.getRepository(Actor)
			.createQueryBuilder("actor")
			.innerJoinAndSelect("actor.user", "user")
			.leftJoinAndSelect("user.userGroups", "groups")
			.getMany();
		this.injectFlaglessBotInfo(this.wikiActors);

		for (const actor of this.wikiActors) {
			const name = WikiEditCacher.getActorName(actor);
			this.wikiActorsById.set(actor.id, actor);
			this.wikiActorsByName.set(name, actor);
		}
	}

	private async tryProcessNextRevisionBatch(): Promise<boolean> {
		this.logger.info(`[tryProcessNextRevisionBatch/${this.wiki.id}] Getting at most ${this.appConfig.dataCacher.revisionsProcessedAtOnce} revisions starting at revision ${this.lastProcessedRevisionId + 1}...`);

		const revisions = await this.replicatedDatabaseConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("rev.comment", "comm")
			.leftJoinAndSelect("act.user", "usr")
			.leftJoinAndSelect("rev.parentRevision", "p")
			.leftJoinAndSelect("rev.changeTags", "ctags")
			.where("rev.id > :lastProcessedRevisionId", { lastProcessedRevisionId: this.lastProcessedRevisionId })
			.andWhere("rev.rev_timestamp > :baseTimestamp", { baseTimestamp: BASE_TIMESTAMP })
			.orderBy("rev.id", "ASC")
			.limit(this.appConfig.dataCacher.revisionsProcessedAtOnce)
			.getMany();

		if (!revisions || revisions.length == 0) {
			this.logger.info(`[tryProcessNextRevisionBatch/${this.wiki.id}] No new revisions to process.`);
			return false;
		}

		this.totalProcessedRevisions += revisions.length;
		this.lastProcessedRevisionId = revisions[revisions.length - 1].id;
		this.processRevisionList(revisions);

		return true;
	}

	private processRevisionList(revisions: Revision[]): void {
		this.logger.info(`[processRevisionList/${this.wiki.id}] Starting processing ${revisions.length} revisions.`);

		for (const revision of revisions) {
			if (revision.actor == null) {
				this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revision.id} does not have a valid actor reference.`);
				continue;
			}

			if (revision.page == null) {
				this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revision.id} does not have a valid page reference.`);
				continue;
			}

			const actor = revision.actor;

			const editDate = this.getStartOfDayAsPlainDate(revision.timestamp);
			const currentEditTimestamp = moment(revision.timestamp);
			const characterChanges = revision.length - (revision.parentRevision?.length ?? 0);

			let statsByActor = this.statsByActorDict[actor.id];
			if (!statsByActor) {
				statsByActor = WikiEditCacher.createNewStatsByActorInstance(actor);

				this.statsByActorList.push(statsByActor);
				this.statsByActorDict[actor.id] = statsByActor;
			}

			if (statsByActor.firstEditTimestamp == null
				|| statsByActor.firstEditTimestamp?.isAfter(currentEditTimestamp))
				statsByActor.firstEditTimestamp = currentEditTimestamp;

			if (statsByActor.lastEditTimestamp == null
				|| statsByActor.lastEditTimestamp?.isBefore(currentEditTimestamp))
				statsByActor.lastEditTimestamp = currentEditTimestamp;

			this.collectDailyStatisticsFromRevision(statsByActor, currentEditTimestamp, editDate, characterChanges, revision);
			this.collectDailyStatisticsFromRevision(this.statsByWiki, currentEditTimestamp, editDate, characterChanges, revision);
		}
	}

	private collectDailyStatisticsFromRevision(statsByActor: WikiStatisticsUpdateCollection, currentEditTimestamp: moment.Moment, editDate: Date, characterChanges: number, revision: Revision) {
		const dailyBucket = statsByActor.dailyStatistics.find(x => isSameDay(x.date, editDate));
		if (!dailyBucket) {
			statsByActor.dailyStatistics.push({ date: editDate, edits: 1, revertedEdits: 0, characterChanges: characterChanges, thanks: 0, logEvents: 0 });
		} else {
			dailyBucket.edits++;
			dailyBucket.characterChanges += characterChanges;
		}

		const nsBucket = statsByActor.editsByDateAndNs.find(x => x.namespace === revision.page.namespace);
		if (!nsBucket) {
			statsByActor.editsByDateAndNs.push({
				namespace: revision.page.namespace,
				editsByDate: [{ date: editDate, edits: 1, revertedEdits: 0, characterChanges: characterChanges, thanks: 0, logEvents: 0 }]
			});
		} else {
			const dailyNsBucket = nsBucket.editsByDate.find(x => isSameDay(x.date, editDate));
			if (!dailyNsBucket) {
				nsBucket.editsByDate.push({ date: editDate, edits: 1, revertedEdits: 0, characterChanges: characterChanges, thanks: 0, logEvents: 0 });
			} else {
				dailyNsBucket.edits++;
				dailyNsBucket.characterChanges += characterChanges;
			}
		}

		for (const ct of (revision.changeTags || [])) {
			const ctBucket = statsByActor.editsByDateNsAndChangeTag.find(x => x.namespace === revision.page.namespace
				&& x.changeTagId === ct.tagDefitionId);
			if (!ctBucket) {
				statsByActor.editsByDateNsAndChangeTag.push({
					namespace: revision.page.namespace,
					changeTagId: ct.tagDefitionId,
					editsByDate: [{ date: editDate, edits: 1, revertedEdits: 0, characterChanges: characterChanges, thanks: 0, logEvents: 0 }]
				});
			} else {
				const dailyCtBucket = ctBucket.editsByDate.find(x => isSameDay(x.date, editDate));
				if (!dailyCtBucket) {
					ctBucket.editsByDate.push({ date: editDate, edits: 1, revertedEdits: 0, characterChanges: characterChanges, thanks: 0, logEvents: 0 });
				} else {
					dailyCtBucket.edits++;
					dailyCtBucket.characterChanges += characterChanges;
				}
			}
		}
	}

	private async tryProcessNextLogBatch(): Promise<boolean> {
		this.logger.info(`[tryProcessNextLogBatch/${this.wiki.id}] Getting at most ${this.appConfig.dataCacher.logEntriesProcessedAtOnce} log entries starting at id ${this.lastProcessedLogId + 1}...`);

		const logEntries = await this.replicatedDatabaseConnection.getRepository(LogEntry)
			.createQueryBuilder("log")
			.leftJoinAndSelect("log.actor", "act")
			.leftJoinAndSelect("act.user", "usr")
			.where("log.id > :lastProcessedLogId", { lastProcessedLogId: this.lastProcessedLogId })
			.andWhere("log.log_timestamp > :baseTimestamp", { baseTimestamp: BASE_TIMESTAMP })
			.orderBy("log.id", "ASC")
			.limit(this.appConfig.dataCacher.logEntriesProcessedAtOnce)
			.getMany();

		if (!logEntries || logEntries.length == 0) {
			this.logger.info(`[tryProcessNextLogBatch/${this.wiki.id}] No new log entries to process.`);
			return false;
		}

		this.totalProcessedLogEntries += logEntries.length;
		this.lastProcessedLogId = logEntries[logEntries.length - 1].id;
		this.processLogEntryList(logEntries);

		return true;
	}

	private processLogEntryList(logEntries: LogEntry[]): void {
		this.logger.info(`[processLogEntryList/${this.wiki.id}] Starting processing ${logEntries.length} log entries.`);

		for (const logEntry of logEntries) {
			if (logEntry.actor == null) {
				this.logger.info(`[processLogEntryList/${this.wiki.id}] Log entry ${logEntry.id} does not have a valid actor reference.`);
				continue;
			}

			const actor = logEntry.actor;

			const logEntryDate = this.getStartOfDayAsPlainDate(logEntry.timestamp);
			const currentLogEntryTimestamp = moment(logEntry.timestamp);

			this.processStandardLogEntry(actor, logEntry, logEntryDate, currentLogEntryTimestamp);
			if (logEntry.type === "thanks" && logEntry.action == "thank") {
				this.processThanksLogEntry(actor, logEntry, logEntryDate);
			}
		}
	}

	private processStandardLogEntry(actor: Actor, logEntry: LogEntry, logEntryDate: Date, currentLogEntryTimestamp: moment.Moment) {
		let statsByActor = this.statsByActorDict[actor.id];
		if (!statsByActor) {
			statsByActor = WikiEditCacher.createNewStatsByActorInstance(actor);
			this.statsByActorList.push(statsByActor);
			this.statsByActorDict[actor.id] = statsByActor;
		}

		if (statsByActor.firstLogEntryTimestamp == null
			|| statsByActor.firstLogEntryTimestamp?.isAfter(currentLogEntryTimestamp))
			statsByActor.firstLogEntryTimestamp = currentLogEntryTimestamp;

		if (statsByActor.lastLogEntryTimestamp == null
			|| statsByActor.lastLogEntryTimestamp?.isBefore(currentLogEntryTimestamp))
			statsByActor.lastLogEntryTimestamp = currentLogEntryTimestamp;

		this.collectDailyStatisticsFromStandardLogEntry(statsByActor, currentLogEntryTimestamp, logEntryDate, logEntry);
		this.collectDailyStatisticsFromStandardLogEntry(this.statsByWiki, currentLogEntryTimestamp, logEntryDate, logEntry);
	}

	private collectDailyStatisticsFromStandardLogEntry(stats: WikiStatisticsUpdateCollection, currentLogEntryTimestamp: moment.Moment, logEntryDate: Date, logEntry: LogEntry) {
		const dailyBucket = stats.dailyStatistics.find(x => isSameDay(x.date, logEntryDate));
		if (!dailyBucket) {
			stats.dailyStatistics.push({ date: logEntryDate, edits: 0, revertedEdits: 0, characterChanges: 0, thanks: 0, logEvents: 1 });
		} else {
			dailyBucket.logEvents++;
		}

		const nsltBucket = stats.logEntriesByDateNsAndCt.find(x => x.namespace === logEntry.namespace
			&& x.logType === logEntry.type
			&& x.logAction === logEntry.action);
		if (!nsltBucket) {
			stats.logEntriesByDateNsAndCt.push({
				namespace: logEntry.namespace,
				logType: logEntry.type,
				logAction: logEntry.action,
				editsByDate: [{ date: logEntryDate, logEntries: 1 }]
			});
		} else {
			const dailyNsBucket = nsltBucket.editsByDate.find(x => isSameDay(x.date, logEntryDate));
			if (!dailyNsBucket) {
				nsltBucket.editsByDate.push({ date: logEntryDate, logEntries: 1 });
			} else {
				dailyNsBucket.logEntries++;
			}
		}
	}

	private processThanksLogEntry(logActor: Actor, logEntry: LogEntry, logEntryDate: Date): void {
		if (typeof logEntry.title !== "string") {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Thanks log entry ${logEntry.id} does not have a valid title.`);
			return;
		}

		// We have to normalize user names. In log_title, they stored with underscores, but
		// in the actor/user table they have no underscores in them.
		const candidateUserName = logEntry.title.replace(/_/g, " ");

		const thankedActor = this.wikiActorsByName.get(candidateUserName);
		if (!thankedActor) {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Thanks log entry ${logEntry.id} references unknown user: ${candidateUserName}`);
			return;
		}

		let statsByActor = this.statsByActorDict[thankedActor.id];
		if (!statsByActor) {
			statsByActor = WikiEditCacher.createNewStatsByActorInstance(thankedActor);
			this.statsByActorList.push(statsByActor);
			this.statsByActorDict[thankedActor.id] = statsByActor;
		}

		this.collectStatisticsFromThanksLogEntry(statsByActor, logEntryDate);
		this.collectStatisticsFromThanksLogEntry(this.statsByWiki, logEntryDate);
	}

	private collectStatisticsFromThanksLogEntry(statsByActor: WikiStatisticsUpdateCollection, logEntryDate: Date) {
		const dailyBucket = statsByActor.dailyStatistics.find(x => isSameDay(x.date, logEntryDate));
		if (!dailyBucket) {
			statsByActor.dailyStatistics.push({ date: logEntryDate, edits: 0, revertedEdits: 0, characterChanges: 0, thanks: 1, logEvents: 0 });
		} else {
			dailyBucket.thanks++;
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
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] getActorsToUpdate: Getting actors from stat db`);
		const existingStatActors = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("toolsActor")
			.leftJoinAndSelect("toolsActor.actorGroups", "groups")
			.where("toolsActor.isRegistered = :isRegistered", { isRegistered: 1 })
			.getMany();

		const toolsActorDict: { [index: string]: ActorTypeModel } = {};
		for (const toolsActor of existingStatActors) {
			toolsActorDict[toolsActor.actorId] = toolsActor;
		}

		for (const wikiActor of this.wikiActors) {
			if (!toolsActorDict[wikiActor.id]) {
				if (!wikiActor.user.registrationTimestamp)
					continue;

				this.actorsToUpdate.push({
					mwDbActor: wikiActor,
					toolsDbActor: null
				});
			} else {
				const toolsDbActor = toolsActorDict[wikiActor.id];

				const toolsDbActorGroups = new Set<string>((toolsDbActor.actorGroups || []).map(x => x.groupName));
				const userActorGroups = new Set<string>((wikiActor.user.userGroups || []).map(x => x.groupName));

				if (toolsDbActor.actorName !== wikiActor.user.name
					|| [...userActorGroups.values()].find(x => !toolsDbActorGroups.has(x))
					|| [...toolsDbActorGroups.values()].find(x => !userActorGroups.has(x))) {
					this.actorsToUpdate.push({
						mwDbActor: wikiActor,
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

			await this.saveWikiDailyStatisticsToDatabase(this.statsByWiki, em);
			await this.saveWikiDailyStatisticsByNsToDatabase(this.statsByWiki, em);
			await this.saveWikiEditsByDateNsAndChangeTagToDatabase(this.statsByWiki, em);
			await this.saveWikiLogEntriesByDateNsAndCtToDatabase(this.statsByWiki, em);

			await this.saveWikiProcessedRevisionInfo(em);
		});

	}

	private async updateActor(em: EntityManager, actorToUpdate: ActorToUpdate): Promise<void> {
		const { mwDbActor } = actorToUpdate;

		const actorName = WikiEditCacher.getActorName(mwDbActor);

		const existingActor = await em.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("toolsActor")
			.leftJoinAndSelect("toolsActor.actorGroups", "groups")
			.where("toolsActor.actorId = :actorId", { actorId: mwDbActor.id })
			.getMany();

		if (existingActor.length !== 0) {
			if (existingActor[0].actorName !== actorName) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Updating actor in db for '${actorName}'...`);
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actor)
					.set({ actorName: actorName })
					.where("actorId = :actorId", { actorId: mwDbActor.id })
					.execute();
			}

			const toolsDbUserGroups = (existingActor[0].actorGroups || []).map(x => x.groupName);
			const mwUserGroups = (mwDbActor.user.userGroups || []).map(x => x.groupName);

			for (const groupToAdd of mwUserGroups.filter(groupName => toolsDbUserGroups.indexOf(groupName) === -1)) {
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Adding group '${groupToAdd}' for '${actorName}'...`);

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
				this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Deleting groups for '${actorName}'...`);
				await em.createQueryBuilder()
					.delete()
					.from(this.wikiStatisticsEntities.actorGroup)
					.where("actorId = :actorId", { actorId: mwDbActor.id })
					.andWhere("groupName = :groupName", { groupName: groupToDelete })
					.execute();
			}
		} else {

			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActor: Creating actor for '${actorName}'`);
			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actor)
				.values({
					actorId: mwDbActor.id,
					actorName: WikiEditCacher.getActorName(mwDbActor),
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

	private async saveActorStatisticsToDatabase(em: EntityManager, actorStat: ActorStatisticsUpdateCollection): Promise<void> {
		actorStat.dailyStatistics.sort((a, b) => compareAsc(a.date, b.date));
		for (const nsStat of actorStat.editsByDateAndNs) {
			nsStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
		}
		for (const nsltStat of actorStat.logEntriesByDateNsAndCt) {
			nsltStat.editsByDate.sort((a, b) => compareAsc(a.date, b.date));
		}

		await this.saveActorEntityToDatabase(actorStat, em);
		await this.saveActorDailyStatisticsToDatabase(actorStat, em);
		await this.saveActorDailyStatisticsByNsToDatabase(actorStat, em);
		await this.saveActorEditsByDateNsAndChangeTagToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateNsAndCtToDatabase(actorStat, em);

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: ${actorStat.actorName} successfully finished.`);
	}

	private async saveActorEntityToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const existingActor = await em.getRepository(this.wikiStatisticsEntities.actor)
			.findOne({ where: { actorId: actorStat.actorId } });

		if (existingActor) {
			await this.updateActorInDatabase(actorStat, existingActor, em);
		} else {
			await this.createActorInDatabase(actorStat, em);
		}
	}

	private async createActorInDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const firstEditDate = actorStat.dailyStatistics.length > 0 ? actorStat.dailyStatistics[0].date : undefined;

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] createActorInDatabase: Creating actor for '${actorStat.actorName}'`);
		await em.createQueryBuilder()
			.insert()
			.into(this.wikiStatisticsEntities.actor)
			.values({
				actorId: actorStat.actorId,
				actorName: actorStat.actorName,
				firstEditTimestamp: actorStat.firstEditTimestamp?.toDate() ?? undefined,
				lastEditTimestamp: actorStat.lastEditTimestamp?.toDate() ?? undefined,
				firstLogEntryTimestamp: actorStat.firstLogEntryTimestamp?.toDate() ?? undefined,
				lastLogEntryTimestamp: actorStat.lastLogEntryTimestamp?.toDate() ?? undefined,
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

	private async updateActorInDatabase(actorStat: ActorStatisticsUpdateCollection, existingActor: ActorTypeModel, em: EntityManager): Promise<void> {
		if (existingActor.firstEditTimestamp == null && actorStat.firstEditTimestamp == null
			&& existingActor.lastEditTimestamp == null && actorStat.lastEditTimestamp == null
			&& existingActor.firstLogEntryTimestamp == null && actorStat.firstLogEntryTimestamp == null
			&& existingActor.lastLogEntryTimestamp == null && actorStat.lastLogEntryTimestamp == null)
			return;

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActorInDatabase: Updating first/last edit statistics for '${actorStat.actorName}'`);

		const isRegistrationTimestampFromFirstEdit = existingActor.registrationTimestamp != null
			? existingActor.isRegistrationTimestampFromFirstEdit ?? undefined
			: true;
		const actorRegistrationTimestamp = existingActor.registrationTimestamp != null
			? existingActor.registrationTimestamp
			: actorStat.firstEditTimestamp?.toDate() ?? undefined;

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

		const firstLogEntryTimestamp =
			existingActor.firstLogEntryTimestamp == null && actorStat.firstLogEntryTimestamp == null ? undefined
				: actorStat.firstLogEntryTimestamp == null ? existingActor.firstLogEntryTimestamp
					: existingActor.firstLogEntryTimestamp == null ? actorStat.firstLogEntryTimestamp.toDate()
						: actorStat.firstLogEntryTimestamp.isBefore(moment(existingActor.firstLogEntryTimestamp)) ? actorStat.firstLogEntryTimestamp.toDate() : existingActor.firstLogEntryTimestamp;
		const lastLogEntryTimestamp =
			existingActor.lastLogEntryTimestamp == null && actorStat.lastLogEntryTimestamp == null ? undefined
				: actorStat.lastLogEntryTimestamp == null ? existingActor.lastLogEntryTimestamp
					: existingActor.lastLogEntryTimestamp == null ? actorStat.lastLogEntryTimestamp.toDate()
						: actorStat.lastLogEntryTimestamp.isAfter(moment(existingActor.lastLogEntryTimestamp)) ? actorStat.lastLogEntryTimestamp.toDate() : existingActor.lastLogEntryTimestamp;

		await em
			.createQueryBuilder()
			.update(this.wikiStatisticsEntities.actor)
			.set({
				registrationTimestamp: actorRegistrationTimestamp,
				isRegistrationTimestampFromFirstEdit: isRegistrationTimestampFromFirstEdit,
				firstEditTimestamp: firstEditTimestamp,
				lastEditTimestamp: lastEditTimestamp,
				firstLogEntryTimestamp: firstLogEntryTimestamp,
				lastLogEntryTimestamp: lastLogEntryTimestamp,
			})
			.where("actorId = :actorId", { actorId: actorStat.actorId })
			.execute();

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] updateActorInDatabase: Updating first/last edit statistics for '${actorStat.actorName}' completed`);
	}

	private async saveWikiDailyStatisticsToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating daily statistics by date for wiki (${wikiStat.dailyStatistics.length} items)...`);

		for (const editsByDate of wikiStat.dailyStatistics) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.dailyStatistics)
				.findOne({ where: { date: editsByDate.date } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.dailyStatistics)
					.set({
						dailyEdits: existingStat.dailyEdits + editsByDate.edits,
						dailyRevertedEdits: existingStat.dailyRevertedEdits + editsByDate.revertedEdits,
						dailyCharacterChanges: existingStat.dailyCharacterChanges + editsByDate.characterChanges,
						dailyThanks: existingStat.dailyThanks + editsByDate.thanks,
						dailyLogEvents: existingStat.dailyLogEvents + editsByDate.logEvents,
					})
					.where("date = :date", { date: editsByDate.date })
					.execute();

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.dailyStatistics)
					.set({
						dailyEdits: () => `daily_edits + ${editsByDate.edits}`,
						editsToDate: () => `edits_to_date + ${editsByDate.edits}`,
						dailyRevertedEdits: () => `daily_reverted_edits + ${editsByDate.revertedEdits}`,
						revertedEditsToDate: () => `reverted_edits_to_date + ${editsByDate.revertedEdits}`,
						dailyCharacterChanges: () => `daily_character_changes + ${editsByDate.characterChanges}`,
						characterChangesToDate: () => `character_changes_to_date + ${editsByDate.characterChanges}`,
						dailyThanks: () => `daily_thanks + ${editsByDate.thanks}`,
						thanksToDate: () => `thanks_to_date + ${editsByDate.thanks}`,
						dailyLogEvents: () => `daily_log_events + ${editsByDate.logEvents}`,
						logEventsToDate: () => `log_events_to_date + ${editsByDate.logEvents}`,
					})
					.where("date > :date", { date: editsByDate.date })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.dailyStatistics)
					.findOne({
						where: {
							date: LessThan(editsByDate.date)
						},
						order: {
							date: "DESC"
						}
					});

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.dailyStatistics)
					.values({
						date: editsByDate.date,
						dailyEdits: editsByDate.edits,
						editsToDate: previousDay
							? previousDay.editsToDate + previousDay.dailyEdits
							: 0,
						dailyRevertedEdits: editsByDate.revertedEdits,
						revertedEditsToDate: previousDay
							? previousDay.revertedEditsToDate + previousDay.dailyRevertedEdits
							: 0,
						dailyCharacterChanges: editsByDate.characterChanges,
						characterChangesToDate: previousDay
							? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
							: 0,
						dailyThanks: editsByDate.thanks,
						thanksToDate: previousDay
							? previousDay.thanksToDate + previousDay.dailyThanks
							: 0,
						dailyLogEvents: editsByDate.logEvents,
						logEventsToDate: previousDay
							? previousDay.logEventsToDate + previousDay.dailyLogEvents
							: 0,
					})
					.execute();
			}
		}
	}

	private async saveActorDailyStatisticsToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating daily statistics by date for ${actorStat.actorName} (${actorStat.dailyStatistics.length} items)...`);

		for (const editsByDate of actorStat.dailyStatistics) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatistics)
				.findOne({ where: { actorId: actorStat.actorId, date: editsByDate.date } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorDailyStatistics)
					.set({
						dailyEdits: existingStat.dailyEdits + editsByDate.edits,
						dailyRevertedEdits: existingStat.dailyRevertedEdits + editsByDate.revertedEdits,
						dailyCharacterChanges: existingStat.dailyCharacterChanges + editsByDate.characterChanges,
						dailyThanks: existingStat.dailyThanks + editsByDate.thanks,
						dailyLogEvents: existingStat.dailyLogEvents + editsByDate.logEvents,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date = :date", { date: editsByDate.date })
					.execute();

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorDailyStatistics)
					.set({
						dailyEdits: () => `daily_edits + ${editsByDate.edits}`,
						editsToDate: () => `edits_to_date + ${editsByDate.edits}`,
						dailyRevertedEdits: () => `daily_reverted_edits + ${editsByDate.revertedEdits}`,
						revertedEditsToDate: () => `reverted_edits_to_date + ${editsByDate.revertedEdits}`,
						dailyCharacterChanges: () => `daily_character_changes + ${editsByDate.characterChanges}`,
						characterChangesToDate: () => `character_changes_to_date + ${editsByDate.characterChanges}`,
						dailyThanks: () => `daily_thanks + ${editsByDate.thanks}`,
						thanksToDate: () => `thanks_to_date + ${editsByDate.thanks}`,
						dailyLogEvents: () => `daily_log_events + ${editsByDate.logEvents}`,
						logEventsToDate: () => `log_events_to_date + ${editsByDate.logEvents}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editsByDate.date })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatistics)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							date: LessThan(editsByDate.date)
						},
						order: {
							date: "DESC"
						}
					});

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.actorDailyStatistics)
					.values({
						actorId: actorStat.actorId,
						date: editsByDate.date,
						dailyEdits: editsByDate.edits,
						editsToDate: previousDay
							? previousDay.editsToDate + previousDay.dailyEdits
							: 0,
						dailyRevertedEdits: editsByDate.revertedEdits,
						revertedEditsToDate: previousDay
							? previousDay.revertedEditsToDate + previousDay.dailyRevertedEdits
							: 0,
						dailyCharacterChanges: editsByDate.characterChanges,
						characterChangesToDate: previousDay
							? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
							: 0,
						dailyThanks: editsByDate.thanks,
						thanksToDate: previousDay
							? previousDay.thanksToDate + previousDay.dailyThanks
							: 0,
						dailyLogEvents: editsByDate.logEvents,
						logEventsToDate: previousDay
							? previousDay.logEventsToDate + previousDay.dailyLogEvents
							: 0,
					})
					.execute();
			}

		}
	}

	private async saveWikiDailyStatisticsByNsToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.editsByDateAndNs, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.editsByDateAndNs) {
			for (const editByDateAndNs of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
					.findOne({ where: { namespace: editsByNs.namespace, date: editByDateAndNs.date } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateAndNs.edits,
							dailyRevertedEdits: existingStat.dailyRevertedEdits + editByDateAndNs.revertedEdits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateAndNs.characterChanges,
						})
						.where("date = :date", { date: editByDateAndNs.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateAndNs.edits}`,
							editsToDate: () => `edits_to_date + ${editByDateAndNs.edits}`,
							dailyRevertedEdits: () => `daily_reverted_edits + ${editByDateAndNs.revertedEdits}`,
							revertedEditsToDate: () => `reverted_edits_to_date + ${editByDateAndNs.revertedEdits}`,
							dailyCharacterChanges: () => `daily_character_changes + ${editByDateAndNs.characterChanges}`,
							characterChangesToDate: () => `character_changes_to_date + ${editByDateAndNs.characterChanges}`,
							dailyLogEvents: () => `daily_log_events + ${editByDateAndNs.logEvents}`,
							logEventsToDate: () => `log_events_to_date + ${editByDateAndNs.logEvents}`,
						})
						.where("date > :date", { date: editByDateAndNs.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.findOne({
							where: {
								namespace: editsByNs.namespace,
								date: LessThan(editByDateAndNs.date)
							},
							order: {
								date: "DESC"
							}
						});

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.values({
							date: editByDateAndNs.date,
							namespace: editsByNs.namespace,
							dailyEdits: editByDateAndNs.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyRevertedEdits: editByDateAndNs.edits,
							revertedEditsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyCharacterChanges: editByDateAndNs.characterChanges,
							characterChangesToDate: previousDay
								? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
								: 0,
							dailyLogEvents: editByDateAndNs.logEvents,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0,
						})
						.execute();
				}
			}
		}
	}

	private async saveActorDailyStatisticsByNsToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByDateAndNs, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.editsByDateAndNs) {
			for (const editByDateAndNs of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
					.findOne({ where: { actorId: actorStat.actorId, namespace: editsByNs.namespace, date: editByDateAndNs.date } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateAndNs.edits,
							dailyRevertedEdits: existingStat.dailyRevertedEdits + editByDateAndNs.revertedEdits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateAndNs.characterChanges,
							dailyLogEvents: existingStat.dailyLogEvents + editByDateAndNs.logEvents,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateAndNs.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateAndNs.edits}`,
							editsToDate: () => `edits_to_date + ${editByDateAndNs.edits}`,
							dailyRevertedEdits: () => `daily_reverted_edits + ${editByDateAndNs.revertedEdits}`,
							revertedEditsToDate: () => `reverted_edits_to_date + ${editByDateAndNs.revertedEdits}`,
							dailyCharacterChanges: () => `daily_character_changes + ${editByDateAndNs.characterChanges}`,
							characterChangesToDate: () => `character_changes_to_date + ${editByDateAndNs.characterChanges}`,
							dailyLogEvents: () => `daily_log_events + ${editByDateAndNs.logEvents}`,
							logEventsToDate: () => `log_events_to_date + ${editByDateAndNs.logEvents}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date > :date", { date: editByDateAndNs.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
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
						.into(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.values({
							actorId: actorStat.actorId,
							date: editByDateAndNs.date,
							namespace: editsByNs.namespace,
							dailyEdits: editByDateAndNs.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyRevertedEdits: editByDateAndNs.edits,
							revertedEditsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyCharacterChanges: editByDateAndNs.characterChanges,
							characterChangesToDate: previousDay
								? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
								: 0,
							dailyLogEvents: editByDateAndNs.logEvents,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0,
						})
						.execute();
				}
			}
		}
	}

	private async saveWikiEditsByDateNsAndChangeTagToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.editsByDateNsAndChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace & change tag for wiki (${nsItemCount} items)...`);

		for (const editsByCt of wikiStat.editsByDateNsAndChangeTag) {
			for (const editByDateNsAndCt of editsByCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
					.findOne({
						where: {
							changeTagId: editsByCt.changeTagId,
							namespace: editsByCt.namespace,
							date: editByDateNsAndCt.date
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateNsAndCt.edits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateNsAndCt.characterChanges,
						})
						.where("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date })
						.andWhere("namespace = :namespace", { namespace: editsByCt.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateNsAndCt.edits}`,
							editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
							dailyCharacterChanges: () => `daily_character_changes + ${editByDateNsAndCt.characterChanges}`,
							characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
						})
						.where("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("date > :date", { date: editByDateNsAndCt.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.findOne({
							where: {
								changeTagId: editsByCt.changeTagId,
								namespace: editsByCt.namespace,
								date: LessThan(editByDateNsAndCt.date)
							},
							order: {
								date: "DESC"
							}
						});

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.values({
							changeTagId: editsByCt.changeTagId,
							date: editByDateNsAndCt.date,
							namespace: editsByCt.namespace,
							dailyEdits: editByDateNsAndCt.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyCharacterChanges: editByDateNsAndCt.characterChanges,
							characterChangesToDate: previousDay
								? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
								: 0,
						})
						.execute();
				}
			}
		}
	}

	private async saveActorEditsByDateNsAndChangeTagToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByDateNsAndChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace & change tag for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByCt of actorStat.editsByDateNsAndChangeTag) {
			for (const editByDateNsAndCt of editsByCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							changeTagId: editsByCt.changeTagId,
							namespace: editsByCt.namespace,
							date: editByDateNsAndCt.date
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateNsAndCt.edits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateNsAndCt.characterChanges,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date })
						.andWhere("namespace = :namespace", { namespace: editsByCt.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.set({
							dailyEdits: () => `daily_edits + ${editByDateNsAndCt.edits}`,
							editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
							dailyCharacterChanges: () => `daily_character_changes + ${editByDateNsAndCt.characterChanges}`,
							characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("date > :date", { date: editByDateNsAndCt.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.findOne({
							where: {
								actorId: actorStat.actorId,
								changeTagId: editsByCt.changeTagId,
								namespace: editsByCt.namespace,
								date: LessThan(editByDateNsAndCt.date)
							},
							order: {
								date: "DESC"
							}
						});

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.values({
							actorId: actorStat.actorId,
							changeTagId: editsByCt.changeTagId,
							date: editByDateNsAndCt.date,
							namespace: editsByCt.namespace,
							dailyEdits: editByDateNsAndCt.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyCharacterChanges: editByDateNsAndCt.characterChanges,
							characterChangesToDate: previousDay
								? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
								: 0,
						})
						.execute();
				}
			}
		}
	}

	private async saveWikiLogEntriesByDateNsAndCtToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.logEntriesByDateNsAndCt, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date, log type and namespace for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.logEntriesByDateNsAndCt) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByNamespaceAndLogType)
					.findOne({
						where: {
							namespace: editsByNs.namespace,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							date: editByDateNsAndCt.date
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.logStatisticsByNamespaceAndLogType)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.logEntries })
						.where("date = :date", { date: editByDateNsAndCt.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.logStatisticsByNamespaceAndLogType)
						.set({
							dailyLogEvents: () => `daily_log_events + ${editByDateNsAndCt.logEntries}`,
							logEventsToDate: () => `log_events_to_date + ${editByDateNsAndCt.logEntries}`,
						})
						.where("date > :date", { date: editByDateNsAndCt.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByNamespaceAndLogType)
						.findOne({
							where: {
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
						.into(this.wikiStatisticsEntities.logStatisticsByNamespaceAndLogType)
						.values({
							date: editByDateNsAndCt.date,
							namespace: editsByNs.namespace,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							dailyLogEvents: editByDateNsAndCt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}
			}
		}
	}

	private async saveActorLogEntriesByDateNsAndCtToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.logEntriesByDateNsAndCt, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date, log type and namespace for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.logEntriesByDateNsAndCt) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndLogType)
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
						.update(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndLogType)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.logEntries })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();

					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndLogType)
						.set({
							dailyLogEvents: () => `daily_log_events + ${editByDateNsAndCt.logEntries}`,
							logEventsToDate: () => `log_events_to_date + ${editByDateNsAndCt.logEntries}`,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date > :date", { date: editByDateNsAndCt.date })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndLogType)
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
						.into(this.wikiStatisticsEntities.actorLogStatisticsByNamespaceAndLogType)
						.values({
							actorId: actorStat.actorId,
							date: editByDateNsAndCt.date,
							namespace: editsByNs.namespace,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							dailyLogEvents: editByDateNsAndCt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
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

	private static getActorName(actor: Actor): string {
		if (actor.user && typeof actor.user.name === "string" && actor.user.name.length > 0)
			return actor.user.name;

		if (typeof actor.name === "string" && actor.name.length > 0)
			return actor.name;

		return `Unknown (${actor.id.toString()})`;
	}

	private static createNewStatsByWikiInstance(): WikiStatisticsUpdateCollection {
		return {
			dailyStatistics: [],
			editsByDateAndNs: [],
			editsByDateNsAndChangeTag: [],
			logEntriesByDateNsAndCt: [],
		};
	}

	private static createNewStatsByActorInstance(actor: Actor): ActorStatisticsUpdateCollection {
		return {
			actor: actor,
			actorId: actor.id,
			actorName: WikiEditCacher.getActorName(actor),
			firstEditTimestamp: null,
			lastEditTimestamp: null,
			firstLogEntryTimestamp: null,
			lastLogEntryTimestamp: null,
			dailyStatistics: [],
			editsByDateAndNs: [],
			editsByDateNsAndChangeTag: [],
			logEntriesByDateNsAndCt: [],
		};
	}
}
