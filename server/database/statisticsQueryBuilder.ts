import { isDate, round } from "lodash";
import moment from "moment";
import { Connection, SelectQueryBuilder } from "typeorm";
import { FLAGLESS_BOT_VIRTUAL_GROUP_NAME } from "../../common/consts";
import { UserGroup, UserRequirements, UserStatisticsInPeriodRequirement, UserStatisticsInTimeRequirement } from "../../common/modules/commonConfiguration";
import { ChangeTagFilterDefinition, ListColumn, ListOrderBy, LogFilterDefinition } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { compareMoments, compareNumbers } from "../helpers/comparers";
import { KnownWiki } from "../interfaces/knownWiki";
import { ServiceAwardLevelDefinition } from "../interfaces/serviceAwardLevelDefinition";
import { ActorTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

const DATE_STRING_REGEX = new RegExp(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

type JoinedTableSubject =
	"wiki"
	| "actor";


type RequiredDates = {
	neededActorPeriodStarts: moment.Moment[];
	neededActorPeriodEnds: moment.Moment[];
	neededWikiPeriodStarts: moment.Moment[];
	neededWikiPeriodEnds: moment.Moment[];
};

type RequiredColumns = {
	neededDates: RequiredDates;
	needsSelectedPeriodActorStatistics: boolean;
	needsSelectedPeriodWikiStatistics: boolean;
	needsSinceRegisteredActorStatistics: boolean;
	needsSinceRegisteredWikiStatistics: boolean;
}


type NamespaceRequiredColumns = RequiredColumns & {
	namespace: number;
};

type LogTypeStatisticsRequiredColumns = RequiredColumns & {
	serializedLogFilter: string;
	logFilter: LogFilterDefinition;
	needsLastLogEntryDate: boolean;
};

type ChangeTagStatisticsRequiredColumns = RequiredColumns & {
	serializedChangeTagFilter: string;
	changeTagFilter: ChangeTagFilterDefinition;
};

class StatisticsQueryBuildingContext {
	public readonly conn: Connection;
	public readonly wiki: KnownWiki;
	public readonly wikiEntities: WikiStatisticsTypesResult;
	public readonly userRequirements: UserRequirements | undefined;
	public readonly columns: ListColumn[] | undefined;
	public readonly orderBy: ListOrderBy[] | undefined;
	public readonly itemCount: number | undefined;
	public readonly startDate: moment.Moment | undefined;
	public readonly endDate: moment.Moment;
	public readonly skipBotsFromCounting: boolean;
	public requiredColumns: RequiredColumns & {
		requiredNamespaceStatisticsColumns: NamespaceRequiredColumns[];
		requiredLogTypeStatisticsColumns: LogTypeStatisticsRequiredColumns[];
		requiredChangeTagStatisticsColumns: ChangeTagStatisticsRequiredColumns[];
		neededLevelDates: moment.Moment[];
	};
	public actorGroups: Map<number, string[]>;

	constructor(params: CreateStatisticsQueryParameters) {
		this.conn = params.toolsDbConnection;
		this.wiki = params.wiki;
		this.wikiEntities = params.wikiEntities;
		this.columns = params.columns;
		this.userRequirements = params.userRequirements;
		this.orderBy = params.orderBy;
		this.itemCount = params.itemCount;
		this.startDate = params.startDate;
		this.endDate = params.endDate;
		this.skipBotsFromCounting = params.skipBotsFromCounting ?? false;
		this.requiredColumns = {
			neededDates: {
				neededActorPeriodStarts: [],
				neededActorPeriodEnds: [],
				neededWikiPeriodStarts: [],
				neededWikiPeriodEnds: []
			},
			needsSelectedPeriodActorStatistics: false,
			needsSelectedPeriodWikiStatistics: false,

			needsSinceRegisteredActorStatistics: false,
			needsSinceRegisteredWikiStatistics: false,

			requiredNamespaceStatisticsColumns: [],
			requiredLogTypeStatisticsColumns: [],
			requiredChangeTagStatisticsColumns: [],

			neededLevelDates: [],
		};

	}
}

export interface ActorLike {
	actorId: number;
	actorName?: string;
	actorGroups?: string[];
}

export interface ActorResult {
	actorId: number;
	name?: string;
	groups?: string[];
	columnData?: unknown[];
}

interface CreateStatisticsQueryParameters {
	appCtx: AppRunningContext;
	toolsDbConnection: Connection;
	wiki: KnownWiki;
	wikiEntities: WikiStatisticsTypesResult;
	userRequirements: UserRequirements | undefined;
	columns?: ListColumn[];
	orderBy?: ListOrderBy[];
	itemCount?: number;
	startDate?: moment.Moment;
	endDate: moment.Moment;
	skipBotsFromCounting?: boolean;
}

export async function createStatisticsQuery(params: CreateStatisticsQueryParameters): Promise<ActorResult[]> {
	const { appCtx, columns, orderBy } = params;

	const ctx: StatisticsQueryBuildingContext = new StatisticsQueryBuildingContext(params);

	await fetchActorGroups(ctx);

	const query = createQuery(ctx);

	appCtx.logger.info(`[createStatisticsQuery] SQL: ${query.getSql()}`);

	if (columns && columns.length > 0) {

		let data: ActorLike[] = await query.getRawMany();

		appCtx.logger.info(`[createStatisticsQuery] Got result (${data.length}), sorting if needed...`);

		updateCalculatedColums(ctx, data);
		data = doAdditionalFiltering(ctx, data);
		doOrderBy(data, columns, orderBy);

		appCtx.logger.info("[createStatisticsQuery] Sorting completed.");

		const actorResults = createActorResultSet(ctx, data);

		appCtx.logger.info(`[createStatisticsQuery] Returning ${data.length} items.`);

		return actorResults;
	} else {
		return await query.getRawMany<{ actorId: number }>();
	}
}

function createQuery(ctx: StatisticsQueryBuildingContext) {
	const { conn, wikiEntities, columns, userRequirements, startDate, endDate } = ctx;

	let query = conn.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "actorId")
		.addSelect("actor.actorName", "actorName");

	collectColumnJoinInformation(ctx);

	// Manage selects from column definitions
	query = addColumSelects(ctx, query, wikiEntities, columns, startDate, endDate);

	// Manage required joins
	query = addUserRequirementJoins(ctx, query, wikiEntities, userRequirements, startDate, endDate);
	query = addServiceAwardLevelColumnSelects(query, ctx);
	query = addColumnJoins(ctx, query, wikiEntities, columns, startDate, endDate);

	// Manage required filterings
	query = addUserRequirementFilters(query, wikiEntities, userRequirements, startDate, endDate);
	query = addColumnSelfFilterRules(query, columns);
	return query;
}

function collectColumnJoinInformation(ctx: StatisticsQueryBuildingContext) {
	if (!ctx.columns || ctx.columns.length === 0)
		return;
	for (const column of ctx.columns) {
		collectSingleColumnJoinInformation(ctx, column);
	}
}

function collectSingleColumnJoinInformation(ctx: StatisticsQueryBuildingContext, column: ListColumn) {
	const { startDate, endDate } = ctx;

	switch (column.type) {
		case "editsInPeriod":
		case "revertedEditsInPeriod":
		case "revertedEditsInPeriodPercentageToOwnTotalEdits":
		case "characterChangesInPeriod":
		case "receivedThanksInPeriod":
		case "sentThanksInPeriod":
		case "logEventsInPeriod":
		case "editsSinceRegistrationMilestone":
		case "revertedEditsSinceRegistrationMilestone":
		case "characterChangesSinceRegistrationMilestone":
		case "receivedThanksSinceRegistrationMilestone":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "editsInPeriodPercentageToWikiTotal":
		case "revertedEditsInPeriodPercentageToWikiTotal":
		case "characterChangesInPeriodPercentageToWikiTotal":
		case "receivedThanksInPeriodPercentageToWikiTotal":
		case "sentThanksInPeriodPercentageToWikiTotal":
		case "logEventsInPeriodPercentageToWikiTotal":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			ctx.requiredColumns.needsSelectedPeriodWikiStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededWikiPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededWikiPeriodEnds, endDate);
			break;

		case "editsSinceRegistration":
		case "revertedEditsSinceRegistration":
		case "revertedEditsSinceRegistrationPercentageToOwnTotalEdits":
		case "characterChangesSinceRegistration":
		case "receivedThanksSinceRegistration":
		case "sentThanksSinceRegistration":
		case "logEventsSinceRegistration":
			ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "editsSinceRegistrationPercentageToWikiTotal":
		case "revertedEditsSinceRegistrationPercentageToWikiTotal":
		case "characterChangesSinceRegistrationPercentageToWikiTotal":
		case "receivedThanksSinceRegistrationPercentageToWikiTotal":
		case "sentThanksSinceRegistrationPercentageToWikiTotal":
		case "logEventsSinceRegistrationPercentageToWikiTotal":
			ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
			ctx.requiredColumns.needsSinceRegisteredWikiStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededWikiPeriodEnds, endDate);
			break;

		case "editsInNamespaceInPeriod":
		case "editsInNamespaceInPeriodPercentageToOwnTotalEdits":
		case "revertedEditsInNamespaceInPeriod":
		case "revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits":
		case "characterChangesInNamespaceInPeriod": {
			for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
				namespaceCollector.needsSelectedPeriodActorStatistics = true;
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodEnds, endDate);
			}

			if (column.type === "editsInNamespaceInPeriodPercentageToOwnTotalEdits"
				|| column.type === "revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits") {
				ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}
		case "editsInNamespaceInPeriodPercentageToWikiTotal":
		case "revertedEditsInNamespaceInPeriodPercentageToWikiTotal":
		case "characterChangesInNamespaceInPeriodPercentageToWikiTotal": {
			for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
				namespaceCollector.needsSelectedPeriodActorStatistics = true;
				namespaceCollector.needsSelectedPeriodWikiStatistics = true;
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodEnds, endDate);
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededWikiPeriodStarts, startDate);
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededWikiPeriodEnds, endDate);
			}
			break;
		}
		case "editsInNamespaceSinceRegistration":
		case "editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits":
		case "revertedEditsInNamespaceSinceRegistration":
		case "revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits":
		case "characterChangesInNamespaceSinceRegistration": {
			for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
				namespaceCollector.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodEnds, endDate);
			}

			if (column.type === "editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits") {
				ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			}

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentageToWikiTotal":
		case "revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal":
		case "characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal": {
			for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
				namespaceCollector.needsSinceRegisteredActorStatistics = true;
				namespaceCollector.needsSinceRegisteredWikiStatistics = true;
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodEnds, endDate);
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededWikiPeriodEnds, endDate);
			}

			break;
		}

		case "editsInPeriodByChangeTag":
		case "characterChangesInPeriodByChangeTag": {
			for (const ct of Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag]) {
				const ctCollector = getOrCreateChangeTagCollector(ctx, ct);
				ctCollector.needsSelectedPeriodActorStatistics = true;
				addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}

		case "editsSinceRegistrationByChangeTag":
		case "characterChangesSinceRegistrationByChangeTag": {
			for (const ct of Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag]) {
				const ctCollector = getOrCreateChangeTagCollector(ctx, ct);
				ctCollector.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}

		case "lastEditDateInNamespace": {
			for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
				namespaceCollector.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(namespaceCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}

		case "averageEditsPerDayInPeriod":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			break;
		case "averageEditsPerDaySinceRegistration":
			ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "logEventsInPeriodByType": {
			for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
				const logTypeCollector = getOrCreateLogTypeCollector(ctx, logFilter);
				logTypeCollector.needsSelectedPeriodActorStatistics = true;
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}
		case "logEventsSinceRegistrationByType": {
			for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
				const logTypeCollector = getOrCreateLogTypeCollector(ctx, logFilter);
				logTypeCollector.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}
		case "lastLogEventDateByType": {
			for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
				const logTypeCollector = getOrCreateLogTypeCollector(ctx, logFilter);
				logTypeCollector.needsLastLogEntryDate = true;
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}

		case "activeDaysInPeriod":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "levelAtPeriodStart":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
			if (startDate) {
				ctx.requiredColumns.neededLevelDates.push(startDate);
			}
			break;

		case "levelAtPeriodEnd":
		case "levelSortOrder":
			ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			ctx.requiredColumns.neededLevelDates.push(endDate);
			break;

		case "levelAtPeriodEndWithChange":
			ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
			ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
			addNeededPeriodToCollection(ctx.requiredColumns.neededLevelDates, endDate);

			if (startDate) {
				addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
				addNeededPeriodToCollection(ctx.requiredColumns.neededLevelDates, startDate);
			}
			break;
	}
}

