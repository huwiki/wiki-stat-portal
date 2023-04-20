import * as _ from "lodash";
import moment from "moment";
import { format } from "react-string-format";
import { Connection, EntityManager, getManager } from "typeorm";
import { Logger } from "winston";
import { FLAGLESS_BOT_VIRTUAL_GROUP_NAME } from "../../common/consts";
import { AppRunningContext } from "../../server/appRunningContext";
import { ApplicationConfiguration } from "../../server/configuration/applicationConfiguration";
import { createConnectionToMediaWikiReplica } from "../../server/database/connectionManager";
import { UserGroup } from "../../server/database/entities/mediawiki";
import { Actor } from "../../server/database/entities/mediawiki/actor";
import { ChangeTag } from "../../server/database/entities/mediawiki/changeTag";
import { ChangeTagDefinition } from "../../server/database/entities/mediawiki/changeTagDefinition";
import { LogEntry } from "../../server/database/entities/mediawiki/logEntry";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { ActorTypeModel, createActorEntitiesForWiki, WikiStatisticsTypesResult } from "../../server/database/entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { compareMoments } from "../../server/helpers/comparers";
import { getLocalizedString, hasLanguage } from "../../server/helpers/i18nServer";
import { WikiBot } from "../../server/helpers/wikiBot";
import { KnownWiki } from "../../server/interfaces/knownWiki";
//const BASE_TIMESTAMP: string = "20211113000000";

interface WikiEditCacherOptions {
	appCtx: AppRunningContext;
	wiki: KnownWiki;
	toolsConnection: Connection;
}

interface DailyStatistics {
	date: moment.Moment;
	edits: number;
	revertedEdits: number;
	characterChanges: number;
	receivedThanks: number;
	sentThanks: number;
	logEvents: number;
	serviceAwardLogEvents: number;
}

interface LogStatisticsOnDate {
	date: moment.Moment;
	logEntries: number;
}

interface EditsByDateAndNamespace {
	namespace: number;
	editsByDate: DailyStatistics[];
}

interface EditsByDateAndChangeTag {
	changeTagId: number;
	editsByDate: DailyStatistics[];
}

interface EditsByDateNamespaceAndChangeTag {
	namespace: number;
	changeTagId: number;
	editsByDate: DailyStatistics[];
}

interface LogEntriesByDateAndType {
	logType: string;
	editsByDate: LogStatisticsOnDate[];
}

interface LogEntriesByDateAndAction {
	logAction: string;
	editsByDate: LogStatisticsOnDate[];
}

interface LogEntriesByDateTypeAndLogAction {
	logType: string;
	logAction: string;
	editsByDate: LogStatisticsOnDate[];
}

interface WikiStatisticsUpdateCollection {
	dailyStatistics: DailyStatistics[];
	editsByNamespace: EditsByDateAndNamespace[];
	editsByChangeTag: EditsByDateAndChangeTag[];
	editsByNamespaceAndChangeTag: EditsByDateNamespaceAndChangeTag[];
	logEntriesByType: LogEntriesByDateAndType[];
	logEntriesByAction: LogEntriesByDateAndAction[];
	logEntriesByTypeAndAction: LogEntriesByDateTypeAndLogAction[];
}

interface ActorEntityUpdateData {
	mwDbActor: Actor;
	toolsDbActor: ActorTypeModel | null;
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

interface UserPageTemplateLinkResult {
	referrerPageName: string;
	templatePageId: number;
	templatePageName: string;
}

interface RevertChangeTagParams {
	isNew: boolean;
	orginalRevisionId: number | false;
	newestRevertedRevId: number;
	oldestRevertedRevId: number;
	isExactRevert: boolean;
	isNullEdit: boolean;
	revertTags: string;
	version: string;
}

export interface ActorWithServiceAwardStatistics {
	actorId: number;
	actorName: string;
	edits: number;
	logEvents: number;
	activeDays: number;
}

export class WikiEditCacher {
	private readonly appConfig: ApplicationConfiguration;
	private readonly wiki: KnownWiki;
	private readonly toolsConnection: Connection;
	private readonly logger: Logger;
	private readonly wikiStatisticsEntities: WikiStatisticsTypesResult;

	private lastProcessedRevisionId: number;
	private lastProcessedRevisionTimestamp: moment.Moment | null;
	private totalProcessedRevisions: number = 0;

	private lastProcessedLogId: number;
	private lastProcessedLogTimestamp: moment.Moment | null;
	private totalProcessedLogEntries: number = 0;

	private replicatedDatabaseConnection: Connection;
	private statsByActorList: ActorStatisticsUpdateCollection[] = [];
	private statsByActorDict: Map<number, ActorStatisticsUpdateCollection> = new Map();
	private statsByWiki: WikiStatisticsUpdateCollection = WikiEditCacher.createNewStatsByWikiInstance();
	private updatedActorCount: number = 0;

	private wikiActors: Actor[] = [];
	private wikiActorsById: Map<number, Actor> = new Map<number, Actor>();
	private wikiActorsByName: Map<string, Actor> = new Map<string, Actor>();
	private wikiMainUserPageTemplateLinks: Map<number, Set<number>> = new Map();
	private wikiChangeTagDefinitions: Map<number, string> = new Map();
	private wikiTemplates: Map<number, string> = new Map();
	private wikiRevertChangeTagIds: Set<number> = new Set();

	private cachedActors: ActorTypeModel[] = [];
	private cachedActorsById: Map<number, ActorTypeModel> = new Map<number, ActorTypeModel>();
	private cachedTemplates: Map<number, string> = new Map();
	private cachedChangeTagDefinitions: Map<number, string> = new Map();
	private cachedUserPageTemplateLinks: Map<number, Set<number>> = new Map();

	private localizationLanguage: string;

	constructor(options: WikiEditCacherOptions) {
		this.appConfig = options.appCtx.appConfig;
		this.logger = options.appCtx.logger;
		this.wiki = options.wiki;
		this.toolsConnection = options.toolsConnection;

		this.wikiStatisticsEntities = createActorEntitiesForWiki(this.wiki.id);
		this.localizationLanguage = hasLanguage(this.wiki.languageCode)
			? this.wiki.languageCode
			: "en";
	}