function addUserRequirementJoins(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	if (!userRequirements) {
		return query;
	}

	if ((typeof userRequirements.inAnyUserGroups !== "undefined" && userRequirements.inAnyUserGroups.length > 0)
		|| (typeof userRequirements.inAllUserGroups !== "undefined" && userRequirements.inAllUserGroups.length > 0)
		|| (typeof userRequirements.notInAnyUserGroups !== "undefined" && userRequirements.notInAnyUserGroups.length > 0)
		|| (typeof userRequirements.notInAllUserGroups !== "undefined" && userRequirements.notInAllUserGroups.length > 0)) {
		const allMentionedUserGroups = new Set<UserGroup>([
			...(userRequirements.inAnyUserGroups ?? []),
			...(userRequirements.inAllUserGroups ?? []),
			...(userRequirements.notInAnyUserGroups || []),
			...(userRequirements.notInAllUserGroups || []),
		]);

		for (const userGroup of allMentionedUserGroups) {
			const sanitizedGroupName = sanitizeNameForSql(userGroup);
			query = query.leftJoin(
				wikiEntities.actorGroup,
				`${sanitizedGroupName}GroupCheck`,
				`${sanitizedGroupName}GroupCheck.actorId = actor.actorId AND ${sanitizedGroupName}GroupCheck.groupName = :${sanitizedGroupName}GroupName`,
				{ [`${sanitizedGroupName}GroupName`]: userGroup }
			);
		}
	}

	for (const ele of [
		userRequirements.totalEditsAtLeast,
		userRequirements.totalEditsAtMost,
		userRequirements.totalRevertedEditsAtLeast,
		userRequirements.totalRevertedEditsAtMost,
		userRequirements.totalReceivedThanksAtLeast,
		userRequirements.totalReceivedThanksAtMost,
		userRequirements.totalActiveDaysAtLeast,
		userRequirements.totalActiveDaysAtMost,
	]) {
		if (!ele)
			continue;

		const epochDate = typeof ele === "number" ? endDate
			: ele.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
				: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		ctx.requiredColumns.needsSinceRegisteredActorStatistics = true;
		addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, epochDate);
	}

	for (const ele of [
		userRequirements.inPeriodEditsAtLeast,
		userRequirements.inPeriodEditsAtMost,
		userRequirements.inPeriodRevertedEditsAtLeast,
		userRequirements.inPeriodRevertedEditsAtMost,
		userRequirements.inPeriodReceivedThanksAtLeast,
		userRequirements.inPeriodReceivedThanksAtMost,
		userRequirements.inPeriodActiveDaysAtLeast,
		userRequirements.inPeriodActiveDaysAtMost
	]) {
		if (!ele)
			continue;

		const periodStatCalculationStartDate = typeof ele === "number" ? startDate
			: ele.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(ele.period, "days")
				: typeof ele.epoch === "number" ? moment.utc(endDate).subtract(ele.period + ele.epoch * -1, "days")
					: moment.utc(endDate).subtract(ele.period, "days");
		const periodStatCalculationEndDate = typeof ele === "number" || typeof ele.epoch !== "number" ? endDate
			: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
		addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, periodStatCalculationStartDate);
		addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, periodStatCalculationEndDate);
	}

	for (const ele of [
		userRequirements.totalEditsMilestoneReachedInPeriod,
		userRequirements.totalRevertedEditsMilestoneReachedInPeriod,
		userRequirements.totalReceivedThanksMilestoneReachedInPeriod,
		userRequirements.totalActiveDaysMilestoneReachedInPeriod,
	]) {
		if (!ele)
			continue;

		ctx.requiredColumns.needsSelectedPeriodActorStatistics = true;
		addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodStarts, startDate);
		addNeededPeriodToCollection(ctx.requiredColumns.neededDates.neededActorPeriodEnds, endDate);
	}

	for (const ele of [
		userRequirements.totalEditsInNamespaceAtLeast,
		userRequirements.totalEditsInNamespaceAtMost
	]) {
		if (!ele)
			continue;

		const epochDate = ele.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
			: typeof ele.epoch !== "number" ? endDate
				: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		for (const ct of Array.isArray(ele.namespace) ? ele.namespace : [ele.namespace]) {
			const ctCollector = getOrCreateNamespaceCollector(ctx, ct);
			ctCollector.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, epochDate);
		}
	}

	for (const ele of [
		userRequirements.inPeriodEditsInNamespaceAtLeast,
		userRequirements.inPeriodEditsInNamespaceAtMost
	]) {
		if (!ele)
			continue;

		const periodStatCalculationStartDate = typeof ele.period !== "number" ? startDate
			: ele.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(ele.period, "days")
				: typeof ele.epoch === "number" ? moment.utc(endDate).subtract(ele.period + ele.epoch * -1, "days")
					: moment.utc(endDate).subtract(ele.period, "days");

		const periodStatCalculationEndDate = typeof ele.epoch !== "number" ? endDate
			: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		for (const ct of Array.isArray(ele.namespace) ? ele.namespace : [ele.namespace]) {
			const ctCollector = getOrCreateNamespaceCollector(ctx, ct);
			ctCollector.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodStarts, periodStatCalculationStartDate);
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, periodStatCalculationEndDate);
		}
	}

	for (const ele of [
		userRequirements.totalEditsWithChangeTagAtLeast,
		userRequirements.totalEditsWithChangeTagAtMost
	]) {
		if (!ele)
			continue;

		const epochDate = typeof ele.epoch !== "number"
			? endDate
			: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		for (const ct of Array.isArray(ele.changeTag) ? ele.changeTag : [ele.changeTag]) {
			const ctCollector = getOrCreateChangeTagCollector(ctx, ct);
			ctCollector.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, epochDate);
		}
	}

	for (const ele of [
		userRequirements.inPeriodEditsWithChangeTagAtLeast,
		userRequirements.inPeriodEditsWithChangeTagAtMost
	]) {
		if (!ele)
			continue;

		const periodStatCalculationStartDate = typeof ele.period !== "number" ? startDate
			: ele.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(ele.period, "days")
				: typeof ele.epoch === "number" ? moment.utc(endDate).subtract(ele.period + ele.epoch * -1, "days")
					: moment.utc(endDate).subtract(ele.period, "days");

		const periodStatCalculationEndDate = typeof ele.epoch !== "number" ? endDate
			: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		for (const ct of Array.isArray(ele.changeTag) ? ele.changeTag : [ele.changeTag]) {
			const ctCollector = getOrCreateChangeTagCollector(ctx, ct);
			ctCollector.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodStarts, periodStatCalculationStartDate);
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, periodStatCalculationEndDate);
		}
	}

	if (userRequirements.serviceAwardLevel) {
		ctx.requiredColumns.neededLevelDates.push(endDate);

		if (userRequirements.serviceAwardLevel === "hasLevelAndChanged" && startDate) {
			ctx.requiredColumns.neededLevelDates.push(startDate);
		}
	}

	return query;
}

function addUserRequirementFilters(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	if (!userRequirements) {
		return query;
	}

	query = generateRegistrationUserRequirementWhereClauses(query, userRequirements, endDate);

	// User groups
	query = generateUserGroupUserRequirementWhereClauses(query, userRequirements);

	query = generateUserPageTemplateUserRequirementWhereClauses(query, userRequirements, wikiEntities);

	query = generateEditUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	query = generateNamespaceEditUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	query = generateChangeTagEditUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	query = generateRevertedEditUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	query = generateReceivedThanksUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	query = generateActiveDaysUserRequirementWhereClauses(query, userRequirements, startDate, endDate);

	return query;
}

function generateRegistrationUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	endDate: moment.Moment
) {
	let needsRegDateFilter = false;
	// Registration status filter
	if (userRequirements.registrationStatus === "anon") {
		query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 0 });
	} else if (userRequirements.registrationStatus === "registered") {
		query = query.andWhere("actor.isRegistered = :isRegistered", { isRegistered: 1 });
		needsRegDateFilter = true;
	}

	// Registration age at least
	if (typeof userRequirements.registrationAgeAtLeast === "number") {
		query = query.andWhere(
			"DATEDIFF(:endDate, actor.registrationTimestamp) >= :registrationAgeAtLeast",
			{ endDate: endDate.toDate(), registrationAgeAtLeast: userRequirements.registrationAgeAtLeast }
		);
		needsRegDateFilter = true;
	}

	// Registration age at most
	if (typeof userRequirements.registrationAgeAtMost === "number") {
		query = query.andWhere(
			"DATEDIFF(:endDate, actor.registrationTimestamp) <= :registrationAgeAtMost",
			{ endDate: endDate.toDate(), registrationAgeAtMost: userRequirements.registrationAgeAtMost }
		);
		needsRegDateFilter = true;
	}

	if (needsRegDateFilter) {
		query = query.andWhere("actor.registrationTimestamp < :nextDate", { nextDate: moment.utc(endDate).add(1, "day").toDate() });
	}
	return query;
}

function generateUserGroupUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements
) {
	if (typeof userRequirements.inAnyUserGroups !== "undefined") {
		const userGroups = userRequirements.inAnyUserGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId IS NOT NULL`;
			}).join(" OR ")
			+ ")");
	}

	if (typeof userRequirements.inAllUserGroups !== "undefined") {
		const userGroups = userRequirements.inAllUserGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId IS NOT NULL`;
			}).join(" AND ")
			+ ")");
	}

	// Not in user groups
	if (typeof userRequirements.notInAnyUserGroups !== "undefined") {
		const userGroups = userRequirements.notInAnyUserGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId IS NULL`;
			}).join(" OR ")
			+ ")");
	}

	if (typeof userRequirements.notInAllUserGroups !== "undefined") {
		const userGroups = userRequirements.notInAllUserGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId IS NULL`;
			}).join(" AND ")
			+ ")");
	}
	return query;
}

function generateUserPageTemplateUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	wikiEntities: WikiStatisticsTypesResult
) {
	// User page templates
	if (typeof userRequirements.hasAnyUserPageTemplates !== "undefined") {
		query = generateHasUserPageTemplatesWhereClause({
			query,
			checkedTemplateList: userRequirements.hasAnyUserPageTemplates,
			wikiEntities,
			isNonExistenceCheck: false,
			joinOperator: "or"
		});
	}

	if (typeof userRequirements.hasAllUserPageTemplates !== "undefined") {
		query = generateHasUserPageTemplatesWhereClause({
			query,
			checkedTemplateList: userRequirements.hasAllUserPageTemplates,
			wikiEntities,
			isNonExistenceCheck: false,
			joinOperator: "and"
		});
	}

	if (typeof userRequirements.notHasAnyUserPageTemplates !== "undefined") {
		query = generateHasUserPageTemplatesWhereClause({
			query,
			checkedTemplateList: userRequirements.notHasAnyUserPageTemplates,
			wikiEntities,
			isNonExistenceCheck: true,
			joinOperator: "or"
		});
	}

	if (typeof userRequirements.notHasAllUserPageTemplates !== "undefined") {
		query = generateHasUserPageTemplatesWhereClause({
			query,
			checkedTemplateList: userRequirements.notHasAllUserPageTemplates,
			wikiEntities,
			isNonExistenceCheck: true,
			joinOperator: "and"
		});
	}
	return query;
}

function generateEditUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total edits at least
	if (typeof userRequirements.totalEditsAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalEditsAtLeast, startDate, endDate);

		const totalEditsAtLeast = typeof userRequirements.totalEditsAtLeast === "number"
			? userRequirements.totalEditsAtLeast
			: userRequirements.totalEditsAtLeast.count;

		query = query.andWhere(
			`${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits >= :totalEditsAtLeast`,
			{ totalEditsAtLeast: totalEditsAtLeast }
		);
	}

	// Total edits at most
	if (typeof userRequirements.totalEditsAtMost !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalEditsAtMost, startDate, endDate);

		const totalEditsAtMost = typeof userRequirements.totalEditsAtMost === "number"
			? userRequirements.totalEditsAtMost
			: userRequirements.totalEditsAtMost.count;

		query = query.andWhere(
			`${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits <= :totalEditsAtMost`,
			{ totalEditsAtMost: totalEditsAtMost }
		);
	}

	// Total edits milestone reached in period
	if (typeof userRequirements.totalEditsMilestoneReachedInPeriod !== "undefined"
		&& userRequirements.totalEditsMilestoneReachedInPeriod.length > 0
		&& typeof startDate !== "undefined") {
		const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

		const whereParameters: { [index: string]: unknown; } = {};
		query = query.andWhere(
			"(" + userRequirements.totalEditsMilestoneReachedInPeriod.map((milestone, index) => {
				const milestoneParameterKey = `totalEditsMilestone${index}`;
				whereParameters[milestoneParameterKey] = milestone;
				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) >= :${milestoneParameterKey}`
					+ ` AND IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0) < :${milestoneParameterKey}`;
			}).join(" OR ") + ")",
			whereParameters
		);
	}


	// Period edits at least
	if (typeof userRequirements.inPeriodEditsAtLeast !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodEditsAtLeast, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`
			+ ` - IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{
				inPeriodEditsAtLeast: typeof userRequirements.inPeriodEditsAtLeast === "number"
					? userRequirements.inPeriodEditsAtLeast
					: userRequirements.inPeriodEditsAtLeast.count
			}
		);
	}

	// Period edits at most
	if (typeof userRequirements.inPeriodEditsAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodEditsAtMost, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`
			+ ` - IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`
			+ " <= :inPeriodEditsAtMost",
			{
				inPeriodEditsAtMost: typeof userRequirements.inPeriodEditsAtMost === "number"
					? userRequirements.inPeriodEditsAtMost
					: userRequirements.inPeriodEditsAtMost.count
			}
		);
	}
	return query;
}

function generateNamespaceEditUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total edits in namespace at least
	if (typeof userRequirements.totalEditsInNamespaceAtLeast !== "undefined") {
		const totalReq = userRequirements.totalEditsInNamespaceAtLeast;
		const namespaces = Array.isArray(userRequirements.totalEditsInNamespaceAtLeast.namespace)
			? userRequirements.totalEditsInNamespaceAtLeast.namespace
			: [userRequirements.totalEditsInNamespaceAtLeast.namespace];

		query = query.andWhere(
			namespaces.map(ns => {
				const totalEditsEpochDate = totalReq.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
					: typeof totalReq.epoch !== "number" ? endDate
						: moment.utc(endDate).subtract(totalReq.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "actor", `Ns${formatNamespaceParameter(ns)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + ") + " >= :totalEditsInNamespaceAtLeast",
			{ totalEditsInNamespaceAtLeast: userRequirements.totalEditsInNamespaceAtLeast.edits });
	}

	// Total edits in namespace at most
	if (typeof userRequirements.totalEditsInNamespaceAtMost !== "undefined") {
		const totalReq = userRequirements.totalEditsInNamespaceAtMost;
		const namespaces = Array.isArray(userRequirements.totalEditsInNamespaceAtMost.namespace)
			? userRequirements.totalEditsInNamespaceAtMost.namespace
			: [userRequirements.totalEditsInNamespaceAtMost.namespace];

		query = query.andWhere(
			namespaces.map(ns => {
				const totalEditsEpochDate = totalReq.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
					: typeof totalReq.epoch !== "number" ? endDate
						: moment.utc(endDate).subtract(totalReq.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "actor", `Ns${formatNamespaceParameter(ns)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + ") + " <= :totalEditsInNamespaceAtMost",
			{ totalEditsInNamespaceAtMost: userRequirements.totalEditsInNamespaceAtMost.edits });
	}

	// Period edits in namespace at least
	if (typeof userRequirements.inPeriodEditsInNamespaceAtLeast !== "undefined") {
		const reqInPeriod = userRequirements.inPeriodEditsInNamespaceAtLeast;
		const namespaces = Array.isArray(userRequirements.inPeriodEditsInNamespaceAtLeast.namespace)
			? userRequirements.inPeriodEditsInNamespaceAtLeast.namespace
			: [userRequirements.inPeriodEditsInNamespaceAtLeast.namespace];

		query = query.andWhere(
			namespaces.map(ns => {
				const periodStatCalculationStartDate = typeof reqInPeriod.period !== "number" ? startDate
					: reqInPeriod.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(reqInPeriod.period, "days")
						: typeof reqInPeriod.epoch === "number" ? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
							: moment.utc(endDate).subtract(reqInPeriod.period, "days");
				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "actor", `Ns${formatNamespaceParameter(ns)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "actor", `Ns${formatNamespaceParameter(ns)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + ") + " <= :inPeriodEditsInNamespaceAtLeast",
			{ inPeriodEditsInNamespaceAtLeast: userRequirements.inPeriodEditsInNamespaceAtLeast.edits }
		);
	}

	// Period edits in namespace at most
	if (typeof userRequirements.inPeriodEditsInNamespaceAtMost !== "undefined") {
		const reqInPeriod = userRequirements.inPeriodEditsInNamespaceAtMost;
		const namespaces = Array.isArray(userRequirements.inPeriodEditsInNamespaceAtMost.namespace)
			? userRequirements.inPeriodEditsInNamespaceAtMost.namespace
			: [userRequirements.inPeriodEditsInNamespaceAtMost.namespace];

		query = query.andWhere(
			namespaces.map(ns => {
				const periodStatCalculationStartDate = typeof reqInPeriod.period !== "number" ? startDate
					: reqInPeriod.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(reqInPeriod.period, "days")
						: typeof reqInPeriod.epoch === "number" ? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
							: moment.utc(endDate).subtract(reqInPeriod.period, "days");

				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "actor", `Ns${formatNamespaceParameter(ns)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "actor", `Ns${formatNamespaceParameter(ns)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + ") + " <= :inPeriodEditsInNamespaceAtMost",
			{ inPeriodEditsInNamespaceAtMost: userRequirements.inPeriodEditsInNamespaceAtMost.edits }
		);
	}
	return query;
}

function generateChangeTagEditUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total edits with change tag at least
	if (typeof userRequirements.totalEditsWithChangeTagAtLeast !== "undefined") {
		const totalReq = userRequirements.totalEditsWithChangeTagAtLeast;
		const changeTags = Array.isArray(userRequirements.totalEditsWithChangeTagAtLeast.changeTag)
			? userRequirements.totalEditsWithChangeTagAtLeast.changeTag
			: [userRequirements.totalEditsWithChangeTagAtLeast.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const totalEditsEpochDate = totalReq.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
					: typeof totalReq.epoch !== "number" ? endDate
						: moment.utc(endDate).subtract(totalReq.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + ") + " >= :totalEditsWithChangeTagAtLeast",
			{ totalEditsWithChangeTagAtLeast: userRequirements.totalEditsWithChangeTagAtLeast.edits });
	}

	// Total edits with change tag at most
	if (typeof userRequirements.totalEditsWithChangeTagAtMost !== "undefined") {
		const totalReq = userRequirements.totalEditsWithChangeTagAtMost;
		const changeTags = Array.isArray(userRequirements.totalEditsWithChangeTagAtMost.changeTag)
			? userRequirements.totalEditsWithChangeTagAtMost.changeTag
			: [userRequirements.totalEditsWithChangeTagAtMost.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const totalEditsEpochDate = totalReq.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day")
					: typeof totalReq.epoch !== "number" ? endDate
						: moment.utc(endDate).subtract(totalReq.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + ") + " <= :totalEditsWithChangeTagAtMost",
			{ totalEditsWithChangeTagAtMost: userRequirements.totalEditsWithChangeTagAtMost.edits });
	}

	// Period edits with change tag at least
	if (typeof userRequirements.inPeriodEditsWithChangeTagAtLeast !== "undefined") {
		const reqInPeriod = userRequirements.inPeriodEditsWithChangeTagAtLeast;
		const changeTags = Array.isArray(userRequirements.inPeriodEditsWithChangeTagAtLeast.changeTag)
			? userRequirements.inPeriodEditsWithChangeTagAtLeast.changeTag
			: [userRequirements.inPeriodEditsWithChangeTagAtLeast.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const periodStatCalculationStartDate = typeof reqInPeriod.period !== "number" ? startDate
					: reqInPeriod.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(reqInPeriod.period, "days")
						: typeof reqInPeriod.epoch === "number" ? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
							: moment.utc(endDate).subtract(reqInPeriod.period, "days");
				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + ") + " <= :inPeriodEditsWithChangeTagAtLeast",
			{ inPeriodEditsWithChangeTagAtLeast: userRequirements.inPeriodEditsWithChangeTagAtLeast.edits }
		);
	}

	// Period edits with change tag at most
	if (typeof userRequirements.inPeriodEditsWithChangeTagAtMost !== "undefined") {
		const reqInPeriod = userRequirements.inPeriodEditsWithChangeTagAtMost;
		const changeTags = Array.isArray(userRequirements.inPeriodEditsWithChangeTagAtMost.changeTag)
			? userRequirements.inPeriodEditsWithChangeTagAtMost.changeTag
			: [userRequirements.inPeriodEditsWithChangeTagAtMost.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const periodStatCalculationStartDate = typeof reqInPeriod.period !== "number" ? startDate
					: reqInPeriod.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(reqInPeriod.period, "days")
						: typeof reqInPeriod.epoch === "number" ? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
							: moment.utc(endDate).subtract(reqInPeriod.period, "days");

				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + ") + " <= :inPeriodEditsWithChangeTagAtMost",
			{ inPeriodEditsWithChangeTagAtMost: userRequirements.inPeriodEditsWithChangeTagAtMost.edits }
		);
	}
	return query;
}

function generateRevertedEditUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total reverted edits at least
	if (typeof userRequirements.totalRevertedEditsAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalRevertedEditsAtLeast, startDate, endDate);

		const totalRevertedEditsAtLeast = typeof userRequirements.totalRevertedEditsAtLeast === "number"
			? userRequirements.totalRevertedEditsAtLeast
			: userRequirements.totalRevertedEditsAtLeast.count;

		query = query.andWhere(
			`${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits >= :totalRevertedEditsAtLeast`,
			{ totalRevertedEditsAtLeast: totalRevertedEditsAtLeast }
		);
	}

	// Total reverted edits at most
	if (typeof userRequirements.totalRevertedEditsAtMost !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalRevertedEditsAtMost, startDate, endDate);

		const totalRevertedEditsAtMost = typeof userRequirements.totalRevertedEditsAtMost === "number"
			? userRequirements.totalRevertedEditsAtMost
			: userRequirements.totalRevertedEditsAtMost.count;

		query = query.andWhere(
			`${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits <= :totalRevertedEditsAtMost`,
			{ totalRevertedEditsAtMost: totalRevertedEditsAtMost }
		);
	}

	// Total reverted edits milestone reached in period
	if (typeof userRequirements.totalRevertedEditsMilestoneReachedInPeriod !== "undefined"
		&& userRequirements.totalRevertedEditsMilestoneReachedInPeriod.length > 0
		&& typeof startDate !== "undefined") {
		const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

		const whereParameters: { [index: string]: unknown; } = {};
		query = query.andWhere(
			"(" + userRequirements.totalEditsMilestoneReachedInPeriod.map((milestone, index) => {
				const milestoneParameterKey = `totalRevertedEditsMilestone${index}`;
				whereParameters[milestoneParameterKey] = milestone;
				return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) >= :${milestoneParameterKey}`
					+ `AND IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0) < :${milestoneParameterKey}`;
			}).join(" OR ") + ")",
			whereParameters
		);
	}

	// Period reverted edits at least
	if (typeof userRequirements.inPeriodRevertedEditsAtLeast !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodRevertedEditsAtLeast, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`
			+ " >= :inPeriodRevertedEditsAtLeast",
			{
				inPeriodRevertedEditsAtLeast: typeof userRequirements.inPeriodRevertedEditsAtLeast === "number"
					? userRequirements.inPeriodRevertedEditsAtLeast
					: userRequirements.inPeriodRevertedEditsAtLeast.count
			}
		);
	}

	// Period reverted edits at most
	if (typeof userRequirements.inPeriodRevertedEditsAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodRevertedEditsAtMost, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{
				inPeriodRevertedEditsAtMost: typeof userRequirements.inPeriodRevertedEditsAtMost === "number"
					? userRequirements.inPeriodRevertedEditsAtMost
					: userRequirements.inPeriodRevertedEditsAtMost.count
			}
		);
	}
	return query;
}

function generateReceivedThanksUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total received thanks at least
	if (typeof userRequirements.totalReceivedThanksAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalReceivedThanksAtLeast, startDate, endDate);

		const totalReceivedThanksAtLeast = typeof userRequirements.totalReceivedThanksAtLeast === "number"
			? userRequirements.totalReceivedThanksAtLeast
			: userRequirements.totalReceivedThanksAtLeast.count;

		query = query.andWhere(
			`${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks >= :totalReceivedThanksAtLeast`,
			{ totalReceivedThanksAtLeast: totalReceivedThanksAtLeast }
		);
	}

	// Total received thanks at most
	if (typeof userRequirements.totalReceivedThanksAtMost !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalReceivedThanksAtMost, startDate, endDate);

		const totalReceivedThanksAtMost = typeof userRequirements.totalReceivedThanksAtMost === "number"
			? userRequirements.totalReceivedThanksAtMost
			: userRequirements.totalReceivedThanksAtMost.count;

		query = query.andWhere(
			`${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks <= :totalReceivedThanksAtMost`,
			{ totalReceivedThanksAtMost: totalReceivedThanksAtMost }
		);
	}

	// Total received thanks milestone reached in period
	if (typeof userRequirements.totalReceivedThanksMilestoneReachedInPeriod !== "undefined"
		&& userRequirements.totalReceivedThanksMilestoneReachedInPeriod.length > 0
		&& typeof startDate !== "undefined") {
		const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

		const whereParameters: { [index: string]: unknown; } = {};
		query = query.andWhere(
			"(" + userRequirements.totalReceivedThanksMilestoneReachedInPeriod.map((milestone, index) => {
				const milestoneParameterKey = `totalReceivedThanksMilestone${index}`;
				whereParameters[milestoneParameterKey] = milestone;
				return `IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) >= :${milestoneParameterKey}`
					+ `AND IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0) < :${milestoneParameterKey}`;
			}).join(" OR ") + ")",
			whereParameters
		);
	}

	// Period received thanks at least
	if (typeof userRequirements.inPeriodReceivedThanksAtLeast !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodReceivedThanksAtLeast, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
			+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`
			+ " >= :inPeriodReceivedThanksAtLeast",
			{
				inPeriodReceivedThanksAtLeast: typeof userRequirements.inPeriodReceivedThanksAtLeast === "number"
					? userRequirements.inPeriodReceivedThanksAtLeast
					: userRequirements.inPeriodReceivedThanksAtLeast.count
			}
		);
	}

	// Period received thanks at most
	if (typeof userRequirements.inPeriodReceivedThanksAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodReceivedThanksAtMost, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
			+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{
				inPeriodReceivedThanksAtMost: typeof userRequirements.inPeriodReceivedThanksAtMost === "number"
					? userRequirements.inPeriodReceivedThanksAtMost
					: userRequirements.inPeriodReceivedThanksAtMost.count
			}
		);
	}
	return query;
}

function generateActiveDaysUserRequirementWhereClauses(
	query: SelectQueryBuilder<ActorTypeModel>,
	userRequirements: UserRequirements,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	// Total active days at least
	if (typeof userRequirements.totalActiveDaysAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalActiveDaysAtLeast, startDate, endDate);

		const totalActiveDaysAtLeast = typeof userRequirements.totalActiveDaysAtLeast === "number"
			? userRequirements.totalActiveDaysAtLeast
			: userRequirements.totalActiveDaysAtLeast.count;

		query = query.andWhere(
			`${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay >= :totalActiveDaysAtLeast`,
			{ totalActiveDaysAtLeast: totalActiveDaysAtLeast }
		);
	}

	// Total active days at most
	if (typeof userRequirements.totalActiveDaysAtMost !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalActiveDaysAtMost, startDate, endDate);

		const totalActiveDaysAtMost = typeof userRequirements.totalActiveDaysAtMost === "number"
			? userRequirements.totalActiveDaysAtMost
			: userRequirements.totalActiveDaysAtMost.count;

		query = query.andWhere(
			`${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay <= :totalActiveDaysAtMost`,
			{ totalActiveDaysAtMost: totalActiveDaysAtMost }
		);
	}

	// Total active days milestone reached in period
	if (typeof userRequirements.totalActiveDaysMilestoneReachedInPeriod !== "undefined"
		&& userRequirements.totalActiveDaysMilestoneReachedInPeriod.length > 0
		&& typeof startDate !== "undefined") {
		const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

		const whereParameters: { [index: string]: unknown; } = {};
		query = query.andWhere(
			"(" + userRequirements.totalActiveDaysMilestoneReachedInPeriod.map((milestone, index) => {
				const milestoneParameterKey = `totalActiveDaysMilestone${index}`;
				whereParameters[milestoneParameterKey] = milestone;
				return `IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) >= :${milestoneParameterKey}`
					+ `AND IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0) < :${milestoneParameterKey}`;
			}).join(" OR ") + ")",
			whereParameters
		);
	}

	// Period active days at least
	if (typeof userRequirements.inPeriodActiveDaysAtLeast !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodActiveDaysAtLeast, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
			+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`
			+ " >= :inPeriodActiveDaysAtLeast",
			{
				inPeriodActiveDaysAtLeast: typeof userRequirements.inPeriodActiveDaysAtLeast === "number"
					? userRequirements.inPeriodActiveDaysAtLeast
					: userRequirements.inPeriodActiveDaysAtLeast.count
			}
		);
	}

	// Period active days at most
	if (typeof userRequirements.inPeriodActiveDaysAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodActiveDaysAtMost, startDate, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
			+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{
				inPeriodActiveDaysAtMost: typeof userRequirements.inPeriodActiveDaysAtMost === "number"
					? userRequirements.inPeriodActiveDaysAtMost
					: userRequirements.inPeriodActiveDaysAtMost.count
			}
		);
	}
	return query;
}

function generateHasUserPageTemplatesWhereClause(opts: {
	query: SelectQueryBuilder<ActorTypeModel>,
	checkedTemplateList: string[],
	wikiEntities: WikiStatisticsTypesResult,
	isNonExistenceCheck: boolean,
	joinOperator: "and" | "or"
}) {
	return opts.query.andWhere(qb => {
		const subQuery = opts.checkedTemplateList.map((templateName, templateIndex): string => {
			const singleTemplateQuery = qb.subQuery()
				.select("1")
				.from(opts.wikiEntities.actorUserPageTemplate, "att")
				.innerJoin(
					opts.wikiEntities.template,
					"tmpl",
					"tmpl.templatePageId = att.templatePageId "
				)
				.where("att.actorId = actor.actorId")
				.andWhere(
					`tmpl.templateName = :hasAnyUserPageTemplate${templateIndex}Name`,
					{ [`hasAnyUserPageTemplate${templateIndex}Name`]: templateName }
				)
				.getQuery();

			if (opts.isNonExistenceCheck)
				return `NOT EXISTS(${singleTemplateQuery})`;

			return `EXISTS(${singleTemplateQuery})`;
		}).join(opts.joinOperator === "and" ? " AND " : " OR ");

		return `(${subQuery})`;
	});
}

function getTableNameForUserTotalRequirement(
	req: number | UserStatisticsInTimeRequirement,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
) {
	let date: moment.Moment;
	if (typeof req === "number") {
		date = endDate;
	} else if (req.epoch === "startOfSelectedPeriod") {
		if (typeof startDate === "undefined")
			return null;

		date = moment.utc(startDate).subtract(1, "day");
	} else {
		date = moment.utc(endDate).subtract(req.epoch * -1, "days");
	}

	const actorEndTableName = makePeriodJoinTableName(date, "actor");
	return actorEndTableName;
}

function getTableNamesForUserPeriodRequirement(
	reqInPeriod: number | UserStatisticsInPeriodRequirement,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment,
	prefix = ""
) {
	const periodStatCalculationStartDate = typeof reqInPeriod === "number" ? startDate
		: reqInPeriod.epoch === "startOfSelectedPeriod" ? moment.utc(startDate).subtract(1, "day").subtract(reqInPeriod.period, "days")
			: typeof reqInPeriod.epoch === "number" ? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
				: moment.utc(endDate).subtract(reqInPeriod.period, "days");

	const periodStatCalculationEndDate = typeof reqInPeriod === "number" || typeof reqInPeriod.epoch !== "number"
		? endDate
		: moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days");

	const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "actor", prefix);
	const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "actor", prefix);

	return { actorEndTableName, actorStartTableName };
}