	public async run(): Promise<void> {
		this.replicatedDatabaseConnection = await createConnectionToMediaWikiReplica(this.appConfig, this.wiki.id, this.wiki.replicaDatabaseName);

		await this.getReplicaDatabaseContent();
		await this.getCacheDatabaseContent();

		await this.compareReplicaAndCacheActors();

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

		this.replicatedDatabaseConnection.close();

		await this.saveCachedDataToToolsDb();
		await this.saveServiceAwardStatisticsModuleDataToWiki();

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Finished processing ${this.totalProcessedRevisions} revisions for ${this.wiki.id}.`);
	}

	private async getCacheDatabaseContent() {
		await this.getLastProcessInfo();
		await this.getCachedTemplates();
		await this.getCachedChangeTagDefinitions();
		await this.getCachedUserPagesTemplateLinks();
	}

	private async getLastProcessInfo(): Promise<void> {
		this.logger.info(`[getLastProcessInfo/${this.wiki.id}] Getting last process info from cache db`);

		const wikiProcessEntry = await this.toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: this.wiki.id } });

		this.logger.info(`[getLastProcessInfo/${this.wiki.id}] Last process info fetched from cache db`);

		this.lastProcessedRevisionId = wikiProcessEntry?.lastProcessedRevisionId ?? 0;
		this.lastProcessedRevisionTimestamp = wikiProcessEntry && wikiProcessEntry.lastProcessedRevisionTimestamp
			? moment.utc(wikiProcessEntry.lastProcessedRevisionTimestamp)
			: null;

		this.lastProcessedLogId = wikiProcessEntry?.lastProcessedLogId ?? 0;
		this.lastProcessedLogTimestamp = wikiProcessEntry && wikiProcessEntry.lastProcessedLogTimestamp
			? moment.utc(wikiProcessEntry.lastProcessedLogTimestamp)
			: null;
	}

	private async getCachedTemplates(): Promise<void> {
		this.logger.info(`[getCachedTemplates/${this.wiki.id}] Getting templates from cache db`);
		const rawCachedTemplates = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.template)
			.createQueryBuilder("template")
			.getMany();

		this.logger.info(`[getCachedTemplates/${this.wiki.id}] ${rawCachedTemplates.length} templates fetched from cache db`);

		for (const rct of rawCachedTemplates) {
			this.cachedTemplates.set(rct.templatePageId, rct.templateName);
		}
	}

	private async getCachedChangeTagDefinitions(): Promise<void> {
		this.logger.info(`[getCachedChangeTagDefinitions/${this.wiki.id}] Getting change tag definitions from cache db`);

		const rawChangeTagDefinitions = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.changeTagDefinition)
			.createQueryBuilder("ctd")
			.getMany();

		this.logger.info(`[getCachedChangeTagDefinitions/${this.wiki.id}] ${rawChangeTagDefinitions.length} ctds fetched from cache db`);

		for (const rcctd of rawChangeTagDefinitions) {
			this.cachedChangeTagDefinitions.set(rcctd.changeTagDefinitionId, rcctd.changeTagDefinitionName);
		}
	}

	private async getCachedUserPagesTemplateLinks(): Promise<void> {
		this.logger.info(`[getCachedUserPagesTemplateLinks/${this.wiki.id}] Getting talk template links from replica db`);

		const rawCachedUserPageTemplateLinks = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.actorUserPageTemplate)
			.createQueryBuilder("talkLink")
			.getMany();

		this.logger.info(`[getCachedUserPagesTemplateLinks/${this.wiki.id}] ${rawCachedUserPageTemplateLinks.length} talk template links fetched from cache db`);

		for (const rcttl of rawCachedUserPageTemplateLinks) {
			if (this.cachedUserPageTemplateLinks.has(rcttl.actorId)) {
				this.cachedUserPageTemplateLinks.get(rcttl.actorId)?.add(rcttl.templatePageId);
			} else {
				this.cachedUserPageTemplateLinks.set(rcttl.actorId, new Set<number>([rcttl.templatePageId]));
			}
		}
	}

	private async getReplicaDatabaseContent() {
		const replicatedDbEntityManager = getManager(this.replicatedDatabaseConnection.name);
		await this.getWikiChangeTagDefinitions();
		await this.getAllWikiActors();
		await this.getWikiMainUserPagesTemplateLinks(replicatedDbEntityManager);
	}

	private async getWikiChangeTagDefinitions(): Promise<void> {
		this.logger.info(`[getWikiChangeTagDefinitions/${this.wiki.id}] Getting change tag definitions from replica db`);
		const ctds = await this.replicatedDatabaseConnection.getRepository(ChangeTagDefinition)
			.createQueryBuilder("ctd")
			.getMany();

		this.logger.info(`[getWikiChangeTagDefinitions/${this.wiki.id}] ${ctds.length} cts fetched from replica db`);

		for (const ctd of ctds) {
			this.wikiChangeTagDefinitions.set(ctd.id, ctd.name);

			if (ctd.name === "mw-undo"
				|| ctd.name === "mw-rollback"
				|| ctd.name === "mw-manual-revert"
			) {
				this.wikiRevertChangeTagIds.add(ctd.id);
			}
		}
	}

	private async getWikiMainUserPagesTemplateLinks(em: EntityManager): Promise<void> {
		this.logger.info(`[getWikiMainUserPagesTemplateLinks/${this.wiki.id}] Getting user/user talk template links from replica db`);
		const userPageTemplateLinks = await em.query(`
			SELECT DISTINCT
				CONVERT(referrer.page_title USING utf8) as referrerPageName,
				templatePage.page_id as templatePageId,
				CONVERT(templatePage.page_title USING UTF8) as templatePageName
			FROM templatelinks tl
			LEFT JOIN page AS referrer ON tl.tl_from = referrer.page_id AND tl.tl_from_namespace = referrer.page_namespace
			LEFT JOIN linktarget as usedTemplate ON tl.tl_target_id = usedTemplate.lt_id
			LEFT JOIN page AS templatePage ON templatePage.page_title = usedTemplate.lt_title AND templatePage.page_namespace = usedTemplate.lt_namespace
			WHERE (tl_from_namespace = 2 OR tl_from_namespace = 3)
				AND usedTemplate.lt_namespace = 10
				AND referrer.page_title NOT LIKE "%/%"
				AND templatePage.page_title LIKE "%-meta"
				AND templatePage.page_id IS NOT NULL;
		`) as UserPageTemplateLinkResult[];

		this.logger.info(`[getWikiMainUserPagesTemplateLinks/${this.wiki.id}] ${userPageTemplateLinks.length} template links fetched from replica db`);

		for (const ttl of userPageTemplateLinks) {
			this.wikiTemplates.set(ttl.templatePageId, ttl.templatePageName);

			const referencedActor = this.wikiActorsByName.get(ttl.referrerPageName.replace(/_/g, " ")) ?? null;
			if (referencedActor === null) {
				continue;
			}

			if (this.wikiMainUserPageTemplateLinks.has(referencedActor.id)) {
				this.wikiMainUserPageTemplateLinks.get(referencedActor.id)?.add(ttl.templatePageId);
			} else {
				this.wikiMainUserPageTemplateLinks.set(referencedActor.id, new Set<number>([ttl.templatePageId]));
			}
		}
	}

	private async getAllWikiActors(): Promise<void> {
		this.logger.info(`[getAllWikiActors/${this.wiki.id}] updateActors: Getting actors from replica db`);
		this.wikiActors = await this.replicatedDatabaseConnection.getRepository(Actor)
			.createQueryBuilder("actor")
			.leftJoinAndSelect("actor.user", "user")
			.leftJoinAndSelect("user.userGroups", "groups")
			.getMany();
		this.injectFlaglessBotInfo(this.wikiActors);

		this.logger.info(`[getAllWikiActors/${this.wiki.id}] updateActors: ${this.wikiActors.length} actors fetched from replica db`);

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
			//.andWhere("rev.rev_timestamp > :baseTimestamp", { baseTimestamp: BASE_TIMESTAMP })
			.orderBy("rev.id", "ASC")
			.limit(this.appConfig.dataCacher.revisionsProcessedAtOnce)
			.getMany();

		if (!revisions || revisions.length == 0) {
			this.logger.info(`[tryProcessNextRevisionBatch/${this.wiki.id}] No new revisions to process.`);
			return false;
		}

		this.totalProcessedRevisions += revisions.length;
		this.lastProcessedRevisionId = revisions[revisions.length - 1].id;
		await this.processRevisionList(revisions);

		return true;
	}

	private async processRevisionList(revisions: Revision[]): Promise<void> {
		this.logger.info(`[processRevisionList/${this.wiki.id}] Starting processing ${revisions.length} revisions.`);

		for (const revision of revisions) {
			await this.processSingleRevision(revision);
		}
	}

	private async processSingleRevision(revision: Revision): Promise<void> {
		if (revision.actor == null) {
			this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revision.id} does not have a valid actor reference.`);
			return;
		}