function addColumnSelfFilterRules(
	query: SelectQueryBuilder<ActorTypeModel>,
	columns: ListColumn[] | undefined
): SelectQueryBuilder<ActorTypeModel> {
	if (!columns) {
		return query;
	}

	let columnIndex = 0;
	for (const column of columns) {
		if (!column.filterByRule) {
			columnIndex++;
			continue;
		}

		if (column.filterByRule === "moreThanZero") {
			query = query.andHaving(`column${columnIndex} > 0`);
		}

		columnIndex++;
	}

	return query;
}


function addColumSelects(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	columns: ListColumn[] | undefined,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
): SelectQueryBuilder<ActorTypeModel> {
	if (!columns || columns.length === 0)
		return query;

	let columnIndex = 0;
	for (const column of columns) {
		query = addSingleColumSelect(ctx, query, wikiEntities, column, columnIndex, startDate, endDate);

		columnIndex++;
	}

	return query;
}

function addSingleColumSelect(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	column: ListColumn,
	columnIndex: number,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
): SelectQueryBuilder<ActorTypeModel> {
	const selectedColumnName = `column${columnIndex}`;

	switch (column.type) {
		case "editsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`, selectedColumnName);
			break;
		}
		case "editsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${wikiStartTableName}.editsToDate + ${wikiStartTableName}.dailyEdits, 0))`, selectedColumnName);
			break;
		}
		case "editsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`, selectedColumnName);
			break;
		}
		case "editsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits)`
				+ " / "
				+ `(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits), 0)`, selectedColumnName);
			break;
		}

		case "editsSinceRegistrationMilestone": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const selectParameters: { [index: string]: unknown } = {};

			query.addSelect(
				"CASE " + column.milestones.map((milestone: number, index: number) => {
					const milestoneParameterKey = `totalEditsMilestone${selectedColumnName}_${index}`;
					selectParameters[milestoneParameterKey] = milestone;

					return `WHEN IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) >= :${milestoneParameterKey}`
						+ ` AND IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0) < :${milestoneParameterKey}`
						+ ` THEN :${milestoneParameterKey}`;
				}).join(" ")
				+ " ELSE NULL END",
				selectedColumnName
			);

			for (const key of Object.keys(selectParameters)) {
				query = query.setParameter(key, selectParameters[key]);
			}
			break;
		}

		case "editsInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0) `
						+ `- IFNULL(${wikiStartTableName}.editsToDate + ${wikiStartTableName}.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "editsInNamespaceInPeriodPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			const actorTotalStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ `(IFNULL(${actorTotalEndTableName}.editsToDate + ${actorTotalEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorTotalStartTableName}.editsToDate + ${actorTotalStartTableName}.dailyEdits, 0))`
				+ ", 0)", selectedColumnName);
			break;
		}
		case "editsInNamespaceSinceRegistration": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ `IFNULL(${actorTotalEndTableName}.editsToDate + ${actorTotalEndTableName}.dailyEdits, 0)`
				+ ", 0)", selectedColumnName);

			break;
		}
		case "editsInPeriodByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsSinceRegistrationByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "revertedEditsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.reveretedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${wikiStartTableName}.revertedEditsToDate + ${wikiStartTableName}.dailyRevertedEdits, 0))`, selectedColumnName);
			break;
		}
		case "revertedEditsInPeriodPercentageToOwnTotalEdits": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits)`
				+ " / "
				+ `(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits), 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistrationPercentageToOwnTotalEdits": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits)`
				+ " / "
				+ `(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits), 0)`, selectedColumnName);
			break;
		}

		case "revertedEditsSinceRegistrationMilestone": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const selectParameters: { [index: string]: unknown } = {};

			query.addSelect(
				"CASE " + column.milestones.map((milestone: number, index: number) => {
					const milestoneParameterKey = `totalRevertedEditsMilestone${selectedColumnName}_${index}`;
					selectParameters[milestoneParameterKey] = milestone;

					return `WHEN IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) >= :${milestoneParameterKey}`
						+ ` AND IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0) < :${milestoneParameterKey}`
						+ ` THEN :${milestoneParameterKey}`;
				}).join(" ")
				+ " ELSE NULL END",
				selectedColumnName
			);

			for (const key of Object.keys(selectParameters)) {
				query = query.setParameter(key, selectParameters[key]);
			}
			break;
		}

		case "revertedEditsInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0) `
						+ `- IFNULL(${wikiStartTableName}.revertedEditsToDate + ${wikiStartTableName}.dailyRevertedEdits, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			const actorTotalStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ `(IFNULL(${actorTotalEndTableName}.editsToDate + ${actorTotalEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorTotalStartTableName}.editsToDate + ${actorTotalStartTableName}.dailyEdits, 0))`
				+ ", 0)", selectedColumnName);
			break;
		}
		case "revertedEditsInNamespaceSinceRegistration": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ `IFNULL(${actorTotalEndTableName}.editsToDate + ${actorTotalEndTableName}.dailyEdits, 0)`
				+ ", 0)", selectedColumnName);

			break;
		}

		case "characterChangesInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0)`, selectedColumnName);
			break;
		}
		case "characterChangesInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${wikiStartTableName}.characterChangesToDate + ${wikiStartTableName}.dailyCharacterChanges, 0))`, selectedColumnName);
			break;
		}
		case "characterChangesSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`, selectedColumnName);
			break;
		}
		case "characterChangesSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges)`
				+ " / "
				+ `(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges), 0)`, selectedColumnName);
			break;
		}

		case "characterChangesSinceRegistrationMilestone": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const selectParameters: { [index: string]: unknown } = {};

			query.addSelect(
				"CASE " + column.milestones.map((milestone: number, index: number) => {
					const milestoneParameterKey = `totalCharacterChangesMilestone${selectedColumnName}_${index}`;
					selectParameters[milestoneParameterKey] = milestone;

					return `WHEN IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) >= :${milestoneParameterKey}`
						+ ` AND IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0) < :${milestoneParameterKey}`
						+ ` THEN :${milestoneParameterKey}`;
				}).join(" ")
				+ " ELSE NULL END",
				selectedColumnName
			);

			for (const key of Object.keys(selectParameters)) {
				query = query.setParameter(key, selectParameters[key]);
			}
			break;
		}

		case "characterChangesInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
					+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
						+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0) `
						+ `- IFNULL(${wikiStartTableName}.characterChangesToDate + ${wikiStartTableName}.dailyCharacterChanges, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "characterChangesInNamespaceSinceRegistration": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "characterChangesInPeriodByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
					+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesSinceRegistrationByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "receivedThanksInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`, selectedColumnName);
			break;
		}
		case "receivedThanksInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.receivedThanksToDate + ${wikiEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${wikiStartTableName}.receivedThanksToDate + ${wikiStartTableName}.dailyReceivedThanks, 0))`, selectedColumnName);
			break;
		}
		case "receivedThanksSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0)`, selectedColumnName);
			break;
		}
		case "receivedThanksSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks)`
				+ " / "
				+ `(${wikiEndTableName}.receivedThanksToDate + ${wikiEndTableName}.dailyReceivedThanks), 0)`, selectedColumnName);
			break;
		}

		case "receivedThanksSinceRegistrationMilestone": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const selectParameters: { [index: string]: unknown } = {};

			query.addSelect(
				"CASE " + column.milestones.map((milestone: number, index: number) => {
					const milestoneParameterKey = `totalReceivedThanksMilestone${selectedColumnName}_${index}`;
					selectParameters[milestoneParameterKey] = milestone;

					return `WHEN IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) >= :${milestoneParameterKey}`
						+ ` AND IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0) < :${milestoneParameterKey}`
						+ ` THEN :${milestoneParameterKey}`;
				}).join(" ")
				+ " ELSE NULL END",
				selectedColumnName
			);

			for (const key of Object.keys(selectParameters)) {
				query = query.setParameter(key, selectParameters[key]);
			}
			break;
		}

		case "sentThanksInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.sentThanksToDate + ${actorStartTableName}.dailySentThanks, 0)`, selectedColumnName);
			break;
		}
		case "sentThanksInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.sentThanksToDate + ${actorStartTableName}.dailySentThanks, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.sentThanksToDate + ${wikiEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${wikiStartTableName}.sentThanksToDate + ${wikiStartTableName}.dailySentThanks, 0))`, selectedColumnName);
			break;
		}
		case "sentThanksSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0)`, selectedColumnName);
			break;
		}
		case "sentThanksSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks)`
				+ " / "
				+ `(${wikiEndTableName}.sentThanksToDate + ${wikiEndTableName}.dailySentThanks), 0)`, selectedColumnName);
			break;
		}

		case "logEventsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0)`, selectedColumnName);
			break;
		}
		case "logEventsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.logEventsToDate + ${wikiEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${wikiStartTableName}.logEventsToDate + ${wikiStartTableName}.dailyLogEvents, 0))`, selectedColumnName);
			break;
		}
		case "logEventsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0)`, selectedColumnName);
			break;
		}
		case "logEventsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents)`
				+ " / "
				+ `(${wikiEndTableName}.logEventsToDate + ${wikiEndTableName}.dailyLogEvents), 0)`, selectedColumnName);
			break;
		}

		case "serviceAwardLogEventsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.serviceAwardLogEventsToDate + ${actorEndTableName}.dailyServiceAwardLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.serviceAwardLogEventsToDate + ${actorStartTableName}.dailyServiceAwardLogEvents, 0)`, selectedColumnName);
			break;
		}

		case "serviceAwardLogEventsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.serviceAwardLogEventsToDate + ${actorEndTableName}.dailyServiceAwardLogEvents, 0)`, selectedColumnName);
			break;
		}

		case "logEventsInPeriodByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];

			query = query.addSelect(logFilters.map(log => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "actor", `Log${serializeLogFilterDefinition(log)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Log${serializeLogFilterDefinition(log)}`);

				return `(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
					+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "logEventsSinceRegistrationByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];

			query = query.addSelect(logFilters.map(log => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Log${serializeLogFilterDefinition(log)}`);

				return `IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "lastLogEventDateByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];
			if (logFilters.length === 1) {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Log${serializeLogFilterDefinition(logFilters[0])}`);

				query = query.addSelect(
					`DATE(IFNULL(${actorEndTableName}.date, "1900-01-01"))`,
					selectedColumnName
				);
			} else {
				query = query.addSelect("DATE(GREATEST(" + logFilters.map(log => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Log${serializeLogFilterDefinition(log)}`);

					return `IFNULL(${actorEndTableName}.date, "1900-01-01")`;
				}).join(", ") + "))", selectedColumnName);
			}
			break;
		}

		case "serviceAwardContributionsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits + `
				+ `${actorEndTableName}.serviceAwardLogEventsToDate + ${actorEndTableName}.dailyServiceAwardLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits + `
				+ `${actorStartTableName}.serviceAwardLogEventsToDate + ${actorStartTableName}.dailyServiceAwardLogEvents, 0)`, selectedColumnName);
			break;
		}

		case "serviceAwardContributionsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits + `
				+ `${actorEndTableName}.serviceAwardLogEventsToDate + ${actorEndTableName}.dailyServiceAwardLogEvents, 0)`, selectedColumnName);
			break;
		}

		case "firstEditDate": {
			query = query.addSelect("DATE(actor.firstEditTimestamp)", selectedColumnName);
			break;
		}
		case "lastEditDate": {
			query = query.addSelect("DATE(actor.lastEditTimestamp)", selectedColumnName);
			break;
		}
		case "lastEditDateInNamespace": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];
			if (namespaces.length === 1) {
				const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(namespaces[0])}`);

				query = query.addSelect(
					`DATE(IFNULL(${actorEndTableName}.date, "1900-01-01"))`,
					selectedColumnName
				);
			} else {
				query = query.addSelect("DATE(GREATEST(" + namespaces.map(ns => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "actor", `Ns${formatNamespaceParameter(ns)}`);

					return `IFNULL(${actorEndTableName}.date, "1900-01-01")`;
				}).join(", ") + "))", selectedColumnName);
			}
			break;
		}
		case "daysBetweenFirstAndLastEdit": {
			query = query.addSelect(
				"DATEDIFF(DATE(actor.lastEditTimestamp), DATE(actor.firstEditTimestamp))",
				selectedColumnName
			);
			break;
		}
		case "averageEditsPerDayInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				`(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0))`, selectedColumnName);
			break;
		}
		case "averageEditsPerDaySinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL((${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits)`
				+ ` / (${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay), 0)`, selectedColumnName);
			break;
		}
		case "firstLogEventDate":
			query = query.addSelect("logEventDates.firstLogEventDate", selectedColumnName);
			break;
		case "lastLogEventDate":
			query = query.addSelect("logEventDates.lastLogEventDate", selectedColumnName);
			break;
		case "averageLogEventsPerDayInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(
				`(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0))`, selectedColumnName);
			break;
		}
		case "averageLogEventsPerDaySinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL((${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents)`
				+ ` / (${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay), 0)`, selectedColumnName);
			break;
		}
		case "daysBetweenFirstAndLastLogEvent":
			query = query.addSelect("DATEDIFF(logEventDates.lastLogEventDate, logEventDates.firstLogEventDate)", selectedColumnName);
			break;
		case "registrationDate":
			query = query.addSelect("DATE(actor.registrationTimestamp)", selectedColumnName);
			break;
		case "daysSinceRegistration":
			query = query
				.addSelect(
					"DATEDIFF(:endDate, DATE(actor.registrationTimestamp))",
					selectedColumnName
				)
				.setParameter("endDate", endDate.toDate());
			break;

		case "activeDaysInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`, selectedColumnName);
			break;
		}
		case "activeDaysSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0)`, selectedColumnName);
			break;
		}
	}

	return query;
}