		if (revision.page == null) {
			this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revision.id} does not have a valid page reference.`);
			return;
		}

		const actor = revision.actor;

		const currentEditTimestamp = moment.utc(revision.timestamp);
		const currentEditDate = moment.utc(revision.timestamp).startOf("day");

		const characterChanges = revision.length - (revision.parentRevision?.length ?? 0);

		let statsByActor = this.statsByActorDict.get(actor.id);
		if (!statsByActor) {
			statsByActor = WikiEditCacher.createNewStatsByActorInstance(actor);
			this.statsByActorList.push(statsByActor);
			this.statsByActorDict.set(actor.id, statsByActor);
			this.updatedActorCount++;
		}

		if (statsByActor.firstEditTimestamp == null
			|| statsByActor.firstEditTimestamp.isAfter(currentEditTimestamp))
			statsByActor.firstEditTimestamp = currentEditTimestamp;

		if (statsByActor.lastEditTimestamp == null
			|| statsByActor.lastEditTimestamp.isBefore(currentEditTimestamp))
			statsByActor.lastEditTimestamp = currentEditTimestamp;

		this.collectDailyStatisticsFromRevision(statsByActor, currentEditDate, characterChanges, revision);
		this.collectDailyStatisticsFromRevision(this.statsByWiki, currentEditDate, characterChanges, revision);

		const revertChangeTag = revision.changeTags.find(x => this.wikiRevertChangeTagIds.has(x.tagDefitionId));
		if (revertChangeTag) {
			await this.processRevertChangeTag(revision, revertChangeTag, currentEditDate);
		}

		if (this.lastProcessedRevisionTimestamp == null
			|| this.lastProcessedRevisionTimestamp.isBefore(currentEditTimestamp)
		) {
			this.lastProcessedRevisionTimestamp = currentEditTimestamp;
		}
	}

	private collectDailyStatisticsFromRevision(statsByActor: WikiStatisticsUpdateCollection, editDate: moment.Moment, characterChanges: number, revision: Revision) {
		const dailyBucket = statsByActor.dailyStatistics.find(x => x.date.isSame(editDate));
		if (!dailyBucket) {
			statsByActor.dailyStatistics.push(createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges }));
		} else {
			dailyBucket.edits++;
			dailyBucket.characterChanges += characterChanges;
		}

		const namespaceBucket = statsByActor.editsByNamespace.find(x => x.namespace === revision.page.namespace);
		if (!namespaceBucket) {
			statsByActor.editsByNamespace.push({
				namespace: revision.page.namespace,
				editsByDate: [createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges })]
			});
		} else {
			const dailyNamespaceBucket = namespaceBucket.editsByDate.find(x => x.date.isSame(editDate));
			if (!dailyNamespaceBucket) {
				namespaceBucket.editsByDate.push(createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges }));
			} else {
				dailyNamespaceBucket.edits++;
				dailyNamespaceBucket.characterChanges += characterChanges;
			}
		}

		for (const ct of (revision.changeTags || [])) {
			{
				const changeTagBucket = statsByActor.editsByChangeTag.find(x => x.changeTagId === ct.tagDefitionId);
				if (!changeTagBucket) {
					statsByActor.editsByNamespaceAndChangeTag.push({
						namespace: revision.page.namespace,
						changeTagId: ct.tagDefitionId,
						editsByDate: [createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges })]
					});
				} else {
					const dailyChangeTagBucket = changeTagBucket.editsByDate.find(x => x.date.isSame(editDate));
					if (!dailyChangeTagBucket) {
						changeTagBucket.editsByDate.push(createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges }));
					} else {
						dailyChangeTagBucket.edits++;
						dailyChangeTagBucket.characterChanges += characterChanges;
					}
				}
			}

			{
				const changeTagAndNamespaceBucket = statsByActor.editsByNamespaceAndChangeTag.find(x => x.namespace === revision.page.namespace
					&& x.changeTagId === ct.tagDefitionId);
				if (!changeTagAndNamespaceBucket) {
					statsByActor.editsByNamespaceAndChangeTag.push({
						namespace: revision.page.namespace,
						changeTagId: ct.tagDefitionId,
						editsByDate: [createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges })]
					});
				} else {
					const dailyChangeTagBucket = changeTagAndNamespaceBucket.editsByDate.find(x => x.date.isSame(editDate));
					if (!dailyChangeTagBucket) {
						changeTagAndNamespaceBucket.editsByDate.push(createDailyStatistics(editDate, { edits: 1, characterChanges: characterChanges }));
					} else {
						dailyChangeTagBucket.edits++;
						dailyChangeTagBucket.characterChanges += characterChanges;
					}
				}
			}
		}
	}

	private async processRevertChangeTag(
		revertRevision: Revision,
		revertChangeTag: ChangeTag,
		revertDate: moment.Moment
	): Promise<void> {
		if (!revertChangeTag.params)
			return;

		let params: RevertChangeTagParams;
		try {
			params = JSON.parse(revertChangeTag.params);
		}
		catch {
			return;
		}

		if (!params.isExactRevert
			|| typeof params.oldestRevertedRevId !== "number"
			|| typeof params.newestRevertedRevId !== "number") {
			this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revertRevision.id} is a revert edit, but not an exact revert: ${revertChangeTag.params}.`);
			return;
		}

		this.logger.info(`[processRevisionList/${this.wiki.id}] Revision ${revertRevision.id} is a revert edit; pageId: ${revertRevision.pageId}; params: ${revertChangeTag.params}.`);

		const referencedRevisions = await this.replicatedDatabaseConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("act.user", "usr")
			.where("rev.pageId = :pageId", { pageId: revertRevision.pageId })
			.andWhere("rev.id >= :oldestRevertedRevId", { oldestRevertedRevId: params.oldestRevertedRevId })
			.andWhere("rev.id <= :newestRevertedRevId", { newestRevertedRevId: params.newestRevertedRevId })
			.orderBy("rev.id", "ASC")
			.getMany();

		for (const referencedRevision of referencedRevisions) {
			if (referencedRevision.actor == null) {
				this.logger.info(`[processRevisionList/${this.wiki.id}] Reverted revision ${referencedRevision.id} does not have a valid actor reference.`);
				return;
			}

			let statsByActor = this.statsByActorDict.get(referencedRevision.actor.id);
			if (!statsByActor) {
				statsByActor = WikiEditCacher.createNewStatsByActorInstance(referencedRevision.actor);
				this.statsByActorList.push(statsByActor);
				this.statsByActorDict.set(referencedRevision.actor.id, statsByActor);
				this.updatedActorCount++;
			}

			this.collectRevertStatisticsFromRevision(statsByActor, revertDate, revertRevision);
			this.collectRevertStatisticsFromRevision(this.statsByWiki, revertDate, revertRevision);
		}
	}

	private collectRevertStatisticsFromRevision(statsByActor: WikiStatisticsUpdateCollection, revertDate: moment.Moment, revision: Revision) {
		const dailyBucket = statsByActor.dailyStatistics.find(x => x.date.isSame(revertDate));
		if (!dailyBucket) {
			statsByActor.dailyStatistics.push(createDailyStatistics(revertDate, { revertedEdits: 1 }));
		} else {
			dailyBucket.revertedEdits++;
		}

		const namespaceBucket = statsByActor.editsByNamespace.find(x => x.namespace === revision.page.namespace);
		if (!namespaceBucket) {
			statsByActor.editsByNamespace.push({
				namespace: revision.page.namespace,
				editsByDate: [createDailyStatistics(revertDate, { revertedEdits: 1 })]
			});
		} else {
			const dailyNamespaceBucket = namespaceBucket.editsByDate.find(x => x.date.isSame(revertDate));
			if (!dailyNamespaceBucket) {
				namespaceBucket.editsByDate.push(createDailyStatistics(revertDate, { revertedEdits: 1 }));
			} else {
				dailyNamespaceBucket.revertedEdits++;
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
			//.andWhere("log.log_timestamp > :baseTimestamp", { baseTimestamp: BASE_TIMESTAMP })
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

			const logEntryDate = moment.utc(logEntry.timestamp).startOf("day");

			if (logEntry.type === "thanks" && logEntry.action == "thank") {
				this.processThanksLogEntry(actor, logEntry, logEntryDate);
			} else {
				this.processStandardLogEntry(actor, logEntry, logEntryDate);
			}
		}
	}

	private processStandardLogEntry(actor: Actor, logEntry: LogEntry, logEntryDate: moment.Moment) {
		let statsByActor = this.statsByActorDict.get(actor.id);
		if (!statsByActor) {
			statsByActor = WikiEditCacher.createNewStatsByActorInstance(actor);
			this.statsByActorList.push(statsByActor);
			this.statsByActorDict.set(actor.id, statsByActor);
			this.updatedActorCount++;
		}

		const logEntryTimestamp = moment.utc(logEntry.timestamp);
		if (statsByActor.firstLogEntryTimestamp == null
			|| statsByActor.firstLogEntryTimestamp.isAfter(logEntryTimestamp))
			statsByActor.firstLogEntryTimestamp = logEntryTimestamp;

		if (statsByActor.lastLogEntryTimestamp == null
			|| statsByActor.lastLogEntryTimestamp.isBefore(logEntryTimestamp))
			statsByActor.lastLogEntryTimestamp = logEntryTimestamp;

		this.collectDailyStatisticsFromStandardLogEntry(statsByActor, logEntry, logEntryDate);
		this.collectDailyStatisticsFromStandardLogEntry(this.statsByWiki, logEntry, logEntryDate);

		if (this.lastProcessedLogTimestamp == null
			|| this.lastProcessedLogTimestamp.isBefore(logEntryTimestamp)
		) {
			this.lastProcessedLogTimestamp = logEntryTimestamp;
		}
	}

	private collectDailyStatisticsFromStandardLogEntry(stats: WikiStatisticsUpdateCollection, logEntry: LogEntry, logEntryDate: moment.Moment) {
		const isNonServiceAwardLogEntry: boolean = logEntry.type === "newusers"
			|| logEntry.type === "create"
			|| (logEntry.type === "growthexperiments" && logEntry.action === "addlink")
			|| logEntry.type === "move"
			|| logEntry.type === "upload"
			|| logEntry.type === "liquidthreads"
			|| (logEntry.type === "review" && logEntry.action?.endsWith("a"));
		const serviceAwardLogEntryCount = isNonServiceAwardLogEntry ? 0 : 1;

		const dailyBucket = stats.dailyStatistics.find(x => x.date.isSame(logEntryDate));
		if (!dailyBucket) {
			stats.dailyStatistics.push(createDailyStatistics(logEntryDate, { logEvents: 1, serviceAwardLogEvents: serviceAwardLogEntryCount }));
		} else {
			dailyBucket.logEvents++;
			dailyBucket.serviceAwardLogEvents += serviceAwardLogEntryCount;
		}

		// Count by log type only
		if (typeof logEntry.type === "string" && logEntry.type != "") {
			const typeBucket = stats.logEntriesByType.find(x => x.logType === logEntry.type);

			if (!typeBucket) {
				stats.logEntriesByType.push({
					logType: logEntry.type,
					editsByDate: [{ date: logEntryDate, logEntries: 1, }]
				});
			} else {
				const dailyBucket = typeBucket.editsByDate.find(x => x.date.isSame(logEntryDate));
				if (!dailyBucket) {
					typeBucket.editsByDate.push({ date: logEntryDate, logEntries: 1 });
				} else {
					dailyBucket.logEntries++;
				}
			}
		}

		// Count by log action only
		if (typeof logEntry.action === "string" && logEntry.action != "") {
			const actionBucket = stats.logEntriesByAction.find(x => x.logAction === logEntry.action);

			if (!actionBucket) {
				stats.logEntriesByAction.push({
					logAction: logEntry.action,
					editsByDate: [{ date: logEntryDate, logEntries: 1, }]
				});
			} else {
				const dailyBucket = actionBucket.editsByDate.find(x => x.date.isSame(logEntryDate));
				if (!dailyBucket) {
					actionBucket.editsByDate.push({ date: logEntryDate, logEntries: 1 });
				} else {
					dailyBucket.logEntries++;
				}
			}
		}

		// Count by log type and log action
		if (typeof logEntry.type === "string" && logEntry.type != ""
			&& typeof logEntry.action === "string" && logEntry.action != "") {
			const typeActionBucket = stats.logEntriesByTypeAndAction.find(x =>
				x.logType === logEntry.type
				&& x.logAction === logEntry.action);

			if (!typeActionBucket) {
				stats.logEntriesByTypeAndAction.push({
					logType: logEntry.type,
					logAction: logEntry.action,
					editsByDate: [{ date: logEntryDate, logEntries: 1, }]
				});
			} else {
				const dailyBucket = typeActionBucket.editsByDate.find(x => x.date.isSame(logEntryDate));
				if (!dailyBucket) {
					typeActionBucket.editsByDate.push({ date: logEntryDate, logEntries: 1 });
				} else {
					dailyBucket.logEntries++;
				}
			}
		}
	}

	private processThanksLogEntry(thankerActor: Actor, logEntry: LogEntry, logEntryDate: moment.Moment): void {
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

		let statsByThankedActor = this.statsByActorDict.get(thankedActor.id);
		if (!statsByThankedActor) {
			statsByThankedActor = WikiEditCacher.createNewStatsByActorInstance(thankedActor);
			this.statsByActorList.push(statsByThankedActor);
			this.statsByActorDict.set(thankedActor.id, statsByThankedActor);
			this.updatedActorCount++;
		}

		let statsByThankerActor = this.statsByActorDict.get(thankerActor.id);
		if (!statsByThankerActor) {
			statsByThankerActor = WikiEditCacher.createNewStatsByActorInstance(thankerActor);
			this.statsByActorList.push(statsByThankerActor);
			this.statsByActorDict.set(thankerActor.id, statsByThankerActor);
			this.updatedActorCount++;
		}

		this.collectStatisticsFromThanksLogEntry(statsByThankerActor, statsByThankedActor, logEntryDate);
		this.collectStatisticsFromThanksLogEntry(this.statsByWiki, this.statsByWiki, logEntryDate);
	}

	private collectStatisticsFromThanksLogEntry(
		statsByThankerActor: WikiStatisticsUpdateCollection,
		statsByThankedActor: WikiStatisticsUpdateCollection,
		logEntryDate: moment.Moment
	) {
		const thankerDailyBucket = statsByThankerActor.dailyStatistics.find(x => x.date.isSame(logEntryDate));
		if (!thankerDailyBucket) {
			statsByThankedActor.dailyStatistics.push(createDailyStatistics(logEntryDate, { sentThanks: 1 }));
		} else {
			thankerDailyBucket.sentThanks++;
		}

		const thankedDailyBucket = statsByThankedActor.dailyStatistics.find(x => x.date.isSame(logEntryDate));
		if (!thankedDailyBucket) {
			statsByThankedActor.dailyStatistics.push(createDailyStatistics(logEntryDate, { receivedThanks: 1 }));
		} else {
			thankedDailyBucket.receivedThanks++;
		}
	}

	private async compareReplicaAndCacheActors(): Promise<void> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] getActorsToUpdate: Getting actors from stat db`);
		const existingStatActors = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("toolsActor")
			.getMany();

		const existingStatActorGroups = await this.toolsConnection.getRepository(this.wikiStatisticsEntities.actorGroup)
			.createQueryBuilder("actorGroup")
			.getMany();

		for (const toolsActor of existingStatActors) {
			toolsActor.actorGroups = existingStatActorGroups
				.filter(x => x.actorId === toolsActor.actorId);

			this.cachedActors.push(toolsActor);
			this.cachedActorsById.set(toolsActor.actorId, toolsActor);
		}

		const unseenActorsToUpdate: ActorEntityUpdateData[] = [];

		for (const wikiActor of this.wikiActors) {
			const toolsDbActor = this.cachedActorsById.get(wikiActor.id);
			if (!toolsDbActor) {
				unseenActorsToUpdate.push({
					mwDbActor: wikiActor,
					toolsDbActor: null
				});
			} else if (toolsDbActor.isRegistered) {
				const toolsDbActorGroups = new Set<string>((toolsDbActor.actorGroups || []).map(x => x.groupName));
				const userActorGroups = new Set<string>((wikiActor.user.userGroups || []).map(x => x.groupName));

				if (toolsDbActor.actorName !== wikiActor.user.name
					|| [...userActorGroups.values()].find(x => !toolsDbActorGroups.has(x))
					|| [...toolsDbActorGroups.values()].find(x => !userActorGroups.has(x))) {

					let existingStatsByActor = this.statsByActorDict.get(wikiActor.id);
					if (!existingStatsByActor) {
						existingStatsByActor = WikiEditCacher.createNewStatsByActorInstance(wikiActor);
						this.statsByActorList.push(existingStatsByActor);
						this.statsByActorDict.set(wikiActor.id, existingStatsByActor);
					}

					this.updatedActorCount++;
				}
			}
		}

		for (const unseenActor of _.take(unseenActorsToUpdate, this.appConfig.dataCacher.maxNewActorsProcessedInASingleRun)) {
			let existingStatsByActor = this.statsByActorDict.get(unseenActor.mwDbActor.id);
			if (!existingStatsByActor) {
				existingStatsByActor = WikiEditCacher.createNewStatsByActorInstance(unseenActor.mwDbActor);
				this.statsByActorList.push(existingStatsByActor);
				this.statsByActorDict.set(unseenActor.mwDbActor.id, existingStatsByActor);
			}

			this.updatedActorCount++;
		}

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] getActorsToUpdate: Will update at least ${this.updatedActorCount} actors`);
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
				expirationTimestamp: moment.utc(new Date(2050, 0, 1)).toDate(),
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
			await this.saveChangeTagDefinitionsToDatabase(em);

			await this.saveTemplatesToDatabase(em);

			for (const actorStat of this.statsByActorList) {
				await this.saveActorStatisticsToDatabase(em, actorStat);
			}

			await this.saveWikiStatisticsToDatabase(em);

			await this.saveWikiProcessedRevisionInfo(em);
		});
	}

	private async saveChangeTagDefinitionsToDatabase(em: EntityManager): Promise<void> {
		this.logger.info(`[saveChangeTagDefinitionsToDatabase/${this.wiki.id}] Saving ${this.wikiChangeTagDefinitions.size} change tag definitions to database...`);

		for (const changeTagDefinitionId of this.wikiChangeTagDefinitions.keys()) {
			if (this.cachedChangeTagDefinitions.has(changeTagDefinitionId)) {
				const cachedName = this.cachedChangeTagDefinitions.get(changeTagDefinitionId);
				const wikiName = this.wikiChangeTagDefinitions.get(changeTagDefinitionId);
				if (cachedName !== wikiName) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.changeTagDefinition)
						.set({
							changeTagDefinitionName: wikiName
						})
						.where("changeTagDefinitionId = :changeTagDefinitionId", { changeTagDefinitionId: changeTagDefinitionId })
						.execute();
				}
			} else {
				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.changeTagDefinition)
					.values({
						changeTagDefinitionId: changeTagDefinitionId,
						changeTagDefinitionName: this.wikiChangeTagDefinitions.get(changeTagDefinitionId)
					})
					.execute();
			}
		}

		for (const removedChangeTagDefinitionId of [...this.cachedChangeTagDefinitions.keys()]
			.filter(ele => this.wikiChangeTagDefinitions.has(ele) === false)
		) {
			this.logger.info(`[saveChangeTagDefinitionsToDatabase/${this.wiki.id}] Deleting ctd with id '${removedChangeTagDefinitionId}'...`);
			await em.createQueryBuilder()
				.delete()
				.from(this.wikiStatisticsEntities.changeTagDefinition)
				.where("changeTagDefinitionId = :changeTagDefinitionId", { changeTagDefinitionId: removedChangeTagDefinitionId })
				.execute();
		}

		this.logger.info(`[saveChangeTagDefinitionsToDatabase/${this.wiki.id}] Completed saving change tag definitions to database.`);
	}

	private async saveTemplatesToDatabase(em: EntityManager): Promise<void> {
		this.logger.info(`[saveChangeTagDefinitionsToDatabase/${this.wiki.id}] Saving ${this.wikiTemplates.size} templates to database...`);

		for (const templatePageId of this.wikiTemplates.keys()) {
			if (this.cachedTemplates.has(templatePageId)) {
				const cachedName = this.cachedTemplates.get(templatePageId);
				const wikiName = this.wikiTemplates.get(templatePageId);
				if (cachedName !== wikiName) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.template)
						.set({
							templateName: wikiName
						})
						.where("templatePageId = :templatePageId", { templatePageId: templatePageId })
						.execute();
				}
			} else {
				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.template)
					.values({
						templatePageId: templatePageId,
						templateName: this.wikiTemplates.get(templatePageId)
					})
					.execute();
			}
		}

		for (const removedTemplatePageId of [...this.cachedTemplates.keys()]
			.filter(ele => this.wikiTemplates.has(ele) === false)
		) {
			this.logger.info(`[saveTemplatesToDatabase/${this.wiki.id}] Deleting template with id '${removedTemplatePageId}'...`);
			await em.createQueryBuilder()
				.delete()
				.from(this.wikiStatisticsEntities.template)
				.where("templatePageId = :templatePageId", { templatePageId: removedTemplatePageId })
				.execute();
		}

		this.logger.info(`[saveChangeTagDefinitionsToDatabase/${this.wiki.id}] Completed saving templates to database.`);
	}

	private async saveActorStatisticsToDatabase(em: EntityManager, actorStat: ActorStatisticsUpdateCollection): Promise<void> {
		actorStat.dailyStatistics.sort((a, b) => compareMoments(a.date, b.date));
		for (const nsStat of actorStat.editsByNamespace) {
			nsStat.editsByDate.sort((a, b) => compareMoments(a.date, b.date));
		}
		for (const nsltStat of actorStat.logEntriesByTypeAndAction) {
			nsltStat.editsByDate.sort((a, b) => compareMoments(a.date, b.date));
		}

		await this.saveActorEntityToDatabase(actorStat, em);

		await this.saveActorDailyStatisticsToDatabase(actorStat, em);
		await this.saveActorDailyStatisticsByNamespaceToDatabase(actorStat, em);
		await this.saveActorEditsByDateAndChangeTagToDatabase(actorStat, em);
		await this.saveActorEditsByDateNamespaceAndChangeTagToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateAndTypeToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateAndActionToDatabase(actorStat, em);
		await this.saveActorLogEntriesByDateTypeAndActionToDatabase(actorStat, em);

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: ${actorStat.actorName} successfully finished.`);
	}

	private async saveActorEntityToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const existingActorArr = await em.getRepository(this.wikiStatisticsEntities.actor)
			.createQueryBuilder("actor")
			.where("actor.actorId = :actorId", { actorId: actorStat.actorId })
			.getMany();

		const existingActorGroups = await em.getRepository(this.wikiStatisticsEntities.actorGroup)
			.createQueryBuilder("actorGroup")
			.where("actorGroup.actorId = :actorId", { actorId: actorStat.actorId })
			.getMany();

		if (existingActorArr && existingActorArr.length === 1) {
			existingActorArr[0].actorGroups = existingActorGroups ?? [];
			await this.updateActorInDatabase(actorStat, existingActorArr[0], em);
		} else {
			await this.createActorInDatabase(actorStat, em);
		}
	}

	private async createActorInDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const firstEditDate = actorStat.dailyStatistics.length > 0 ? actorStat.dailyStatistics[0].date : undefined;
		const mwDbActor = this.wikiActorsById.get(actorStat.actorId);
		if (!mwDbActor) {
			this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] createActorInDatabase: Failed to create actor for '${actorStat.actorId}/${actorStat.actorName}', mediawiki actor not found`);
			return;
		}

		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] createActorInDatabase: Creating actor for '${actorStat.actorId}/${actorStat.actorName}'`);
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
						? (firstEditDate?.toDate() ?? null)
						: actorStat.actor.user.registrationTimestamp)
					: null,
			})
			.execute();

		for (const group of (mwDbActor.user?.userGroups ?? [])) {
			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actorGroup)
				.values({
					actorId: mwDbActor.id,
					groupName: group.groupName
				})
				.execute();
		}

		const wikiActorUserPageTemplateSet = this.wikiMainUserPageTemplateLinks.get(actorStat.actorId);
		const wikiActorUserPageTemplates = wikiActorUserPageTemplateSet
			? [...wikiActorUserPageTemplateSet.values()]
			: [];

		for (const userPageTemplatePageId of wikiActorUserPageTemplates) {
			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actorUserPageTemplate)
				.values({
					actorId: mwDbActor.id,
					templatePageId: userPageTemplatePageId
				})
				.execute();
		}
	}

	private async updateActorInDatabase(actorStat: ActorStatisticsUpdateCollection, existingActor: ActorTypeModel, em: EntityManager): Promise<void> {
		const mwDbActor = this.wikiActorsById.get(actorStat.actorId);
		if (!mwDbActor) {
			this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Failed to create actor for '${actorStat.actorName}', mediawiki actor not found`);
			return;
		}

		this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Updating actor entity for '${actorStat.actorName}'`);

		const isRegistrationTimestampFromFirstEdit = existingActor.registrationTimestamp != null
			? existingActor.isRegistrationTimestampFromFirstEdit ?? undefined
			: true;
		const actorRegistrationTimestamp = existingActor.registrationTimestamp != null
			? moment.utc(existingActor.registrationTimestamp)
			: actorStat.firstEditTimestamp ?? undefined;

		const firstEditTimestamp =
			existingActor.firstEditTimestamp == null && actorStat.firstEditTimestamp == null ? undefined
				: actorStat.firstEditTimestamp == null ? moment.utc(existingActor.firstEditTimestamp)
					: existingActor.firstEditTimestamp == null ? actorStat.firstEditTimestamp
						: actorStat.firstEditTimestamp.isBefore(existingActor.firstEditTimestamp) ? actorStat.firstEditTimestamp : moment.utc(existingActor.firstEditTimestamp);
		const lastEditTimestamp =
			existingActor.lastEditTimestamp == null && actorStat.lastEditTimestamp == null ? undefined
				: actorStat.lastEditTimestamp == null ? moment.utc(existingActor.lastEditTimestamp)
					: existingActor.lastEditTimestamp == null ? actorStat.lastEditTimestamp
						: actorStat.lastEditTimestamp.isAfter(existingActor.lastEditTimestamp) ? actorStat.lastEditTimestamp : moment.utc(existingActor.lastEditTimestamp);

		const firstLogEntryTimestamp =
			existingActor.firstLogEntryTimestamp == null && actorStat.firstLogEntryTimestamp == null ? undefined
				: actorStat.firstLogEntryTimestamp == null ? moment.utc(existingActor.firstLogEntryTimestamp)
					: existingActor.firstLogEntryTimestamp == null ? actorStat.firstLogEntryTimestamp
						: actorStat.firstLogEntryTimestamp.isBefore(existingActor.firstLogEntryTimestamp) ? actorStat.firstLogEntryTimestamp : moment.utc(existingActor.firstLogEntryTimestamp);
		const lastLogEntryTimestamp =
			existingActor.lastLogEntryTimestamp == null && actorStat.lastLogEntryTimestamp == null ? undefined
				: actorStat.lastLogEntryTimestamp == null ? moment.utc(existingActor.lastLogEntryTimestamp)
					: existingActor.lastLogEntryTimestamp == null ? actorStat.lastLogEntryTimestamp
						: actorStat.lastLogEntryTimestamp.isAfter(existingActor.lastLogEntryTimestamp) ? actorStat.lastLogEntryTimestamp : moment.utc(existingActor.lastLogEntryTimestamp);

		const actorName = WikiEditCacher.getActorName(mwDbActor);

		await em
			.createQueryBuilder()
			.update(this.wikiStatisticsEntities.actor)
			.set({
				actorName: actorName,
				registrationTimestamp: actorRegistrationTimestamp?.toDate(),
				isRegistrationTimestampFromFirstEdit: isRegistrationTimestampFromFirstEdit,
				firstEditTimestamp: firstEditTimestamp?.toDate(),
				lastEditTimestamp: lastEditTimestamp?.toDate(),
				firstLogEntryTimestamp: firstLogEntryTimestamp?.toDate(),
				lastLogEntryTimestamp: lastLogEntryTimestamp?.toDate(),
			})
			.where("actorId = :actorId", { actorId: actorStat.actorId })
			.execute();

		const toolsDbUserGroups = (existingActor.actorGroups ?? []).map(x => x.groupName);
		const mwUserGroups = (mwDbActor.user?.userGroups ?? []).map(x => x.groupName);

		for (const groupToAdd of mwUserGroups.filter(groupName => toolsDbUserGroups.indexOf(groupName) === -1)) {
			this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Adding group '${groupToAdd}' for '${actorName}'...`);

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
			this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Deleting group ${groupToDelete} for '${actorName}'...`);
			await em.createQueryBuilder()
				.delete()
				.from(this.wikiStatisticsEntities.actorGroup)
				.where("actorId = :actorId", { actorId: mwDbActor.id })
				.andWhere("groupName = :groupName", { groupName: groupToDelete })
				.execute();
		}

		const wikiUserPageTemplateLinkSet = this.wikiMainUserPageTemplateLinks.get(actorStat.actorId);
		const wikiUserPageTemplateLinks = wikiUserPageTemplateLinkSet
			? [...wikiUserPageTemplateLinkSet.values()]
			: [];
		const cachedUserPageTemplateLinkSet = this.cachedUserPageTemplateLinks.get(actorStat.actorId);
		const cachedUserPageTemplateLinks = cachedUserPageTemplateLinkSet
			? [...cachedUserPageTemplateLinkSet.values()]
			: [];

		for (const tlToAdd of wikiUserPageTemplateLinks.filter(templateLinkId => cachedUserPageTemplateLinks.indexOf(templateLinkId) === -1)) {
			this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Adding template link '${tlToAdd}' for '${actorName}'...`);

			await em.createQueryBuilder()
				.insert()
				.into(this.wikiStatisticsEntities.actorUserPageTemplate)
				.values({
					actorId: mwDbActor.id,
					templatePageId: tlToAdd
				})
				.execute();
		}

		for (const tlToDelete of cachedUserPageTemplateLinks.filter(templateLinkid => wikiUserPageTemplateLinks.indexOf(templateLinkid) === -1)) {
			this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Deleting template link ${tlToDelete} for '${actorName}'...`);
			await em.createQueryBuilder()
				.delete()
				.from(this.wikiStatisticsEntities.actorUserPageTemplate)
				.where("actorId = :actorId", { actorId: mwDbActor.id })
				.andWhere("templatePageId = :templatePageId", { templatePageId: tlToDelete })
				.execute();
		}

		this.logger.info(`[updateActorInDatabase/${this.wiki.id}] Updating '${actorStat.actorName}' actor entity completed`);
	}

	private async saveWikiStatisticsToDatabase(em: EntityManager) {
		await this.saveWikiDailyStatisticsToDatabase(this.statsByWiki, em);
		await this.saveWikiDailyStatisticsByNamespaceToDatabase(this.statsByWiki, em);
		await this.saveWikiEditsByDateAndChangeTagToDatabase(this.statsByWiki, em);
		await this.saveWikiEditsByDateNamespaceAndChangeTagToDatabase(this.statsByWiki, em);
		await this.saveWikiLogEntriesByDateAndTypeToDatabase(this.statsByWiki, em);
		await this.saveWikiLogEntriesByDateAndActionToDatabase(this.statsByWiki, em);
		await this.saveWikiLogEntriesByDateTypeAndActionToDatabase(this.statsByWiki, em);
	}

	private async saveWikiDailyStatisticsToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating daily statistics by date for wiki (${wikiStat.dailyStatistics.length} items)...`);

		for (const editsByDate of wikiStat.dailyStatistics) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.dailyStatistics)
				.findOne({ where: { date: editsByDate.date.toDate() } });

			if (existingStat) {
				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.dailyStatistics)
					.set({
						dailyEdits: existingStat.dailyEdits + editsByDate.edits,
						dailyRevertedEdits: existingStat.dailyRevertedEdits + editsByDate.revertedEdits,
						dailyCharacterChanges: existingStat.dailyCharacterChanges + editsByDate.characterChanges,
						dailyReceivedThanks: existingStat.dailyReceivedThanks + editsByDate.receivedThanks,
						dailySentThanks: existingStat.dailySentThanks + editsByDate.sentThanks,
						dailyLogEvents: existingStat.dailyLogEvents + editsByDate.logEvents,
					})
					.where("date = :date", { date: editsByDate.date.toDate() })
					.execute();
			} else {
				const previousDay = await em.getRepository(this.wikiStatisticsEntities.dailyStatistics)
					.createQueryBuilder("ds")
					.where("ds.date < :date", { date: editsByDate.date.toDate() })
					.orderBy("ds.date", "DESC")
					.limit(1)
					.getOne();

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.dailyStatistics)
					.values({
						date: editsByDate.date.toDate(),
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
						dailyReceivedThanks: editsByDate.receivedThanks,
						receivedThanksToDate: previousDay
							? previousDay.receivedThanksToDate + previousDay.dailyReceivedThanks
							: 0,
						dailySentThanks: editsByDate.sentThanks,
						sentThanksToDate: previousDay
							? previousDay.sentThanksToDate + previousDay.dailySentThanks
							: 0,
						dailyLogEvents: editsByDate.logEvents,
						logEventsToDate: previousDay
							? previousDay.logEventsToDate + previousDay.dailyLogEvents
							: 0,
					})
					.execute();
			}

			await em
				.createQueryBuilder()
				.update(this.wikiStatisticsEntities.dailyStatistics)
				.set({
					editsToDate: () => `edits_to_date + ${editsByDate.edits}`,
					revertedEditsToDate: () => `reverted_edits_to_date + ${editsByDate.revertedEdits}`,
					characterChangesToDate: () => `character_changes_to_date + ${editsByDate.characterChanges}`,
					receivedThanksToDate: () => `received_thanks_to_date + ${editsByDate.receivedThanks}`,
					sentThanksToDate: () => `sent_thanks_to_date + ${editsByDate.sentThanks}`,
					logEventsToDate: () => `log_events_to_date + ${editsByDate.logEvents}`,
				})
				.where("date > :date", { date: editsByDate.date.toDate() })
				.execute();
		}
	}

	private async saveActorDailyStatisticsToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating daily statistics by date for ${actorStat.actorName} (${actorStat.dailyStatistics.length} items)...`);

		for (const editsByDate of actorStat.dailyStatistics) {
			const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatistics)
				.findOne({ where: { actorId: actorStat.actorId, date: editsByDate.date.toDate() } });

			let activeDayRollover = 0;
			if (existingStat) {
				// TODO: maybe use service award log events?
				const activeDay = (existingStat.dailyEdits + editsByDate.edits > 0)
					|| (existingStat.dailyLogEvents + editsByDate.logEvents > 0) ? 1 : 0;
				if (existingStat.dailyActiveDay < activeDay)
					activeDayRollover = 1;

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorDailyStatistics)
					.set({
						dailyEdits: existingStat.dailyEdits + editsByDate.edits,
						dailyRevertedEdits: existingStat.dailyRevertedEdits + editsByDate.revertedEdits,
						dailyCharacterChanges: existingStat.dailyCharacterChanges + editsByDate.characterChanges,
						dailyReceivedThanks: existingStat.dailyReceivedThanks + editsByDate.receivedThanks,
						dailySentThanks: existingStat.dailySentThanks + editsByDate.sentThanks,
						dailyLogEvents: existingStat.dailyLogEvents + editsByDate.logEvents,
						dailyServiceAwardLogEvents: existingStat.dailyServiceAwardLogEvents + editsByDate.serviceAwardLogEvents,
						dailyActiveDay: activeDay
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date = :date", { date: editsByDate.date.toDate() })
					.execute();
			} else {
				// TODO: maybe use service award log events?
				const activeDay = editsByDate.edits > 0 || editsByDate.logEvents > 0 ? 1 : 0;
				activeDayRollover = activeDay;

				const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatistics)
					.createQueryBuilder("ads")
					.where("ads.actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("ads.date < :date", { date: editsByDate.date.toDate() })
					.orderBy("ads.date", "DESC")
					.limit(1)
					.getOne();

				await em.createQueryBuilder()
					.insert()
					.into(this.wikiStatisticsEntities.actorDailyStatistics)
					.values({
						actorId: actorStat.actorId,
						date: editsByDate.date.toDate(),
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
						dailyReceivedThanks: editsByDate.receivedThanks,
						receivedThanksToDate: previousDay
							? previousDay.receivedThanksToDate + previousDay.dailyReceivedThanks
							: 0,
						dailySentThanks: editsByDate.sentThanks,
						sentThanksToDate: previousDay
							? previousDay.sentThanksToDate + previousDay.dailySentThanks
							: 0,
						dailyLogEvents: editsByDate.logEvents,
						logEventsToDate: previousDay
							? previousDay.logEventsToDate + previousDay.dailyLogEvents
							: 0,
						dailyServiceAwardLogEvents: editsByDate.serviceAwardLogEvents,
						serviceAwardLogEventsToDate: previousDay
							? previousDay.serviceAwardLogEventsToDate + previousDay.dailyServiceAwardLogEvents
							: 0,
						dailyActiveDay: activeDay,
						activeDaysToDate: previousDay
							? previousDay.activeDaysToDate + previousDay?.dailyActiveDay
							: 0
					})
					.execute();
			}

			await em
				.createQueryBuilder()
				.update(this.wikiStatisticsEntities.actorDailyStatistics)
				.set({
					editsToDate: () => `edits_to_date + ${editsByDate.edits}`,
					revertedEditsToDate: () => `reverted_edits_to_date + ${editsByDate.revertedEdits}`,
					characterChangesToDate: () => `character_changes_to_date + ${editsByDate.characterChanges}`,
					receivedThanksToDate: () => `received_thanks_to_date + ${editsByDate.receivedThanks}`,
					sentThanksToDate: () => `sent_thanks_to_date + ${editsByDate.sentThanks}`,
					logEventsToDate: () => `log_events_to_date + ${editsByDate.logEvents}`,
					serviceAwardLogEventsToDate: () => `saward_log_events_to_date + ${editsByDate.serviceAwardLogEvents}`,
					activeDaysToDate: () => `active_days_to_date + ${activeDayRollover}`,
				})
				.where("actorId = :actorId", { actorId: actorStat.actorId })
				.andWhere("date > :date", { date: editsByDate.date.toDate() })
				.execute();
		}
	}

	private async saveWikiDailyStatisticsByNamespaceToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.editsByNamespace, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.editsByNamespace) {
			for (const editByDateAndNs of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
					.findOne({ where: { namespace: editsByNs.namespace, date: editByDateAndNs.date.toDate() } });

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateAndNs.edits,
							dailyRevertedEdits: existingStat.dailyRevertedEdits + editByDateAndNs.revertedEdits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateAndNs.characterChanges,
						})
						.where("date = :date", { date: editByDateAndNs.date.toDate() })
						.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.createQueryBuilder("dsn")
						.where("dsn.namespace = :namespace", { namespace: editsByNs.namespace })
						.andWhere("dsn.date < :date", { date: editByDateAndNs.date.toDate() })
						.orderBy("dsn.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
						.values({
							date: editByDateAndNs.date.toDate(),
							namespace: editsByNs.namespace,
							dailyEdits: editByDateAndNs.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyRevertedEdits: editByDateAndNs.revertedEdits,
							revertedEditsToDate: previousDay
								? previousDay.revertedEditsToDate + previousDay.dailyRevertedEdits
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

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.dailyStatisticsByNamespace)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateAndNs.edits}`,
						revertedEditsToDate: () => `reverted_edits_to_date + ${editByDateAndNs.revertedEdits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateAndNs.characterChanges}`,
						logEventsToDate: () => `log_events_to_date + ${editByDateAndNs.logEvents}`,
					})
					.where("date > :date", { date: editByDateAndNs.date.toDate() })
					.andWhere("namespace = :namespace", { namespace: editsByNs.namespace })
					.execute();
			}
		}
	}

	private async saveActorDailyStatisticsByNamespaceToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByNamespace, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNamespace of actorStat.editsByNamespace) {
			for (const editByDateAndNamespace of editsByNamespace.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							namespace: editsByNamespace.namespace,
							date: editByDateAndNamespace.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateAndNamespace.edits,
							dailyRevertedEdits: existingStat.dailyRevertedEdits + editByDateAndNamespace.revertedEdits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateAndNamespace.characterChanges,
							dailyLogEvents: existingStat.dailyLogEvents + editByDateAndNamespace.logEvents,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateAndNamespace.date.toDate() })
						.andWhere("namespace = :namespace", { namespace: editsByNamespace.namespace })
						.execute();
				} else {
					const previousDay = await em
						.getRepository(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.createQueryBuilder("adsn")
						.where("adsn.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("adsn.namespace = :namespace", { namespace: editsByNamespace.namespace })
						.andWhere("adsn.date < :date", { date: editByDateAndNamespace.date.toDate() })
						.orderBy("adsn.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
						.values({
							actorId: actorStat.actorId,
							date: editByDateAndNamespace.date.toDate(),
							namespace: editsByNamespace.namespace,
							dailyEdits: editByDateAndNamespace.edits,
							editsToDate: previousDay
								? previousDay.editsToDate + previousDay.dailyEdits
								: 0,
							dailyRevertedEdits: editByDateAndNamespace.revertedEdits,
							revertedEditsToDate: previousDay
								? previousDay.revertedEditsToDate + previousDay.dailyRevertedEdits
								: 0,
							dailyCharacterChanges: editByDateAndNamespace.characterChanges,
							characterChangesToDate: previousDay
								? previousDay.characterChangesToDate + previousDay.dailyCharacterChanges
								: 0,
							dailyLogEvents: editByDateAndNamespace.logEvents,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0,
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorDailyStatisticsByNamespace)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateAndNamespace.edits}`,
						revertedEditsToDate: () => `reverted_edits_to_date + ${editByDateAndNamespace.revertedEdits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateAndNamespace.characterChanges}`,
						logEventsToDate: () => `log_events_to_date + ${editByDateAndNamespace.logEvents}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("namespace = :namespace", { namespace: editsByNamespace.namespace })
					.andWhere("date > :date", { date: editByDateAndNamespace.date.toDate() })
					.execute();
			}
		}
	}

	private async saveWikiEditsByDateAndChangeTagToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.editsByChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date & change tag for wiki (${nsItemCount} items)...`);

		for (const editsByCt of wikiStat.editsByChangeTag) {
			for (const editByDateNsAndCt of editsByCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByChangeTag)
					.findOne({
						where: {
							changeTagId: editsByCt.changeTagId,
							date: editByDateNsAndCt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.editStatisticsByChangeTag)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateNsAndCt.edits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateNsAndCt.characterChanges,
						})
						.where("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByChangeTag)
						.createQueryBuilder("esnc")
						.where("esnc.changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
						.andWhere("esnc.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("esnc.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.editStatisticsByChangeTag)
						.values({
							changeTagId: editsByCt.changeTagId,
							date: editByDateNsAndCt.date.toDate(),
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

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.editStatisticsByChangeTag)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
					})
					.where("changeTagId = :changeTagId", { changeTagId: editsByCt.changeTagId })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.execute();
			}
		}
	}

	private async saveActorEditsByDateAndChangeTagToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by change tag for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNsAndCt of actorStat.editsByChangeTag) {
			for (const editByDateNsAndCt of editsByNsAndCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByChangeTag)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							changeTagId: editsByNsAndCt.changeTagId,
							date: editByDateNsAndCt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorEditStatisticsByChangeTag)
						.set({
							dailyEdits: existingStat.dailyEdits + editByDateNsAndCt.edits,
							dailyCharacterChanges: existingStat.dailyCharacterChanges + editByDateNsAndCt.characterChanges,
						})
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByChangeTag)
						.createQueryBuilder("aesnc")
						.where("aesnc.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("aesnc.changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("aesnc.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("aesnc.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorEditStatisticsByChangeTag)
						.values({
							actorId: actorStat.actorId,
							changeTagId: editsByNsAndCt.changeTagId,
							date: editByDateNsAndCt.date.toDate(),
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

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorEditStatisticsByChangeTag)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.execute();
			}
		}
	}

	private async saveWikiEditsByDateNamespaceAndChangeTagToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.editsByNamespaceAndChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace & change tag for wiki (${nsItemCount} items)...`);

		for (const editsByNsAndCt of wikiStat.editsByNamespaceAndChangeTag) {
			for (const editByDateNsAndCt of editsByNsAndCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
					.findOne({
						where: {
							changeTagId: editsByNsAndCt.changeTagId,
							namespace: editsByNsAndCt.namespace,
							date: editByDateNsAndCt.date.toDate()
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
						.where("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.andWhere("namespace = :namespace", { namespace: editsByNsAndCt.namespace })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.createQueryBuilder("esnc")
						.where("esnc.changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("esnc.namespace = :namespace", { namespace: editsByNsAndCt.namespace })
						.andWhere("esnc.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("esnc.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
						.values({
							changeTagId: editsByNsAndCt.changeTagId,
							date: editByDateNsAndCt.date.toDate(),
							namespace: editsByNsAndCt.namespace,
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

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.editStatisticsByNamespaceAndChangeTag)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
					})
					.where("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
					.andWhere("namespace = :namespace", { namespace: editsByNsAndCt.namespace })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.execute();
			}
		}
	}

	private async saveActorEditsByDateNamespaceAndChangeTagToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.editsByNamespaceAndChangeTag, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating edits by date by namespace & change tag for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNsAndCt of actorStat.editsByNamespaceAndChangeTag) {
			for (const editByDateNsAndCt of editsByNsAndCt.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							changeTagId: editsByNsAndCt.changeTagId,
							namespace: editsByNsAndCt.namespace,
							date: editByDateNsAndCt.date.toDate()
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
						.andWhere("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.andWhere("namespace = :namespace", { namespace: editsByNsAndCt.namespace })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.createQueryBuilder("aesnc")
						.where("aesnc.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("aesnc.changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
						.andWhere("aesnc.namespace = :namespace", { namespace: editsByNsAndCt.namespace })
						.andWhere("aesnc.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("aesnc.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
						.values({
							actorId: actorStat.actorId,
							changeTagId: editsByNsAndCt.changeTagId,
							date: editByDateNsAndCt.date.toDate(),
							namespace: editsByNsAndCt.namespace,
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

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorEditStatisticsByNamespaceAndChangeTag)
					.set({
						editsToDate: () => `edits_to_date + ${editByDateNsAndCt.edits}`,
						characterChangesToDate: () => `character_changes_to_date + ${editByDateNsAndCt.characterChanges}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("changeTagId = :changeTagId", { changeTagId: editsByNsAndCt.changeTagId })
					.andWhere("namespace = :namespace", { namespace: editsByNsAndCt.namespace })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.execute();
			}
		}
	}

	private async saveWikiLogEntriesByDateAndTypeToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.logEntriesByType, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date and log type for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.logEntriesByType) {
			for (const editByNsAndLt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogType)
					.findOne({
						where: {
							logType: editsByNs.logType,
							date: editByNsAndLt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.logStatisticsByLogType)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByNsAndLt.logEntries })
						.where("date = :date", { date: editByNsAndLt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogType)
						.createQueryBuilder("lsnl")
						.where("lsnl.logType = :logType", { logType: editsByNs.logType })
						.andWhere("lsnl.date < :date", { date: editByNsAndLt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.logStatisticsByLogType)
						.values({
							date: editByNsAndLt.date.toDate(),
							logType: editsByNs.logType,
							dailyLogEvents: editByNsAndLt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.logStatisticsByLogType)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByNsAndLt.logEntries}`,
					})
					.where("date > :date", { date: editByNsAndLt.date.toDate() })
					.andWhere("logType = :logType", { logType: editsByNs.logType })
					.execute();
			}
		}
	}

	private async saveActorLogEntriesByDateAndTypeToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.logEntriesByTypeAndAction, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date and log type for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.logEntriesByTypeAndAction) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogType)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							logType: editsByNs.logType,
							date: editByDateNsAndCt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByLogType)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.logEntries })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogType)
						.createQueryBuilder("lsnl")
						.where("lsnl.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("lsnl.logType = :logType", { logType: editsByNs.logType })
						.andWhere("lsnl.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorLogStatisticsByLogType)
						.values({
							actorId: actorStat.actorId,
							date: editByDateNsAndCt.date.toDate(),
							logType: editsByNs.logType,
							dailyLogEvents: editByDateNsAndCt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorLogStatisticsByLogType)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByDateNsAndCt.logEntries}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.andWhere("logType = :logType", { logType: editsByNs.logType })
					.execute();
			}
		}
	}

	private async saveWikiLogEntriesByDateAndActionToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.logEntriesByAction, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date and log action for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.logEntriesByAction) {
			for (const editByNsAndLt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogAction)
					.findOne({
						where: {
							logAction: editsByNs.logAction,
							date: editByNsAndLt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.logStatisticsByLogAction)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByNsAndLt.logEntries })
						.where("date = :date", { date: editByNsAndLt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogAction)
						.createQueryBuilder("lsnl")
						.where("lsnl.logAction = :logAction", { logAction: editsByNs.logAction })
						.andWhere("lsnl.date < :date", { date: editByNsAndLt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.logStatisticsByLogAction)
						.values({
							date: editByNsAndLt.date.toDate(),
							logAction: editsByNs.logAction,
							dailyLogEvents: editByNsAndLt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.logStatisticsByLogAction)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByNsAndLt.logEntries}`,
					})
					.where("date > :date", { date: editByNsAndLt.date.toDate() })
					.andWhere("logAction = :logAction", { logAction: editsByNs.logAction })
					.execute();
			}
		}
	}

	private async saveActorLogEntriesByDateAndActionToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.logEntriesByAction, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date and log action for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.logEntriesByAction) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogAction)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							logAction: editsByNs.logAction,
							date: editByDateNsAndCt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByLogAction)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.logEntries })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogAction)
						.createQueryBuilder("lsnl")
						.where("lsnl.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("lsnl.logAction = :logAction", { logAction: editsByNs.logAction })
						.andWhere("lsnl.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorLogStatisticsByLogAction)
						.values({
							actorId: actorStat.actorId,
							date: editByDateNsAndCt.date.toDate(),
							logAction: editsByNs.logAction,
							dailyLogEvents: editByDateNsAndCt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorLogStatisticsByLogAction)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByDateNsAndCt.logEntries}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.andWhere("logAction = :logAction", { logAction: editsByNs.logAction })
					.execute();
			}
		}
	}

	private async saveWikiLogEntriesByDateTypeAndActionToDatabase(wikiStat: WikiStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(wikiStat.logEntriesByTypeAndAction, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date, log type and log action for wiki (${nsItemCount} items)...`);

		for (const editsByNs of wikiStat.logEntriesByTypeAndAction) {
			for (const editByNsAndLt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogTypeAndLogAction)
					.findOne({
						where: {
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							date: editByNsAndLt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.logStatisticsByLogTypeAndLogAction)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByNsAndLt.logEntries })
						.where("date = :date", { date: editByNsAndLt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.logStatisticsByLogTypeAndLogAction)
						.createQueryBuilder("lsnl")
						.where("lsnl.logAction = :logAction", { logAction: editsByNs.logAction })
						.andWhere("lsnl.logType = :logType", { logType: editsByNs.logType })
						.andWhere("lsnl.date < :date", { date: editByNsAndLt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.logStatisticsByLogTypeAndLogAction)
						.values({
							date: editByNsAndLt.date.toDate(),
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							dailyLogEvents: editByNsAndLt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.logStatisticsByLogTypeAndLogAction)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByNsAndLt.logEntries}`,
					})
					.where("date > :date", { date: editByNsAndLt.date.toDate() })
					.andWhere("logAction = :logAction", { logAction: editsByNs.logAction })
					.andWhere("logType = :logType", { logType: editsByNs.logType })
					.execute();
			}
		}
	}

	private async saveActorLogEntriesByDateTypeAndActionToDatabase(actorStat: ActorStatisticsUpdateCollection, em: EntityManager) {
		const nsItemCount = _.sumBy(actorStat.logEntriesByTypeAndAction, x => x.editsByDate.length);
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Updating log entries by date, log type and log action for ${actorStat.actorName} (${nsItemCount} items)...`);

		for (const editsByNs of actorStat.logEntriesByTypeAndAction) {
			for (const editByDateNsAndCt of editsByNs.editsByDate) {
				const existingStat = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogTypeAndLogAction)
					.findOne({
						where: {
							actorId: actorStat.actorId,
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							date: editByDateNsAndCt.date.toDate()
						}
					});

				if (existingStat) {
					await em
						.createQueryBuilder()
						.update(this.wikiStatisticsEntities.actorLogStatisticsByLogTypeAndLogAction)
						.set({ dailyLogEvents: existingStat.dailyLogEvents + editByDateNsAndCt.logEntries })
						.where("actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("date = :date", { date: editByDateNsAndCt.date.toDate() })
						.execute();
				} else {
					const previousDay = await em.getRepository(this.wikiStatisticsEntities.actorLogStatisticsByLogTypeAndLogAction)
						.createQueryBuilder("lsnl")
						.where("lsnl.actorId = :actorId", { actorId: actorStat.actorId })
						.andWhere("lsnl.logAction = :logAction", { logAction: editsByNs.logAction })
						.andWhere("lsnl.logType = :logType", { logType: editsByNs.logType })
						.andWhere("lsnl.date < :date", { date: editByDateNsAndCt.date.toDate() })
						.orderBy("lsnl.date", "DESC")
						.limit(1)
						.getOne();

					await em.createQueryBuilder()
						.insert()
						.into(this.wikiStatisticsEntities.actorLogStatisticsByLogTypeAndLogAction)
						.values({
							actorId: actorStat.actorId,
							date: editByDateNsAndCt.date.toDate(),
							logAction: editsByNs.logAction,
							logType: editsByNs.logType,
							dailyLogEvents: editByDateNsAndCt.logEntries,
							logEventsToDate: previousDay
								? previousDay.logEventsToDate + previousDay.dailyLogEvents
								: 0
						})
						.execute();
				}

				await em
					.createQueryBuilder()
					.update(this.wikiStatisticsEntities.actorLogStatisticsByLogTypeAndLogAction)
					.set({
						logEventsToDate: () => `log_events_to_date + ${editByDateNsAndCt.logEntries}`,
					})
					.where("actorId = :actorId", { actorId: actorStat.actorId })
					.andWhere("date > :date", { date: editByDateNsAndCt.date.toDate() })
					.andWhere("logAction = :logAction", { logAction: editsByNs.logAction })
					.andWhere("logType = :logType", { logType: editsByNs.logType })
					.execute();
			}
		}
	}

	private async saveWikiProcessedRevisionInfo(em: EntityManager): Promise<void> {
		this.logger.info(`[doWikiCacheProcess/${this.wiki.id}] Persistence: Saving wiki processed revision info...`);

		const currentWikiProcessEntry = await em.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: this.wiki.id } });

		if (!currentWikiProcessEntry) {
			await em.createQueryBuilder()
				.insert()
				.into(WikiProcessedRevisions)
				.values({
					wiki: this.wiki.id,
					lastProcessedRevisionId: this.lastProcessedRevisionId,
					lastProcessedRevisionTimestamp: this.lastProcessedRevisionTimestamp?.toDate(),
					lastProcessedLogId: this.lastProcessedLogId,
					lastProcessedLogTimestamp: this.lastProcessedLogTimestamp?.toDate(),
					lastRun: moment.utc().toDate(),
				})
				.execute();
		} else {
			await em
				.createQueryBuilder()
				.update(WikiProcessedRevisions)
				.set({
					lastProcessedRevisionId: this.lastProcessedRevisionId,
					lastProcessedRevisionTimestamp: this.lastProcessedRevisionTimestamp?.toDate(),
					lastProcessedLogId: this.lastProcessedLogId,
					lastProcessedLogTimestamp: this.lastProcessedLogTimestamp?.toDate(),
					lastRun: moment.utc().toDate(),
				})
				.andWhere("wiki = :wiki", { wiki: this.wiki.id })
				.execute();
		}
	}

	private async saveServiceAwardStatisticsModuleDataToWiki() {
		const connMan = getManager(this.toolsConnection.name);
		await connMan.transaction(async (em: EntityManager) => {
			const tableName = em.getRepository(this.wikiStatisticsEntities.actorDailyStatistics).metadata.tableName;

			const query = em.getRepository(this.wikiStatisticsEntities.actor)
				.createQueryBuilder("actor")
				.select("actor.actorId", "actorId")
				.addSelect("actor.actorName", "actorName")
				.addSelect("IFNULL(ads.dailyEdits + ads.editsToDate, 0)", "edits")
				.addSelect("IFNULL(ads.dailyServiceAwardLogEvents + ads.serviceAwardLogEventsToDate, 0)", "logEvents")
				.addSelect("IFNULL(ads.dailyActiveDay + ads.activeDaysToDate, 0)", "activeDays")
				.innerJoin(
					this.wikiStatisticsEntities.actorDailyStatistics,
					"ads",
					"ads.actorId = actor.actorId "
					+ `AND ads.date = (SELECT MAX(date) FROM ${tableName} WHERE actor_id = actor.actorId)`
				)
				.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 1 })
				.andWhere("(IFNULL(ads.dailyEdits + ads.editsToDate, 0) + IFNULL(ads.dailyServiceAwardLogEvents + ads.serviceAwardLogEventsToDate, 0)) >= 50")
				.andWhere("IFNULL(ads.dailyActiveDay + ads.activeDaysToDate, 0) > 0");

			const data: ActorWithServiceAwardStatistics[] = await query.getRawMany();
			data.sort((a, b) =>
				(a.actorName ?? "").localeCompare(b.actorName ?? ""));

			const timestampAsString = moment.utc().format("YYYY-MM-DD HH:mm:ss");

			let moduleContent = "-- "
				+ format(
					getLocalizedString(this.localizationLanguage, "serviceAward.moduleData.preamble"),
					"https://wiki-stat-portal.toolforge.org/",
					timestampAsString)
				+ "\n\nreturn {\n";

			for (const ele of data) {
				const activeDays = ele.activeDays;
				const editsAndLogEvents = ele.edits + ele.logEvents;
				let currentLevelIndex = this.getUserLevel(activeDays, editsAndLogEvents);
				if (currentLevelIndex !== -1)
					currentLevelIndex += 1;

				moduleContent += `	["${ele.actorName.replace(/"/, "\\\"")}"] = { ${currentLevelIndex}, ${ele.activeDays}, ${ele.edits}, ${ele.logEvents} },\n`;
			}

			moduleContent += "}\n";

			const bot = new WikiBot(this.wiki, this.logger);
			if (await bot.login()) {
				bot.updatePage(
					this.wiki.serviceAwardPageName,
					moduleContent,
					`Frissítés a WikiStatPortálról (${timestampAsString})`);
			}
		});
	}

	private getUserLevel(activeDays: number, editsAndLogEvents: number): number {
		if (this.wiki.serviceAwardLevels.length === 0)
			return -1;

		let ret: number = -1;

		for (let i = 0; i < this.wiki.serviceAwardLevels.length; i++) {
			const level = this.wiki.serviceAwardLevels[i];

			if (activeDays >= level.requiredActiveDays
				&& editsAndLogEvents >= level.requiredContributions
			) {
				ret = i;
			} else {
				break;
			}
		}

		return ret;
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
			editsByNamespace: [],
			editsByChangeTag: [],
			editsByNamespaceAndChangeTag: [],
			logEntriesByType: [],
			logEntriesByAction: [],
			logEntriesByTypeAndAction: [],
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
			editsByNamespace: [],
			editsByChangeTag: [],
			editsByNamespaceAndChangeTag: [],
			logEntriesByType: [],
			logEntriesByAction: [],
			logEntriesByTypeAndAction: [],
		};
	}
}

function createDailyStatistics(date: moment.Moment, dailyStatistics: Omit<Partial<DailyStatistics>, "date">): DailyStatistics {
	return {
		date: date,
		edits: dailyStatistics.edits ?? 0,
		revertedEdits: dailyStatistics.revertedEdits ?? 0,
		characterChanges: dailyStatistics.characterChanges ?? 0,
		sentThanks: dailyStatistics.sentThanks ?? 0,
		receivedThanks: dailyStatistics.receivedThanks ?? 0,
		logEvents: dailyStatistics.logEvents ?? 0,
		serviceAwardLogEvents: dailyStatistics.serviceAwardLogEvents ?? 0,
	};
}