function addServiceAwardLevelColumnSelects(
	query: SelectQueryBuilder<ActorTypeModel>,
	ctx: StatisticsQueryBuildingContext
) {
	for (const date of ctx.requiredColumns.neededLevelDates) {
		query = addServiceAwardLevelColumnSelectsForDate(query, date);
	}

	return query;
}

function addServiceAwardLevelColumnSelectsForDate(
	query: SelectQueryBuilder<ActorTypeModel>,
	date: moment.Moment | undefined,
) {
	const actorStartTableName = makePeriodJoinTableName(date, "actor");
	const formattedDate = date?.format("YYYYMMDD") ?? "??";

	query = query.addSelect(
		`IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`,
		`level_${formattedDate}_edits`
	);
	query = query.addSelect(
		`IFNULL(${actorStartTableName}.serviceAwardLogEventsToDate + ${actorStartTableName}.dailyServiceAwardLogEvents, 0)`,
		`level_${formattedDate}_logEvents`
	);
	query = query.addSelect(
		`IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`,
		`level_${formattedDate}_activeDays`
	);
	return query;
}

function addColumnJoins(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	columns: ListColumn[] | undefined,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment,
) {
	query = addDailyStatisticsColumnJoins(ctx, query, wikiEntities);

	if (columns && columns.length > 0) {
		query = addLogEventDateColumnJoins(columns, query, wikiEntities, endDate);
	}

	for (const namespaceCollection of ctx.requiredColumns.requiredNamespaceStatisticsColumns) {
		query = addNamespaceColumnJoins(ctx, namespaceCollection, query, wikiEntities, endDate);
	}

	for (const changeTagCollection of ctx.requiredColumns.requiredChangeTagStatisticsColumns) {
		query = addChangeTagColumnJoins(ctx, changeTagCollection, query, wikiEntities, endDate);
	}

	for (const logTypeCollection of ctx.requiredColumns.requiredLogTypeStatisticsColumns) {
		query = addLogTypeColumnJoins(ctx, logTypeCollection, query, wikiEntities, endDate);
	}

	return query;
}

function addDailyStatisticsColumnJoins(ctx: StatisticsQueryBuildingContext, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult) {
	if (ctx.requiredColumns.needsSelectedPeriodActorStatistics) {
		for (const startDate of ctx.requiredColumns.neededDates.neededActorPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "actor");
			const startDateParameterName = startDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.actorDailyStatistics).metadata.tableName;

			query = query.innerJoin(
				wikiEntities.actorDailyStatistics,
				tableAlias,
				`${tableAlias}.actorId = actor.actorId `
				+ `AND ${tableAlias}.date = (SELECT MAX(date) FROM ${tableName} WHERE actor_id = actor.actorId AND date < :${startDateParameterName})`,
				{ [startDateParameterName]: startDate.toDate() }
			);
		}
	}

	if (ctx.requiredColumns.needsSelectedPeriodWikiStatistics) {
		for (const startDate of ctx.requiredColumns.neededDates.neededWikiPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "wiki");
			const startDateParameterName = startDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.dailyStatistics).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.dailyStatistics,
				tableAlias,
				`${tableAlias}.date = (SELECT MAX(date) FROM ${tableName} WHERE date < :${startDateParameterName})`,
				{ [startDateParameterName]: startDate.toDate() }
			);
		}
	}

	if (ctx.requiredColumns.needsSinceRegisteredActorStatistics || ctx.requiredColumns.needsSelectedPeriodActorStatistics) {
		for (const endDate of ctx.requiredColumns.neededDates.neededActorPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(endDate, "actor");
			const endDateParameterName = endDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.actorDailyStatistics).metadata.tableName;

			query = query.innerJoin(
				wikiEntities.actorDailyStatistics,
				tableAlias,
				`${tableAlias}.actorId = actor.actorId `
				+ `AND ${tableAlias}.date = (SELECT MAX(date) FROM ${tableName} WHERE actor_id = actor.actorId AND date <= :${endDateParameterName})`,
				{ [endDateParameterName]: endDate.toDate() }
			);
		}
	}

	if (ctx.requiredColumns.needsSelectedPeriodWikiStatistics
		|| ctx.requiredColumns.needsSinceRegisteredWikiStatistics) {
		for (const endDate of ctx.requiredColumns.neededDates.neededWikiPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(endDate, "actor");
			const endDateParameterName = endDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.dailyStatistics).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.dailyStatistics,
				tableAlias,
				`${tableAlias}.date = (SELECT MAX(date) FROM ${tableName} WHERE date <= :${endDateParameterName})`,
				{ [endDateParameterName]: endDate.toDate() }
			);
		}
	}
	return query;
}

function addLogEventDateColumnJoins(columns: ListColumn[], query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const needsDaysBetweenFirstAndLastLogEvent = columns.findIndex(x => x.type === "daysBetweenFirstAndLastLogEvent") !== -1;
	const needsFirstLogEventDate = needsDaysBetweenFirstAndLastLogEvent || columns.findIndex(x => x.type === "firstLogEventDate") !== -1;
	const needsLastLogEventDate = needsDaysBetweenFirstAndLastLogEvent || columns.findIndex(x => x.type === "lastLogEventDate") !== -1;

	if (needsDaysBetweenFirstAndLastLogEvent || needsFirstLogEventDate || needsLastLogEventDate) {
		query = query.innerJoin(qb => {
			let subQuery = qb.subQuery()
				.select("ads.actorId", "actorId");

			if (needsFirstLogEventDate) {
				subQuery = subQuery.addSelect("MIN(date)", "firstLogEventDate");
			}

			if (needsLastLogEventDate) {
				subQuery = subQuery.addSelect("MAX(date)", "lastLogEventDate");
			}

			return subQuery
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate.toDate() }
				)
				.andWhere("ads.dailyLogEvents > 0")
				.groupBy("ads.actorId");
		}, "logEventDates", "logEventDates.actorId = actor.actorId");
	}
	return query;
}

function addNamespaceColumnJoins(ctx: StatisticsQueryBuildingContext, namespaceRequirement: NamespaceRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const namespaceKey = formatNamespaceParameter(namespaceRequirement.namespace);

	if (namespaceRequirement.needsSelectedPeriodActorStatistics) {
		for (const startDate of namespaceRequirement.neededDates.neededActorPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "actor", `Ns${namespaceKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.actorDailyStatisticsByNamespace).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				tableAlias,
				`${tableAlias}.actorId = actor.actorId`
				+ ` AND ${tableAlias}.namespace = :namespace${namespaceRequirement.namespace}`
				+ ` AND ${tableAlias}.date = (`
				+ `SELECT MAX(date) FROM ${tableName} `
				+ `WHERE namespace = :namespace${namespaceRequirement.namespace}`
				+ " AND actor_id = actor.actorId"
				+ ` AND date < :${startDateParameterName}`
				+ ")",
				{
					[`namespace${namespaceRequirement.namespace}`]: namespaceRequirement.namespace,
					[startDateParameterName]: startDate.toDate()
				}
			);
		}
	}

	if (namespaceRequirement.needsSelectedPeriodWikiStatistics) {
		for (const startDate of namespaceRequirement.neededDates.neededWikiPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "wiki", `Ns${namespaceKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.dailyStatisticsByNamespace).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				tableAlias,
				`${tableAlias}.namespace = :namespace${namespaceRequirement.namespace}`
				+ ` AND ${tableAlias}.date = (`
				+ `SELECT MAX(date) FROM ${tableName} `
				+ `WHERE namespace = :namespace${namespaceRequirement.namespace}`
				+ ` AND date < :${startDateParameterName}`
				+ ")",
				{
					[`namespace${namespaceRequirement.namespace}`]: namespaceRequirement.namespace,
					[startDateParameterName]: startDate.toDate()
				}
			);
		}
	}

	if (namespaceRequirement.needsSinceRegisteredActorStatistics || namespaceRequirement.needsSelectedPeriodActorStatistics) {
		for (const startDate of namespaceRequirement.neededDates.neededActorPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(startDate, "actor", `Ns${namespaceKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.actorDailyStatisticsByNamespace).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				tableAlias,
				`${tableAlias}.actorId = actor.actorId `
				+ ` AND ${tableAlias}.namespace = :namespace${namespaceRequirement.namespace}`
				+ ` AND ${tableAlias}.date = (`
				+ `SELECT MAX(date) FROM ${tableName} `
				+ `WHERE namespace = :namespace${namespaceRequirement.namespace}`
				+ " AND actor_id = actor.actorId"
				+ ` AND date <= :${endDateParameterName}`
				+ ")",
				{
					[`namespace${namespaceRequirement.namespace}`]: namespaceRequirement.namespace,
					[endDateParameterName]: endDate.toDate()
				}
			);
		}
	}

	if (namespaceRequirement.needsSelectedPeriodWikiStatistics || namespaceRequirement.needsSinceRegisteredWikiStatistics) {
		for (const startDate of namespaceRequirement.neededDates.neededWikiPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(startDate, "wiki", `Ns${namespaceKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			const tableName = ctx.conn.getRepository(wikiEntities.dailyStatisticsByNamespace).metadata.tableName;

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				tableAlias,
				`${tableAlias}.namespace = :namespace${namespaceRequirement.namespace} `
				+ `${tableAlias}.date = (`
				+ `SELECT MAX(date) FROM ${tableName} `
				+ `WHERE namespace = :namespace${namespaceRequirement.namespace}`
				+ ` AND date <= :${endDateParameterName}`
				+ ")",
				{
					[`namespace${namespaceRequirement.namespace}`]: namespaceRequirement.namespace,
					[endDateParameterName]: endDate.toDate()
				}
			);
		}
	}
	return query;
}

function addChangeTagColumnJoins(ctx: StatisticsQueryBuildingContext, changeTagRequirement: ChangeTagStatisticsRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const normalizedCtKey = changeTagRequirement.serializedChangeTagFilter;

	if (changeTagRequirement.needsSelectedPeriodActorStatistics) {
		for (const startDate of changeTagRequirement.neededDates.neededActorPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "actor", `Ct${normalizedCtKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			if (typeof changeTagRequirement.changeTagFilter.namespace !== "number") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorEditStatisticsByChangeTag).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByChangeTag,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId`
					+ ` AND ${tableAlias}.changeTagId = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE change_tag_id = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date < :${startDateParameterName}`
					+ ")",
					{
						[`changeTag${changeTagRequirement.changeTagFilter.changeTagId}`]: changeTagRequirement.changeTagFilter.changeTagId,
						[startDateParameterName]: startDate.toDate()
					}
				);
			} else {
				const tableName = ctx.conn.getRepository(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByNamespaceAndChangeTag,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId`
					+ ` AND ${tableAlias}.namespace = :namespace${changeTagRequirement.changeTagFilter.namespace}`
					+ ` AND ${tableAlias}.changeTagId = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE namespace = :namespace${changeTagRequirement.changeTagFilter.namespace}`
					+ ` AND change_tag_id = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date < :${startDateParameterName}`
					+ ")",
					{
						[`namespace${changeTagRequirement.changeTagFilter.namespace}`]: changeTagRequirement.changeTagFilter.namespace,
						[`changeTag${changeTagRequirement.changeTagFilter.changeTagId}`]: changeTagRequirement.changeTagFilter.changeTagId,
						[startDateParameterName]: startDate.toDate()
					}
				);
			}
		}
	}

	if (changeTagRequirement.needsSinceRegisteredActorStatistics || changeTagRequirement.needsSelectedPeriodActorStatistics) {
		for (const endDate of changeTagRequirement.neededDates.neededActorPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(endDate, "actor", `Ct${normalizedCtKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			if (typeof changeTagRequirement.changeTagFilter.namespace !== "number") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorEditStatisticsByChangeTag).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByChangeTag,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId `
					+ ` AND ${tableAlias}.changeTagId = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE change_tag_id = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date <= :${endDateParameterName}`
					+ ")",
					{
						[`changeTag${changeTagRequirement.changeTagFilter.changeTagId}`]: changeTagRequirement.changeTagFilter.changeTagId,
						[endDateParameterName]: endDate.toDate()
					}
				);
			} else {
				const tableName = ctx.conn.getRepository(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByNamespaceAndChangeTag,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId `
					+ ` AND ${tableAlias}.namespace = :namespace${changeTagRequirement.changeTagFilter.namespace}`
					+ ` AND ${tableAlias}.changeTagId = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE namespace = :namespace${changeTagRequirement.changeTagFilter.namespace}`
					+ ` AND change_tag_id = :changeTag${changeTagRequirement.changeTagFilter.changeTagId}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date <= :${endDateParameterName}`
					+ ")",
					{
						[`namespace${changeTagRequirement.changeTagFilter.namespace}`]: changeTagRequirement.changeTagFilter.namespace,
						[`changeTag${changeTagRequirement.changeTagFilter.changeTagId}`]: changeTagRequirement.changeTagFilter.changeTagId,
						[endDateParameterName]: endDate.toDate()
					}
				);
			}
		}
	}
	return query;
}

function addLogTypeColumnJoins(ctx: StatisticsQueryBuildingContext, logTypeRequirement: LogTypeStatisticsRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const normalizedLogKey = logTypeRequirement.serializedLogFilter;

	if (logTypeRequirement.needsSelectedPeriodActorStatistics) {
		for (const startDate of logTypeRequirement.neededDates.neededActorPeriodStarts) {
			const tableAlias = makePeriodJoinTableName(startDate, "actor", `Log${normalizedLogKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			if (typeof logTypeRequirement.logFilter.logAction === "string" && typeof logTypeRequirement.logFilter.logType === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogTypeAndLogAction).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogTypeAndLogAction,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId`
					+ ` AND ${tableAlias}.logType = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND ${tableAlias}.logAction = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_type = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND log_action = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date < :${startDateParameterName}`
					+ ")",
					{
						[`logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`]: logTypeRequirement.logFilter.logType,
						[`logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`]: logTypeRequirement.logFilter.logAction,
						[startDateParameterName]: startDate.toDate()
					}
				);
			} else if (typeof logTypeRequirement.logFilter.logAction === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogAction).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogAction,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId`
					+ ` AND ${tableAlias}.logAction = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_action = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date < :${startDateParameterName}`
					+ ")",
					{
						[`logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`]: logTypeRequirement.logFilter.logAction,
						[startDateParameterName]: startDate.toDate()
					}
				);
			} else if (typeof logTypeRequirement.logFilter.logType === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogType).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogType,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId`
					+ ` AND ${tableAlias}.logType = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_type = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date < :${startDateParameterName}`
					+ ")",
					{
						[`logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`]: logTypeRequirement.logFilter.logType,
						[startDateParameterName]: startDate.toDate()
					}
				);
			}
		}
	}

	if (logTypeRequirement.needsSinceRegisteredActorStatistics
		|| logTypeRequirement.needsSelectedPeriodActorStatistics
		|| logTypeRequirement.needsLastLogEntryDate) {
		for (const endDate of logTypeRequirement.neededDates.neededActorPeriodEnds) {
			const tableAlias = makePeriodJoinTableName(endDate, "actor", `Log${normalizedLogKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			if (typeof logTypeRequirement.logFilter.logAction === "string" && typeof logTypeRequirement.logFilter.logType === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogTypeAndLogAction).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogTypeAndLogAction,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId `
					+ ` AND ${tableAlias}.logType = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND ${tableAlias}.logAction = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_type = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND log_action = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date <= :${endDateParameterName}`
					+ ")",
					{
						[`logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`]: logTypeRequirement.logFilter.logType,
						[`logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`]: logTypeRequirement.logFilter.logAction,
						[endDateParameterName]: endDate.toDate()
					}
				);
			} else if (typeof logTypeRequirement.logFilter.logAction === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogAction).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogAction,
					tableAlias,
					`${tableAlias}.actorId = actor.actorId `
					+ ` AND ${tableAlias}.logAction = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_action = :logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date <= :${endDateParameterName}`
					+ ")",
					{
						[`logAction${sanitizeNameForSql(logTypeRequirement.logFilter.logAction)}`]: logTypeRequirement.logFilter.logAction,
						[endDateParameterName]: endDate.toDate()
					}
				);
			} else if (typeof logTypeRequirement.logFilter.logType === "string") {
				const tableName = ctx.conn.getRepository(wikiEntities.actorLogStatisticsByLogType).metadata.tableName;

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogType,
					`${tableAlias}`,
					`${tableAlias}.actorId = actor.actorId `
					+ ` AND ${tableAlias}.logType = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ ` AND ${tableAlias}.date = (`
					+ `SELECT MAX(date) FROM ${tableName} `
					+ `WHERE log_type = :logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`
					+ " AND actor_id = actor.actorId"
					+ ` AND date <= :${endDateParameterName}`
					+ ")",
					{
						[`logType${sanitizeNameForSql(logTypeRequirement.logFilter.logType)}`]: logTypeRequirement.logFilter.logType,
						[endDateParameterName]: endDate.toDate()
					}
				);
			}
		}
	}

	return query;
}

function updateCalculatedColums(
	ctx: StatisticsQueryBuildingContext,
	data: ActorLike[]
): void {
	const { columns, userRequirements } = ctx;
	if (!columns && !userRequirements)
		return;

	const listColumns = columns || [];

	for (const actor of data) {
		let columnIndex = 0;

		const userGroups = ctx.actorGroups.get(actor.actorId) ?? null;
		if (userGroups) {
			actor.actorGroups = userGroups;
		}

		if (userRequirements && userRequirements.serviceAwardLevel != null) {
			const endLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.endDate);
			actor["endLevel"] = endLevel;

			if (userRequirements.serviceAwardLevel === "hasLevelAndChanged") {
				const startLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.startDate);
				actor["startLevel"] = startLevel;
			}
		}

		for (const columnDefinition of listColumns) {
			const columnId: string = `column${columnIndex}`;

			if (columnDefinition.type === "userName") {
				actor[columnId] = actor.actorName ?? "?";
			} else if (columnDefinition.type === "userGroups") {
				actor[columnId] = userGroups ?? null;
			} else if (columnDefinition.type === "levelAtPeriodStart") {
				const startLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.startDate);
				if (startLevel.currentLevel) {
					actor[columnId] = [startLevel.currentLevel.id, startLevel.currentLevel.label];
				} else {
					actor[columnId] = null;
				}
			} else if (columnDefinition.type === "levelAtPeriodEnd") {
				const endLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.endDate);
				if (endLevel.currentLevel) {
					actor[columnId] = [endLevel.currentLevel.id, endLevel.currentLevel.label];
				} else {
					actor[columnId] = null;
				}
			} else if (columnDefinition.type === "levelAtPeriodEndWithChange") {
				const startLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.startDate);
				const endLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.endDate);

				if (endLevel.currentLevel) {
					actor[columnId] = [
						endLevel.currentLevel.id,
						endLevel.currentLevel.label,
						startLevel.currentLevel == null || startLevel.currentLevel.id !== endLevel.currentLevel.id
					];
				} else {
					actor[columnId] = null;
				}
			} else if (columnDefinition.type === "levelSortOrder") {
				const endLevel = getUserLevelWithDetails(ctx.wiki.serviceAwardLevels, actor, ctx.endDate);

				actor[columnId] = round(endLevel.levelSortOrder, 4);
			} else if (typeof actor[columnId] === "string") {
				if (actor[columnId].indexOf(".") !== -1) {
					const floatNumber = Number.parseFloat(actor[columnId]);
					actor[columnId] = Number.isNaN(floatNumber) ? "?" : floatNumber;
				} else {
					const intNumber = Number.parseInt(actor[columnId]);
					actor[columnId] = Number.isNaN(intNumber) ? "?" : intNumber;
				}
			}

			columnIndex++;
		}
	}
}


function doAdditionalFiltering(ctx: StatisticsQueryBuildingContext, data: ActorLike[]): ActorLike[] {
	if (ctx.userRequirements == null
		|| ctx.userRequirements.serviceAwardLevel == null) {
		return data;
	}

	const { serviceAwardLevel: serviceAwardLevelRequirement } = ctx.userRequirements;

	const ret: ActorLike[] = [];
	for (const actor of data) {
		if (serviceAwardLevelRequirement === "hasLevel") {
			const endLevel = actor["endLevel"] as UserLevelWithDetails;
			if (!endLevel.currentLevel) {
				continue;
			}
		} else if (serviceAwardLevelRequirement === "hasLevelAndChanged") {
			const startLevel = actor["startLevel"] as UserLevelWithDetails;
			const endLevel = actor["endLevel"] as UserLevelWithDetails;

			if ((!startLevel.currentLevel && !endLevel.currentLevel)
				|| (startLevel.currentLevel && endLevel.currentLevel && startLevel.currentLevel.id === endLevel.currentLevel.id))
				continue;
		}

		ret.push(actor);
	}

	return ret;
}

function createActorResultSet(
	ctx: StatisticsQueryBuildingContext,
	data: ActorLike[]
) {
	const { columns } = ctx;
	if (!columns)
		return [];

	let counter = 1;
	const ret: ActorResult[] = [];
	for (const actor of data) {
		let columnIndex = 0;
		const actorResult: ActorResult = {
			actorId: actor.actorId,
			name: actor.actorName ?? "?",
			groups: actor.actorGroups ?? [],
			columnData: []
		};

		const columnData: unknown[] = [];

		for (const columnDefinition of columns) {
			const columnId: string = `column${columnIndex}`;
			const dataFromQuery = actor[columnId];

			if (columnDefinition.type === "counter") {
				const isBot = actor.actorGroups != null
					&& !!actor.actorGroups.find(x => x === "bot" || x === FLAGLESS_BOT_VIRTUAL_GROUP_NAME);

				if (ctx.skipBotsFromCounting === true && isBot) {
					columnData.push("");
				} else {
					columnData.push(counter);
					counter++;
				}
			} else if (isDate(dataFromQuery)) {
				columnData.push([dataFromQuery.getFullYear(), dataFromQuery.getMonth(), dataFromQuery.getDate()]);
			} else if (typeof dataFromQuery === "string" && DATE_STRING_REGEX.test(dataFromQuery)) {
				const date = moment.utc(dataFromQuery);
				columnData.push([date.year(), date.month(), date.date()]);
			} else {
				columnData.push(dataFromQuery);
			}

			columnIndex++;
		}

		actorResult.columnData = columnData;

		ret.push(actorResult);

		if (typeof ctx.itemCount !== "undefined" && ctx.itemCount > 0 && ret.length === ctx.itemCount)
			break;
	}

	return ret;
}

interface UserLevelWithDetails {
	currentLevel: ServiceAwardLevelDefinition | null;
	progressToNextLevel: number;
	nextLevel: ServiceAwardLevelDefinition | null;

	levelSortOrder: number;

	edits: number;
	logEntries: number;
	contributions: number;

	activeDays: number;
}

function getUserLevelWithDetails(
	serviceAwardLevels: ServiceAwardLevelDefinition[] | null,
	user: ActorLike,
	date: moment.Moment | undefined
): UserLevelWithDetails {
	if (!serviceAwardLevels) {
		return {
			currentLevel: null,
			progressToNextLevel: 0,
			nextLevel: null,

			levelSortOrder: 0,

			activeDays: 0,
			contributions: 0,
			edits: 0,
			logEntries: 0,
		};
	}

	const formattedDate = date?.format("YYYYMMDD") ?? "??";

	const edits: number = user[`level_${formattedDate}_edits`];
	const logEntries: number = user[`level_${formattedDate}_logEvents`];
	const contributions: number = edits + logEntries;

	const activeDays: number = user[`level_${formattedDate}_activeDays`];

	let currentLevel: ServiceAwardLevelDefinition | null = null;
	let currentLevelIndex = -1;
	for (let i = 0; i < serviceAwardLevels.length; i++) {
		const serviceAwardLevel = serviceAwardLevels[i];

		if (contributions > serviceAwardLevel.requiredContributions
			&& activeDays > serviceAwardLevel.requiredActiveDays) {
			currentLevel = serviceAwardLevel;
			currentLevelIndex = i;
		}
	}

	const nextLevel = serviceAwardLevels.length > currentLevelIndex + 1
		? serviceAwardLevels[currentLevelIndex + 1]
		: null;

	let progressToNextLevel = 0;
	if (nextLevel != null) {
		let daysToNextRank = nextLevel.requiredActiveDays;
		let editsToNextRank = nextLevel.requiredContributions;

		let userActiveDays = activeDays;
		let userContributions = contributions;

		if (currentLevel != null) {
			daysToNextRank = nextLevel.requiredActiveDays - currentLevel.requiredActiveDays;
			editsToNextRank = nextLevel.requiredContributions - currentLevel.requiredContributions;

			userActiveDays = userActiveDays - currentLevel.requiredActiveDays;
			userContributions = userContributions - currentLevel.requiredContributions;
		}

		const editPercentage = userContributions / editsToNextRank;
		const daysPercentage = userActiveDays / daysToNextRank;
		progressToNextLevel = Math.min(editPercentage, daysPercentage);
	}


	return {
		currentLevel: currentLevel,
		progressToNextLevel: progressToNextLevel,
		nextLevel: nextLevel,

		levelSortOrder: (currentLevelIndex + 1) + progressToNextLevel,

		edits: edits,
		logEntries: logEntries,
		contributions: contributions,

		activeDays: activeDays
	};
}

function doOrderBy(
	data: ActorLike[],
	columns: ListColumn[] | undefined,
	orderByList?: ListOrderBy[] | undefined
): void {
	if (!orderByList
		|| orderByList.length === 0
		|| !columns
		|| columns.length === 0
	) {
		return;
	}

	const orderByRules: [string, "ascending" | "descending"][] = [];
	for (const orderBy of orderByList) {
		if (!orderBy.columnId) {
			// TODO error out
			continue;
		}

		const referencedColumnIndex = columns.findIndex(x => x.columnId === orderBy.columnId);
		if (referencedColumnIndex === -1) {
			// TODO error out
			continue;
		}

		const referencedColumn = columns[referencedColumnIndex];
		orderByRules.push([
			referencedColumn.type === "userName"
				? "actorName"
				: `column${referencedColumnIndex}`,
			orderBy.direction
		]);
	}

	data.sort((a, b) => {
		for (const ele of orderByRules) {
			const aValue = a[ele[0]];
			const bValue = b[ele[0]];
			const multiplier = ele[1] === "descending" ? -1 : 1;

			let result;
			if (typeof aValue === "string") {
				result = aValue.localeCompare(bValue);
				if (result === 0)
					continue;
			} else if (typeof aValue === "number" || typeof bValue === "number") {
				result = compareNumbers(aValue, bValue);
				if (result === 0)
					continue;

				return result * multiplier;
			} else if (aValue instanceof Date || bValue instanceof Date) {
				result = compareMoments(
					aValue instanceof Date ? moment.utc(aValue) : moment.invalid(),
					bValue instanceof Date ? moment.utc(bValue) : moment.invalid()
				);

				if (result === 0)
					continue;
			} else {
				result = (a.actorName ?? "").localeCompare(b.actorName ?? "");
			}

			return result * multiplier;
		}

		return (a.actorName ?? "").localeCompare(b.actorName ?? "");
	});
}

function getOrCreateNamespaceCollector(ctx: StatisticsQueryBuildingContext, namespace: number): NamespaceRequiredColumns {
	let existingCollector = ctx.requiredColumns.requiredNamespaceStatisticsColumns.find(x =>
		x.namespace === namespace);

	if (!existingCollector) {
		existingCollector = {
			namespace: namespace,

			neededDates: {
				neededActorPeriodStarts: [],
				neededActorPeriodEnds: [],
				neededWikiPeriodStarts: [],
				neededWikiPeriodEnds: []
			},
			needsSelectedPeriodActorStatistics: false,
			needsSelectedPeriodWikiStatistics: false,

			needsSinceRegisteredActorStatistics: false,
			needsSinceRegisteredWikiStatistics: false
		};
		ctx.requiredColumns.requiredNamespaceStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function formatNamespaceParameter(namespace: number): string {
	return namespace.toString();
}

function getOrCreateChangeTagCollector(ctx: StatisticsQueryBuildingContext, changeTagFilter: ChangeTagFilterDefinition): ChangeTagStatisticsRequiredColumns {
	const serializedChangeTagFilter = serializeChangeTagFilterDefinition(changeTagFilter);

	let existingCollector = ctx.requiredColumns.requiredChangeTagStatisticsColumns
		.find(x => x.serializedChangeTagFilter === serializedChangeTagFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedChangeTagFilter: serializedChangeTagFilter,
			changeTagFilter: changeTagFilter,

			neededDates: {
				neededActorPeriodStarts: [],
				neededActorPeriodEnds: [],
				neededWikiPeriodStarts: [],
				neededWikiPeriodEnds: []
			},
			needsSelectedPeriodActorStatistics: false,
			needsSelectedPeriodWikiStatistics: false,

			needsSinceRegisteredActorStatistics: false,
			needsSinceRegisteredWikiStatistics: false
		};
		ctx.requiredColumns.requiredChangeTagStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function serializeChangeTagFilterDefinition(changeTagFilter: ChangeTagFilterDefinition) {
	return sanitizeNameForSql(`${changeTagFilter.namespace ?? "any"}_${changeTagFilter.changeTagId}`);
}

function getOrCreateLogTypeCollector(ctx: StatisticsQueryBuildingContext, logFilter: LogFilterDefinition): LogTypeStatisticsRequiredColumns {
	const serializedLogFilter = serializeLogFilterDefinition(logFilter);

	let existingCollector = ctx.requiredColumns.requiredLogTypeStatisticsColumns
		.find(x => x.serializedLogFilter === serializedLogFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedLogFilter: serializedLogFilter,
			logFilter: logFilter,

			neededDates: {
				neededActorPeriodStarts: [],
				neededActorPeriodEnds: [],
				neededWikiPeriodStarts: [],
				neededWikiPeriodEnds: []
			},
			needsSelectedPeriodActorStatistics: false,
			needsSelectedPeriodWikiStatistics: false,

			needsSinceRegisteredActorStatistics: false,
			needsSinceRegisteredWikiStatistics: false,
			needsLastLogEntryDate: false
		};
		ctx.requiredColumns.requiredLogTypeStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function serializeLogFilterDefinition(logFilter: LogFilterDefinition) {
	return sanitizeNameForSql(`${logFilter.logType ?? "any"}_${logFilter.logAction ?? "any"}`);
}

function sanitizeNameForSql(userGroup: string) {
	return userGroup.replace(/-/g, "_");
}

function addNeededPeriodToCollection(reqs: moment.Moment[], date: moment.Moment | undefined) {
	if (!date) {
		return;
	}

	if (reqs.findIndex(x => x.isSame(date)) !== -1) {
		return;
	}

	reqs.push(date);
}

function makePeriodJoinTableName(
	date: moment.Moment | undefined,
	subject: JoinedTableSubject,
	prefix: string = ""
): string {
	const formattedDate = date?.format("YYYYMMDD") ?? "??";
	const prefixWithUnderscore = prefix && prefix.length > 0 ? `_${prefix}` : "";

	return subject === "actor"
		? `actor${prefixWithUnderscore}_${formattedDate}`
		: `wiki${prefixWithUnderscore}_${formattedDate}`;
}

async function fetchActorGroups(ctx: StatisticsQueryBuildingContext): Promise<void> {
	const actorGroupMap: Map<number, string[]> = new Map();
	const actorGroups = await ctx.conn.getRepository(ctx.wikiEntities.actorGroup)
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

	ctx.actorGroups = actorGroupMap;
}
