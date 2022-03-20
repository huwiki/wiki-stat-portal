import moment from "moment";
import { Connection, SelectQueryBuilder } from "typeorm";
import { UserGroup, UserRequirements, UserStatisticsInPeriodRequirement, UserStatisticsInTimeRequirement } from "../../common/modules/commonConfiguration";
import { ChangeTagFilterDefinition, ListColumn, ListOrderBy, LogFilterDefinition } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { ActorTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

type JoinedTableType =
	"beforePeriodStart"
	| "atPeriodEnd";

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
	needsFirstLogEntryDate: boolean;
	needsLastEntryDate: boolean;
};

type ChangeTagStatisticsRequiredColumns = RequiredColumns & {
	serializedChangeTagFilter: string;
	changeTagFilter: ChangeTagFilterDefinition;
};

interface StatisticsQueryBuildingContext {
	columns: RequiredColumns & {
		requiredNamespaceStatisticsColumns: NamespaceRequiredColumns[];
		requiredLogTypeStatisticsColumns: LogTypeStatisticsRequiredColumns[];
		requiredChangeTagStatisticsColumns: ChangeTagStatisticsRequiredColumns[];
	};
}

export interface ActorLike {
	actorId: number;
	actorName?: string;
}

export async function createStatisticsQuery({ appCtx, toolsDbConnection, wikiEntities, userRequirements, columns, orderBy, itemCount: itemCount, startDate, endDate }: {
	appCtx: AppRunningContext,
	toolsDbConnection: Connection,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	columns?: ListColumn[],
	orderBy?: ListOrderBy[],
	itemCount?: number;
	startDate?: moment.Moment,
	endDate: moment.Moment
}): Promise<ActorLike[]> {

	const ctx: StatisticsQueryBuildingContext = {
		columns: {
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
		}
	};

	let query = toolsDbConnection.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "actorId")
		.addSelect("actor.actorName", "actorName");

	// Manage selects from column definitions
	query = addColumSelects(ctx, query, columns, startDate, endDate);

	// Manage required joins
	query = addUserRequirementJoins(ctx, query, wikiEntities, userRequirements, startDate, endDate);
	query = addColumnJoins(ctx, query, wikiEntities, columns, startDate, endDate);

	// Manage required filterings
	query = addUserRequirementFilters(query, wikiEntities, userRequirements, startDate, endDate);
	query = addColumnSelfFilterRules(query, columns);

	query = addOrderBy(query, columns, orderBy);

	if (typeof itemCount != "undefined")
		query.limit(itemCount);

	appCtx.logger.info(`[createStatisticsQuery] SQL: ${query.getSql()}`);

	if (columns && columns.length > 0) {
		return await query.getRawMany();
	} else {
		return await query.getRawMany<{ actorId: number }>();
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

	if ((typeof userRequirements.userGroups !== "undefined" && userRequirements.userGroups.length > 0)
		|| (typeof userRequirements.notInUserGroups !== "undefined" && userRequirements.notInUserGroups.length > 0)) {
		const allMentionedUserGroups = new Set<UserGroup>([
			...(userRequirements.userGroups ?? []),
			...(userRequirements.notInUserGroups || []),
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

		const epochDate = typeof ele === "number"
			? endDate
			: moment.utc(endDate).subtract(ele.epoch * -1, "days");

		addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, epochDate);
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

		const periodStatCalculationStartDate = typeof ele.epoch === "number"
			? moment.utc(endDate).subtract(ele.period + ele.epoch * -1, "days")
			: moment.utc(endDate).subtract(ele.period, "days");
		const periodStatCalculationEndDate = typeof ele.epoch === "number"
			? moment.utc(endDate).subtract(ele.epoch * -1, "days")
			: endDate;

		addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, periodStatCalculationStartDate);
		addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, periodStatCalculationEndDate);
	}

	for (const ele of [
		userRequirements.totalEditsMilestoneReachedInPeriod,
		userRequirements.totalRevertedEditsMilestoneReachedInPeriod,
		userRequirements.totalReceivedThanksMilestoneReachedInPeriod,
		userRequirements.totalActiveDaysMilestoneReachedInPeriod,
	]) {
		if (!ele)
			continue;

		addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
		addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
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

		const periodStatCalculationStartDate = typeof ele.epoch === "number"
			? moment.utc(endDate).subtract(ele.period + ele.epoch * -1, "days")
			: moment.utc(endDate).subtract(ele.period, "days");
		const periodStatCalculationEndDate = typeof ele.epoch === "number"
			? moment.utc(endDate).subtract(ele.epoch * -1, "days")
			: endDate;

		for (const ct of Array.isArray(ele.changeTag) ? ele.changeTag : [ele.changeTag]) {
			const ctCollector = getOrCreateChangeTagCollector(ctx, ct);
			ctCollector.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodStarts, periodStatCalculationStartDate);
			addNeededPeriodToCollection(ctCollector.neededDates.neededActorPeriodEnds, periodStatCalculationEndDate);
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

	// User groups
	if (typeof userRequirements.userGroups !== "undefined") {
		const userGroups = userRequirements.userGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId = actor.actorId`;
			}).join(" OR ")
			+ ")");
	}

	let templateIndex = 0;
	if (typeof userRequirements.hasUserPageTemplates !== "undefined") {
		for (const templateName of userRequirements.hasUserPageTemplates) {
			query = query.andWhere(qb => {
				const subQuery = qb.subQuery()
					.select("1")
					.from(wikiEntities.actorUserPageTemplate, "att")
					.innerJoin(
						wikiEntities.template,
						"tmpl",
						"tmpl.templatePageId = att.templatePageId "

					)
					.where("att.actorId = actor.actorId")
					.andWhere(
						`tmpl.templateName = :template${templateIndex}Name`,
						{ [`template${templateIndex}Name`]: templateName }
					)
					.getQuery();

				return `EXISTS(${subQuery})`;
			});

			templateIndex++;
		}
	}

	if (typeof userRequirements.hasNoUserPageTemplates !== "undefined") {
		for (const templateName of userRequirements.hasNoUserPageTemplates) {
			query = query.andWhere(qb => {
				const subQuery = qb.subQuery()
					.select("1")
					.from(wikiEntities.actorUserPageTemplate, "att")
					.innerJoin(
						wikiEntities.template,
						"tmpl",
						"tmpl.templatePageId = att.templatePageId "

					)
					.where("att.actorId = actor.actorId")
					.andWhere(
						`tmpl.templateName = :template${templateIndex}Name`,
						{ [`template${templateIndex}Name`]: templateName }
					)
					.getQuery();

				return `NOT EXISTS(${subQuery})`;
			});

			templateIndex++;
		}
	}

	// Not in user groups
	if (typeof userRequirements.notInUserGroups !== "undefined") {
		const userGroups = userRequirements.notInUserGroups;

		query = query.andWhere("("
			+ userGroups.map((group: string): string => {
				return `${sanitizeNameForSql(group)}GroupCheck.actorId <> actor.actorId`;
			}).join(" AND ")
			+ ")");
	}

	// Total edits at least
	if (typeof userRequirements.totalEditsAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalEditsAtLeast, endDate);

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
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalEditsAtMost, endDate);

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
		&& typeof startDate !== "undefined"
	) {
		const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

		const whereParameters: { [index: string]: unknown } = {};
		query = query.andWhere(
			"(" + userRequirements.totalEditsMilestoneReachedInPeriod.map((milestone, index) => {
				const milestoneParameterKey = `totalEditsMilestone${index}`;
				whereParameters[milestoneParameterKey] = milestone;
				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) >= :${milestoneParameterKey}`
					+ `AND IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0) < :${milestoneParameterKey}`;
			}).join(" OR ") + ")",
			whereParameters
		);
	}


	// Period edits at least
	if (typeof userRequirements.inPeriodEditsAtLeast !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodEditsAtLeast, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{ inPeriodEditsAtLeast: userRequirements.inPeriodEditsAtLeast.count }
		);
	}

	// Period edits at most
	if (typeof userRequirements.inPeriodEditsAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodEditsAtMost, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{ inPeriodEditsAtLeast: userRequirements.inPeriodEditsAtMost.count }
		);
	}

	// Total edits with change tag at least
	if (typeof userRequirements.totalEditsWithChangeTagAtLeast !== "undefined") {
		const changeTags = Array.isArray(userRequirements.totalEditsWithChangeTagAtLeast.changeTag)
			? userRequirements.totalEditsWithChangeTagAtLeast.changeTag
			: [userRequirements.totalEditsWithChangeTagAtLeast.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const totalEditsEpochDate = typeof userRequirements.totalEditsWithChangeTagAtLeast?.epoch !== "number"
					? endDate
					: moment.utc(endDate).subtract(userRequirements.totalEditsWithChangeTagAtLeast.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + ") + " >= :totalEditsWithChangeTagAtLeast",
			{ totalEditsWithChangeTagAtLeast: userRequirements.totalEditsWithChangeTagAtLeast.edits });
	}

	// Total edits with change tag at most
	if (typeof userRequirements.totalEditsWithChangeTagAtMost !== "undefined") {
		const changeTags = Array.isArray(userRequirements.totalEditsWithChangeTagAtMost.changeTag)
			? userRequirements.totalEditsWithChangeTagAtMost.changeTag
			: [userRequirements.totalEditsWithChangeTagAtMost.changeTag];

		query = query.andWhere(
			changeTags.map(ct => {
				const totalEditsEpochDate = typeof userRequirements.totalEditsWithChangeTagAtMost?.epoch !== "number"
					? endDate
					: moment.utc(endDate).subtract(userRequirements.totalEditsWithChangeTagAtMost.epoch * -1, "days");

				const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

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
				const periodStatCalculationStartDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
					: moment.utc(endDate).subtract(reqInPeriod.period, "days");
				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "beforePeriodStart", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

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
				const periodStatCalculationStartDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
					: moment.utc(endDate).subtract(reqInPeriod.period, "days");
				const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
					? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
					: endDate;

				const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "beforePeriodStart", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + ") + " <= :inPeriodEditsWithChangeTagAtMost",
			{ inPeriodEditsWithChangeTagAtMost: userRequirements.inPeriodEditsWithChangeTagAtMost.edits }
		);
	}

	// Total reverted edits at least
	if (typeof userRequirements.totalRevertedEditsAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalRevertedEditsAtLeast, endDate);

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
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalRevertedEditsAtMost, endDate);

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
		&& typeof startDate !== "undefined"
	) {
		const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

		const whereParameters: { [index: string]: unknown } = {};
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
			userRequirements.inPeriodRevertedEditsAtLeast, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`
			+ " >= :inPeriodRevertedEditsAtLeast",
			{ inPeriodRevertedEditsAtLeast: userRequirements.inPeriodRevertedEditsAtLeast.count }
		);
	}

	// Period reverted edits at most
	if (typeof userRequirements.inPeriodRevertedEditsAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodRevertedEditsAtMost, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
			+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{ inPeriodRevertedEditsAtMost: userRequirements.inPeriodRevertedEditsAtMost.count }
		);
	}

	// Total received thanks at least
	if (typeof userRequirements.totalReceivedThanksAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalReceivedThanksAtLeast, endDate);

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
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalReceivedThanksAtMost, endDate);

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
		&& typeof startDate !== "undefined"
	) {
		const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

		const whereParameters: { [index: string]: unknown } = {};
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
			userRequirements.inPeriodReceivedThanksAtLeast, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
			+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`
			+ " >= :inPeriodReceivedThanksAtLeast",
			{ inPeriodReceivedThanksAtLeast: userRequirements.inPeriodReceivedThanksAtLeast.count }
		);
	}

	// Period received thanks at most
	if (typeof userRequirements.inPeriodReceivedThanksAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodReceivedThanksAtMost, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
			+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{ inPeriodReceivedThanksAtMost: userRequirements.inPeriodReceivedThanksAtMost.count }
		);
	}

	// Total active days at least
	if (typeof userRequirements.totalActiveDaysAtLeast !== "undefined") {
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalActiveDaysAtLeast, endDate);

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
		const actorEndTableName = getTableNameForUserTotalRequirement(userRequirements.totalActiveDaysAtMost, endDate);

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
		&& typeof startDate !== "undefined"
	) {
		const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
		const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

		const whereParameters: { [index: string]: unknown } = {};
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
			userRequirements.inPeriodActiveDaysAtLeast, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
			+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`
			+ " >= :inPeriodActiveDaysAtLeast",
			{ inPeriodActiveDaysAtLeast: userRequirements.inPeriodActiveDaysAtLeast.count }
		);
	}

	// Period active days at most
	if (typeof userRequirements.inPeriodActiveDaysAtMost !== "undefined") {
		const { actorEndTableName, actorStartTableName } = getTableNamesForUserPeriodRequirement(
			userRequirements.inPeriodActiveDaysAtMost, endDate
		);

		query = query.andWhere(
			`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
			+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`
			+ " >= :inPeriodEditsAtLeast",
			{ inPeriodActiveDaysAtMost: userRequirements.inPeriodActiveDaysAtMost.count }
		);
	}

	return query;
}

function getTableNameForUserTotalRequirement(req: number | UserStatisticsInTimeRequirement, endDate: moment.Moment) {
	const totalEditsEpochDate = typeof req === "number"
		? endDate
		: moment.utc(endDate).subtract(req.epoch * -1, "days");

	const actorEndTableName = makePeriodJoinTableName(totalEditsEpochDate, "atPeriodEnd", "actor");
	return actorEndTableName;
}

function getTableNamesForUserPeriodRequirement(reqInPeriod: UserStatisticsInPeriodRequirement, endDate: moment.Moment, prefix = "") {
	const periodStatCalculationStartDate = typeof reqInPeriod.epoch === "number"
		? moment.utc(endDate).subtract(reqInPeriod.period + reqInPeriod.epoch * -1, "days")
		: moment.utc(endDate).subtract(reqInPeriod.period, "days");
	const periodStatCalculationEndDate = typeof reqInPeriod.epoch === "number"
		? moment.utc(endDate).subtract(reqInPeriod.epoch * -1, "days")
		: endDate;

	const actorStartTableName = makePeriodJoinTableName(periodStatCalculationStartDate, "beforePeriodStart", "actor", prefix);
	const actorEndTableName = makePeriodJoinTableName(periodStatCalculationEndDate, "atPeriodEnd", "actor", prefix);

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
	columns: ListColumn[] | undefined,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
): SelectQueryBuilder<ActorTypeModel> {
	if (!columns || columns.length === 0)
		return query;

	let columnIndex = 0;
	for (const column of columns) {
		query = addSingleColumSelect(ctx, query, column, columnIndex, startDate, endDate);

		columnIndex++;
	}

	return query;
}

function addSingleColumSelect(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	column: ListColumn,
	columnIndex: number,
	startDate: moment.Moment | undefined,
	endDate: moment.Moment
): SelectQueryBuilder<ActorTypeModel> {
	const selectedColumnName = `column${columnIndex}`;

	switch (column.type) {
		case "editsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`, selectedColumnName);
			break;
		}
		case "editsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${wikiStartTableName}.editsToDate + ${wikiStartTableName}.dailyEdits, 0))`, selectedColumnName);
			break;
		}
		case "editsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`, selectedColumnName);
			break;
		}
		case "editsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits)`
				+ " / "
				+ `(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits), 0)`, selectedColumnName);
			break;
		}

		case "editsInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0) `
						+ `- IFNULL(${wikiStartTableName}.editsToDate + ${wikiStartTableName}.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "editsInNamespaceInPeriodPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			const actorTotalStartTableName = makePeriodJoinTableName(endDate, "beforePeriodStart", "actor");
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

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
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.editsToDate + ${wikiEndTableName}.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

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
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsSinceRegistrationByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "revertedEditsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.reveretedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${wikiStartTableName}.revertedEditsToDate + ${wikiStartTableName}.dailyRevertedEdits, 0))`, selectedColumnName);
			break;
		}
		case "revertedEditsInPeriodPercentageToOwnTotalEdits": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits)`
				+ " / "
				+ `(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits), 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsSinceRegistrationPercentageToOwnTotalEdits": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits)`
				+ " / "
				+ `(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits), 0)`, selectedColumnName);
			break;
		}
		case "revertedEditsInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
					+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0) `
						+ `- IFNULL(${actorStartTableName}.revertedEditsToDate + ${actorStartTableName}.dailyRevertedEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0) `
						+ `- IFNULL(${wikiStartTableName}.revertedEditsToDate + ${wikiStartTableName}.dailyRevertedEdits, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "revertedEditsInNamespaceInPeriodPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			const actorTotalStartTableName = makePeriodJoinTableName(endDate, "beforePeriodStart", "actor");
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

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
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.revertedEditsToDate + ${wikiEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "revertedEditsInNamespaceSinceRegistrationPercentageToOwnTotalEdits": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];
			const actorTotalEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.revertedEditsToDate + ${actorEndTableName}.dailyRevertedEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ `IFNULL(${actorTotalEndTableName}.editsToDate + ${actorTotalEndTableName}.dailyEdits, 0)`
				+ ", 0)", selectedColumnName);

			break;
		}

		case "characterChangesInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0)`, selectedColumnName);
			break;
		}
		case "characterChangesInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0) `
				+ `- IFNULL(${wikiStartTableName}.characterChangesToDate + ${wikiStartTableName}.dailyCharacterChanges, 0))`, selectedColumnName);
			break;
		}
		case "characterChangesSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`, selectedColumnName);
			break;
		}
		case "characterChangesSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges)`
				+ " / "
				+ `(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges), 0)`, selectedColumnName);
			break;
		}
		case "characterChangesInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
					+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesInNamespaceInPeriodPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${formatNamespaceParameter(columnPart)}`);
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
						+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "IFNULL((" + namespaces.map(columnPart => {
					const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `(IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0) `
						+ `- IFNULL(${wikiStartTableName}.characterChangesToDate + ${wikiStartTableName}.dailyCharacterChanges, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "characterChangesInNamespaceSinceRegistration": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

				return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesInNamespaceSinceRegistrationPercentageToWikiTotal": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki", `Ns${formatNamespaceParameter(columnPart)}`);

					return `IFNULL(${wikiEndTableName}.characterChangesToDate + ${wikiEndTableName}.dailyCharacterChanges, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "characterChangesInPeriodByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `(IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0) `
					+ `- IFNULL(${actorStartTableName}.characterChangesToDate + ${actorStartTableName}.dailyCharacterChanges, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "characterChangesSinceRegistrationByChangeTag": {
			const changeTags = Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag];

			query = query.addSelect(changeTags.map(ct => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Ct${serializeChangeTagFilterDefinition(ct)}`);

				return `IFNULL(${actorEndTableName}.characterChangesToDate + ${actorEndTableName}.dailyCharacterChanges, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "receivedThanksInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0)`, selectedColumnName);
			break;
		}
		case "receivedThanksInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.receivedThanksToDate + ${actorStartTableName}.dailyReceivedThanks, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.receivedThanksToDate + ${wikiEndTableName}.dailyReceivedThanks, 0) `
				+ `- IFNULL(${wikiStartTableName}.receivedThanksToDate + ${wikiStartTableName}.dailyReceivedThanks, 0))`, selectedColumnName);
			break;
		}
		case "receivedThanksSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks, 0)`, selectedColumnName);
			break;
		}
		case "receivedThanksSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.receivedThanksToDate + ${actorEndTableName}.dailyReceivedThanks)`
				+ " / "
				+ `(${wikiEndTableName}.receivedThanksToDate + ${wikiEndTableName}.dailyReceivedThanks), 0)`, selectedColumnName);
			break;
		}

		case "sentThanksInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.sentThanksToDate + ${actorStartTableName}.dailySentThanks, 0)`, selectedColumnName);
			break;
		}
		case "sentThanksInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${actorStartTableName}.sentThanksToDate + ${actorStartTableName}.dailySentThanks, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.sentThanksToDate + ${wikiEndTableName}.dailySentThanks, 0) `
				+ `- IFNULL(${wikiStartTableName}.sentThanksToDate + ${wikiStartTableName}.dailySentThanks, 0))`, selectedColumnName);
			break;
		}
		case "sentThanksSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks, 0)`, selectedColumnName);
			break;
		}
		case "sentThanksSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.sentThanksToDate + ${actorEndTableName}.dailySentThanks)`
				+ " / "
				+ `(${wikiEndTableName}.sentThanksToDate + ${wikiEndTableName}.dailySentThanks), 0)`, selectedColumnName);
			break;
		}

		case "logEventsInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0)`, selectedColumnName);
			break;
		}
		case "logEventsInPeriodPercentageToWikiTotal": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(`(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`
				+ " / "
				+ `(IFNULL(${wikiEndTableName}.logEventsToDate + ${wikiEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${wikiStartTableName}.logEventsToDate + ${wikiStartTableName}.dailyLogEvents, 0))`, selectedColumnName);
			break;
		}
		case "logEventsSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0)`, selectedColumnName);
			break;
		}
		case "logEventsSinceRegistrationPercentageToWikiTotal": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const wikiEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "wiki");

			query = query.addSelect(
				`IFNULL((${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents)`
				+ " / "
				+ `(${wikiEndTableName}.logEventsToDate + ${wikiEndTableName}.dailyLogEvents), 0)`, selectedColumnName);
			break;
		}

		case "logEventsInPeriodByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];

			query = query.addSelect(logFilters.map(log => {
				const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Log${serializeLogFilterDefinition(log)}`);
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(log)}`);

				return `(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
					+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "logEventsSinceRegistrationByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];

			query = query.addSelect(logFilters.map(log => {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(log)}`);

				return `IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}

		case "firstLogEventDateByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];
			if (logFilters.length === 1) {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(logFilters[0])}`);

				query = query.addSelect(
					`DATE(IFNULL(${actorEndTableName}Date.firstDate, "2100-01-01"))`,
					selectedColumnName
				);
			} else {
				query = query.addSelect("DATE(LEAST(" + logFilters.map(log => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(log)}`);

					return `IFNULL(${actorEndTableName}Date.firstDate, "2100-01-01")`;
				}).join(", ") + "))", selectedColumnName);
			}
			break;
		}

		case "lastLogEventDateByType": {
			const logFilters = Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter];
			if (logFilters.length === 1) {
				const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(logFilters[0])}`);

				query = query.addSelect(
					`DATE(IFNULL(${actorEndTableName}Date.lastDate, "1900-01-01"))`,
					selectedColumnName
				);
			} else {
				query = query.addSelect("DATE(LEAST(" + logFilters.map(log => {
					const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor", `Log${serializeLogFilterDefinition(log)}`);

					return `IFNULL(${actorEndTableName}Date.lastDate, "1900-01-01")`;
				}).join(", ") + "))", selectedColumnName);
			}
			break;
		}
		case "firstEditDate":
			query = query.addSelect("editDates.firstEditDate", selectedColumnName);
			break;
		case "lastEditDate":
			query = query.addSelect("editDates.lastEditDate", selectedColumnName);
			break;
		case "daysBetweenFirstAndLastEdit":
			query = query.addSelect("DATEDIFF(editDates.lastEditDate, editDates.firstEditDate)", selectedColumnName);
			break;
		case "averageEditsPerDayInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				`(IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0) `
				+ `- IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0))`, selectedColumnName);
			break;
		}
		case "averageEditsPerDaySinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

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
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(
				`(IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0) `
				+ `- IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0))`
				+ " / "
				+ `(IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0))`, selectedColumnName);
			break;
		}
		case "averageLogEventsPerDaySinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

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
			query = query.addSelect("DATEDIFF(:endDate, DATE(actor.registrationTimestamp))", selectedColumnName);
			break;

		case "activeDaysInPeriod": {
			const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0) `
				+ `- IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`, selectedColumnName);
			break;
		}
		case "activeDaysSinceRegistration": {
			const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

			query = query.addSelect(`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0)`, selectedColumnName);
			break;
		}

		case "levelAtPeriodStart":
			query = addStartLevelColumnSelects(query, selectedColumnName, startDate);
			break;
		case "levelAtPeriodEnd":
			query = addEndLevelColumnSelects(query, selectedColumnName, endDate);
			break;
		case "levelAtPeriodEndWithChange":
			query = addStartLevelColumnSelects(query, selectedColumnName, startDate);
			query = addEndLevelColumnSelects(query, selectedColumnName, endDate);
			break;
	}

	return query;
}

function addStartLevelColumnSelects(
	query: SelectQueryBuilder<ActorTypeModel>,
	selectedColumnName: string,
	startDate: moment.Moment | undefined
) {
	const actorStartTableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");

	query = query.addSelect(
		`IFNULL(${actorStartTableName}.editsToDate + ${actorStartTableName}.dailyEdits, 0)`,
		`${selectedColumnName}_startEdits`
	);
	query = query.addSelect(
		`IFNULL(${actorStartTableName}.logEventsToDate + ${actorStartTableName}.dailyLogEvents, 0)`,
		`${selectedColumnName}_startLogEvents`
	);
	query = query.addSelect(
		`IFNULL(${actorStartTableName}.activeDaysToDate + ${actorStartTableName}.dailyActiveDay, 0)`,
		`${selectedColumnName}_startActiveDays`
	);
	return query;
}

function addEndLevelColumnSelects(query: SelectQueryBuilder<ActorTypeModel>, selectedColumnName: string, endDate: moment.Moment) {
	const actorEndTableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");

	query = query.addSelect(
		`IFNULL(${actorEndTableName}.editsToDate + ${actorEndTableName}.dailyEdits, 0)`,
		`${selectedColumnName}_endEdits`
	);
	query = query.addSelect(
		`IFNULL(${actorEndTableName}.logEventsToDate + ${actorEndTableName}.dailyLogEvents, 0)`,
		`${selectedColumnName}_endLogEvents`
	);
	query = query.addSelect(
		`IFNULL(${actorEndTableName}.activeDaysToDate + ${actorEndTableName}.dailyActiveDay, 0)`,
		`${selectedColumnName}_endActiveDays`
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
	if (!columns || columns.length == 0)
		return query;

	for (const column of columns) {
		collectColumnJoinInformation(column, ctx, startDate, endDate);
	}

	query = addDailyStatisticsColumnJoins(ctx, query, wikiEntities);

	query = addEditDateColumnJoins(columns, query, wikiEntities, endDate);

	query = addLogEventDateColumnJoins(columns, query, wikiEntities, endDate);

	for (const namespaceCollection of ctx.columns.requiredNamespaceStatisticsColumns) {
		query = addNamespaceColumnJoins(namespaceCollection, query, wikiEntities, endDate);
	}

	for (const changeTagCollection of ctx.columns.requiredChangeTagStatisticsColumns) {
		query = addChangeTagColumnJoins(changeTagCollection, query, wikiEntities, endDate);
	}

	for (const logTypeCollection of ctx.columns.requiredLogTypeStatisticsColumns) {
		query = addLogTypeColumnJoins(logTypeCollection, query, wikiEntities, endDate);
	}

	return query;
}

function collectColumnJoinInformation(column: ListColumn, ctx: StatisticsQueryBuildingContext, startDate: moment.Moment | undefined, endDate: moment.Moment) {
	switch (column.type) {
		case "editsInPeriod":
		case "revertedEditsInPeriod":
		case "revertedEditsInPeriodPercentageToOwnTotalEdits":
		case "characterChangesInPeriod":
		case "receivedThanksInPeriod":
		case "sentThanksInPeriod":
		case "logEventsInPeriod":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "editsInPeriodPercentageToWikiTotal":
		case "revertedEditsInPeriodPercentageToWikiTotal":
		case "characterChangesInPeriodPercentageToWikiTotal":
		case "receivedThanksInPeriodPercentageToWikiTotal":
		case "sentThanksInPeriodPercentageToWikiTotal":
		case "logEventsInPeriodPercentageToWikiTotal":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			ctx.columns.needsSelectedPeriodWikiStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededWikiPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededWikiPeriodEnds, endDate);
			break;

		case "editsSinceRegistration":
		case "revertedEditsSinceRegistration":
		case "revertedEditsSinceRegistrationPercentageToOwnTotalEdits":
		case "characterChangesSinceRegistration":
		case "receivedThanksSinceRegistration":
		case "sentThanksSinceRegistration":
		case "logEventsSinceRegistration":
			ctx.columns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "editsSinceRegistrationPercentageToWikiTotal":
		case "revertedEditsSinceRegistrationPercentageToWikiTotal":
		case "characterChangesSinceRegistrationPercentageToWikiTotal":
		case "receivedThanksSinceRegistrationPercentageToWikiTotal":
		case "sentThanksSinceRegistrationPercentageToWikiTotal":
		case "logEventsSinceRegistrationPercentageToWikiTotal":
			ctx.columns.needsSinceRegisteredActorStatistics = true;
			ctx.columns.needsSinceRegisteredWikiStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededWikiPeriodEnds, endDate);
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

			if (column.type === "editsInNamespaceInPeriodPercentageToOwnTotalEdits") {
				ctx.columns.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
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
				ctx.columns.needsSinceRegisteredActorStatistics = true;
				addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
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

		case "averageEditsPerDayInPeriod":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;
		case "averageEditsPerDaySinceRegistration":
			ctx.columns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
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
		case "firstLogEventDateByType": {
			for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
				const logTypeCollector = getOrCreateLogTypeCollector(ctx, logFilter);
				logTypeCollector.needsFirstLogEntryDate = true;
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}
		case "lastLogEventDateByType": {
			for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
				const logTypeCollector = getOrCreateLogTypeCollector(ctx, logFilter);
				logTypeCollector.needsLastEntryDate = true;
				addNeededPeriodToCollection(logTypeCollector.neededDates.neededActorPeriodEnds, endDate);
			}
			break;
		}

		case "activeDaysInPeriod":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "levelAtPeriodStart":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			break;

		case "levelAtPeriodEnd":
			ctx.columns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;

		case "levelAtPeriodEndWithChange":
			ctx.columns.needsSelectedPeriodActorStatistics = true;
			ctx.columns.needsSinceRegisteredActorStatistics = true;
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodStarts, startDate);
			addNeededPeriodToCollection(ctx.columns.neededDates.neededActorPeriodEnds, endDate);
			break;
	}
}

function addDailyStatisticsColumnJoins(ctx: StatisticsQueryBuildingContext, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult) {
	if (ctx.columns.needsSelectedPeriodActorStatistics) {
		for (const startDate of ctx.columns.neededDates.neededActorPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor");
			const startDateParameterName = startDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatistics, "lads")
					.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate.toDate() })
					.groupBy("lads.actorId");
			}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

			query = query.innerJoin(
				wikiEntities.actorDailyStatistics,
				tableName,
				`${tableName}.actorId = actor.actorId AND ${tableName}.date = ${tableName}Date.lastDate`
			);
		}
	}

	if (ctx.columns.needsSelectedPeriodWikiStatistics) {
		for (const startDate of ctx.columns.neededDates.neededWikiPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki");
			const startDateParameterName = startDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatistics, "lwds")
					.where(`lwds.date < :${startDateParameterName}`, { [startDateParameterName]: startDate.toDate() });
			}, `${tableName}Date`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatistics,
				tableName,
				`${tableName}.date = ${tableName}Date.lastDate`
			);
		}
	}

	if (ctx.columns.needsSinceRegisteredActorStatistics || ctx.columns.needsSelectedPeriodActorStatistics) {
		for (const endDate of ctx.columns.neededDates.neededActorPeriodEnds) {
			const tableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const endDateParameterName = endDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatistics, "lads")
					.where(`lads.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() })
					.groupBy("lads.actorId");
			}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

			query = query.innerJoin(
				wikiEntities.actorDailyStatistics,
				tableName,
				`${tableName}.actorId = actor.actorId AND ${tableName}.date = ${tableName}Date.lastDate`
			);
		}
	}

	if (ctx.columns.needsSelectedPeriodWikiStatistics
		|| ctx.columns.needsSinceRegisteredWikiStatistics) {
		for (const endDate of ctx.columns.neededDates.neededWikiPeriodEnds) {
			const tableName = makePeriodJoinTableName(endDate, "atPeriodEnd", "actor");
			const endDateParameterName = endDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatistics, "lwds")
					.where(`lwds.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() });
			}, `${tableName}Date`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatistics,
				tableName,
				`${tableName}.date = ${tableName}Date.lastDate`
			);
		}
	}
	return query;
}

function addEditDateColumnJoins(columns: ListColumn[], query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const needsDaysBetweenFirstAndLastEdit = columns.findIndex(x => x.type === "daysBetweenFirstAndLastEdit") !== -1;
	const needsFirstEditDate = needsDaysBetweenFirstAndLastEdit || columns.findIndex(x => x.type === "firstEditDate") !== -1;
	const needsLastEditDate = needsDaysBetweenFirstAndLastEdit || columns.findIndex(x => x.type === "lastEditDate") !== -1;

	if (needsDaysBetweenFirstAndLastEdit || needsFirstEditDate || needsLastEditDate) {
		query = query.innerJoin(qb => {
			let subQuery = qb.subQuery()
				.select("ads.actorId", "actorId");

			if (needsFirstEditDate) {
				subQuery = subQuery.addSelect("MIN(date)", "firstEditDate");
			}

			if (needsLastEditDate) {
				subQuery = subQuery.addSelect("MAX(date)", "lastEditDate");
			}

			return subQuery
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate.toDate() }
				)
				.andWhere("ads.dailyEdits > 0")
				.groupBy("ads.actorId");
		}, "editDates", "editDates.actorId = actor.actorId");
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

function addNamespaceColumnJoins(namespaceCollection: NamespaceRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const namespaceKey = formatNamespaceParameter(namespaceCollection.namespace);

	if (namespaceCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of namespaceCollection.neededDates.neededActorPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ns${namespaceKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
					.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate.toDate() });

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lads");

				return subQuery.groupBy("lads.actorId");
			}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				tableName,
				`${tableName}.actorId = actor.actorId`
				+ ` AND ${tableName}.namespace = :namespace${namespaceCollection.namespace}`
				+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}
	}

	if (namespaceCollection.needsSelectedPeriodWikiStatistics) {
		for (const startDate of namespaceCollection.neededDates.neededWikiPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "wiki", `Ns${namespaceKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				const subQuery = qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatisticsByNamespace, "lwds")
					.where(`lwds.date < :${startDateParameterName}`, { [startDateParameterName]: startDate.toDate() });

				return createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lwds");
			}, `${tableName}Date`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				tableName,
				`${tableName}.date = ${namespaceKey}Date.lastDate`
				+ ` AND ${tableName}.namespace = :namespace${namespaceCollection.namespace}`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}
	}

	if (namespaceCollection.needsSinceRegisteredActorStatistics || namespaceCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of namespaceCollection.neededDates.neededActorPeriodEnds) {
			const tableName = makePeriodJoinTableName(startDate, "atPeriodEnd", "actor", `Ns${namespaceKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
					.where(`lads.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() })
					.groupBy("lads.actorId");

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lads");

				return subQuery.groupBy("lads.actorId");
			}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				tableName,
				`${tableName}.actorId = actor.actorId `
				+ ` AND ${tableName}.namespace = :namespace${namespaceCollection.namespace}`
				+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}
	}

	if (namespaceCollection.needsSelectedPeriodWikiStatistics || namespaceCollection.needsSinceRegisteredWikiStatistics) {
		for (const startDate of namespaceCollection.neededDates.neededWikiPeriodEnds) {
			const tableName = makePeriodJoinTableName(startDate, "atPeriodEnd", "wiki", `Ns${namespaceKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			query = query.leftJoin(qb => {
				const subQuery = qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatisticsByNamespace, "lwds")
					.where(`lwds.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() });

				return createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lwds");
			}, `${tableName}Date`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				tableName,
				`${tableName}.date = ${tableName}Date.lastDate`
				+ ` AND ${tableName}.namespace = :namespace${namespaceCollection.namespace}`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}
	}
	return query;
}

function addChangeTagColumnJoins(changeTagCollection: ChangeTagStatisticsRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const normalizedCtKey = changeTagCollection.serializedChangeTagFilter;

	if (changeTagCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of changeTagCollection.neededDates.neededActorPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Ct${normalizedCtKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			if (typeof changeTagCollection.changeTagFilter.namespace !== "number") {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorEditStatisticsByChangeTag, "lads")
						.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate?.toDate() });

					subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByChangeTag,
					tableName,
					`${tableName}.actorId = actor.actorId`
					+ ` AND ${tableName}.changeTagId = :changeTag${changeTagCollection.changeTagFilter.changeTagId}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`changeTag${changeTagCollection.changeTagFilter.changeTagId}`]: changeTagCollection.changeTagFilter.changeTagId
					}
				);
			} else {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag, "lads")
						.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate?.toDate() });

					subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByNamespaceAndChangeTag,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId`
					+ ` AND ${tableName}.namespace = :namespace${changeTagCollection.changeTagFilter.namespace}`
					+ ` AND ${tableName}.changeTagId = :changeTag${changeTagCollection.changeTagFilter.changeTagId}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`namespace${changeTagCollection.changeTagFilter.namespace}`]: changeTagCollection.changeTagFilter.namespace,
						[`changeTag${changeTagCollection.changeTagFilter.changeTagId}`]: changeTagCollection.changeTagFilter.changeTagId
					}
				);
			}
		}
	}

	if (changeTagCollection.needsSinceRegisteredActorStatistics || changeTagCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of changeTagCollection.neededDates.neededActorPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "atPeriodEnd", "actor", `Ct${normalizedCtKey}`);
			const endDateParameterName = endDate.format("YYYYMMDD");

			if (typeof changeTagCollection.changeTagFilter.namespace !== "number") {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorEditStatisticsByChangeTag, "lads")
						.where(`lads.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() })
						.groupBy("lads.actorId");

					subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByChangeTag,
					tableName,
					`${tableName}.actorId = actor.actorId `
					+ ` AND ${tableName}.changeTagId = :changeTag${changeTagCollection.changeTagFilter.changeTagId}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`changeTag${changeTagCollection.changeTagFilter.changeTagId}`]: changeTagCollection.changeTagFilter.changeTagId
					}
				);
			} else {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag, "lads")
						.where(`lads.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() })
						.groupBy("lads.actorId");

					subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorEditStatisticsByNamespaceAndChangeTag,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId `
					+ ` AND ${tableName}.namespace = :namespace${changeTagCollection.changeTagFilter.namespace}`
					+ ` AND ${tableName}.changeTagId = :changeTag${changeTagCollection.changeTagFilter.changeTagId}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`namespace${changeTagCollection.changeTagFilter.namespace}`]: changeTagCollection.changeTagFilter.namespace,
						[`changeTag${changeTagCollection.changeTagFilter.changeTagId}`]: changeTagCollection.changeTagFilter.changeTagId
					}
				);
			}
		}
	}
	return query;
}

function addLogTypeColumnJoins(logTypeCollection: LogTypeStatisticsRequiredColumns, query: SelectQueryBuilder<ActorTypeModel>, wikiEntities: WikiStatisticsTypesResult, endDate: moment.Moment) {
	const normalizedLogKey = logTypeCollection.serializedLogFilter;

	if (logTypeCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of logTypeCollection.neededDates.neededActorPeriodStarts) {
			const tableName = makePeriodJoinTableName(startDate, "beforePeriodStart", "actor", `Log${normalizedLogKey}`);
			const startDateParameterName = startDate.format("YYYYMMDD");

			if (typeof logTypeCollection.logFilter.logAction === "string" && typeof logTypeCollection.logFilter.logType === "string") {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorLogStatisticsByLogTypeAndLogAction, "lads")
						.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate?.toDate() });

					subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogTypeAndLogAction,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId`
					+ ` AND ${tableName}.logType = :logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`
					+ ` AND ${tableName}.logAction = :logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`]: logTypeCollection.logFilter.logType,
						[`logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`]: logTypeCollection.logFilter.logAction,
					}
				);
			} else if (typeof logTypeCollection.logFilter.logAction === "string") {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorLogStatisticsByLogAction, "lads")
						.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate?.toDate() });

					subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogAction,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId`
					+ ` AND ${tableName}.logAction = :logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`]: logTypeCollection.logFilter.logAction
					}
				);
			} else if (typeof logTypeCollection.logFilter.logType === "string") {
				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId")
						.addSelect("MAX(lads.date)", "lastDate")
						.from(wikiEntities.actorLogStatisticsByLogType, "lads")
						.where(`lads.date < :${startDateParameterName}`, { [startDateParameterName]: startDate?.toDate() });

					subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);

				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogType,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId`
					+ ` AND ${tableName}.logType = :logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`]: logTypeCollection.logFilter.logType
					}
				);
			}
		}
	}

	if (logTypeCollection.needsSinceRegisteredActorStatistics
		|| logTypeCollection.needsSelectedPeriodActorStatistics
		|| logTypeCollection.needsFirstLogEntryDate
		|| logTypeCollection.needsLastEntryDate) {
		const entity = typeof logTypeCollection.logFilter.logAction === "string" && typeof logTypeCollection.logFilter.logType === "string" ? wikiEntities.actorLogStatisticsByLogTypeAndLogAction
			: typeof logTypeCollection.logFilter.logAction === "string" ? wikiEntities.actorLogStatisticsByLogAction
				: typeof logTypeCollection.logFilter.logType === "string" ? wikiEntities.actorLogStatisticsByLogType
					: null;

		if (entity) {
			for (const startDate of logTypeCollection.neededDates.neededActorPeriodEnds) {
				const tableName = makePeriodJoinTableName(startDate, "atPeriodEnd", "actor", `Log${normalizedLogKey}`);
				const endDateParameterName = endDate.format("YYYYMMDD");

				query = query.leftJoin(qb => {
					let subQuery = qb.subQuery()
						.select("lads.actorId", "actorId");

					if (logTypeCollection.needsFirstLogEntryDate) {
						subQuery = subQuery.addSelect("MIN(lads.date)", "firstDate");
					}

					if (logTypeCollection.needsSinceRegisteredActorStatistics
						|| logTypeCollection.needsSelectedPeriodActorStatistics
						|| logTypeCollection.needsLastEntryDate) {
						subQuery = subQuery.addSelect("MAX(lads.date)", "lastDate");
					}

					subQuery = subQuery.from(entity, "lads")
						.where(`lads.date <= :${endDateParameterName}`, { [endDateParameterName]: endDate.toDate() })
						.groupBy("lads.actorId");

					subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

					return subQuery.groupBy("lads.actorId");
				}, `${tableName}Date`, `${tableName}Date.actorId = actor.actorId`);
			}
		}
	}

	if (logTypeCollection.needsSinceRegisteredActorStatistics || logTypeCollection.needsSelectedPeriodActorStatistics) {
		for (const startDate of logTypeCollection.neededDates.neededActorPeriodEnds) {
			const tableName = makePeriodJoinTableName(startDate, "atPeriodEnd", "actor", `Log${normalizedLogKey}`);

			if (typeof logTypeCollection.logFilter.logAction === "string" && typeof logTypeCollection.logFilter.logType === "string") {
				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogTypeAndLogAction,
					tableName,
					`${tableName}.actorId = actor.actorId `
					+ ` AND ${tableName}.logType = :logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`
					+ ` AND ${tableName}.logAction = :logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`]: logTypeCollection.logFilter.logType,
						[`logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`]: logTypeCollection.logFilter.logAction,
					}
				);
			} else if (typeof logTypeCollection.logFilter.logAction === "string") {
				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogAction,
					tableName,
					`${tableName}.actorId = actor.actorId `
					+ ` AND ${tableName}.logAction = :logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logAction${sanitizeNameForSql(logTypeCollection.logFilter.logAction)}`]: logTypeCollection.logFilter.logAction
					}
				);
			} else if (typeof logTypeCollection.logFilter.logType === "string") {
				query = query.leftJoin(
					wikiEntities.actorLogStatisticsByLogType,
					`${tableName}`,
					`${tableName}.actorId = actor.actorId `
					+ ` AND ${tableName}.logType = :logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`
					+ ` AND ${tableName}.date = ${tableName}Date.lastDate`,
					{
						[`logType${sanitizeNameForSql(logTypeCollection.logFilter.logType)}`]: logTypeCollection.logFilter.logType
					}
				);
			}
		}
	}
	return query;
}

function createNamespaceWhereClauseFromNamespaceDefinition(
	namespaceCollection: NamespaceRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	queryBuilder = queryBuilder.andWhere(
		`${tableAlias}.namespace = :namespace${namespaceCollection.namespace}`,
		{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
	);

	return queryBuilder;
}

function createChangeTagWhereClauseFromFilterDefinition(
	ctCollection: ChangeTagStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	if (typeof ctCollection.changeTagFilter.namespace === "number") {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.namespace = :namespace${ctCollection.changeTagFilter.namespace}`,
			{ [`namespace${ctCollection.changeTagFilter.namespace}`]: ctCollection.changeTagFilter.namespace }
		);
	}

	queryBuilder = queryBuilder.andWhere(
		`${tableAlias}.changeTagId = :changeTagId${ctCollection.changeTagFilter.changeTagId}`,
		{ [`changeTagId${ctCollection.changeTagFilter.changeTagId}`]: ctCollection.changeTagFilter.changeTagId }
	);

	return queryBuilder;
}

function createLogWhereClauseFromFilterDefinition(
	namespaceCollection: LogTypeStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	if (typeof namespaceCollection.logFilter.logType === "string") {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.logType = :logType${namespaceCollection.logFilter.logType.replace("-", "_")}`,
			{ [`logType${namespaceCollection.logFilter.logType.replace("-", "_")}`]: namespaceCollection.logFilter.logType.replace("-", "_") }
		);
	}

	if (typeof namespaceCollection.logFilter.logAction === "string") {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.logAction = :logAction${namespaceCollection.logFilter.logAction.replace("-", "_")}`,
			{ [`logAction${namespaceCollection.logFilter.logAction.replace("-", "_")}`]: namespaceCollection.logFilter.logAction.replace("-", "_") }
		);
	}

	return queryBuilder;
}

function addOrderBy(
	query: SelectQueryBuilder<ActorTypeModel>,
	columns: ListColumn[] | undefined,
	orderByList?: ListOrderBy[] | undefined
) {
	if (!orderByList
		|| orderByList.length === 0
		|| !columns
		|| columns.length === 0
	) {
		return query;
	}

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

		query = query.addOrderBy(
			referencedColumn.type === "userName"
				? "actorName"
				: `column${referencedColumnIndex} `,
			orderBy.direction === "descending" ? "DESC" : "ASC"
		);
	}

	return query;
}

function getOrCreateNamespaceCollector(ctx: StatisticsQueryBuildingContext, namespace: number): NamespaceRequiredColumns {
	let existingCollector = ctx.columns.requiredNamespaceStatisticsColumns.find(x =>
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
		ctx.columns.requiredNamespaceStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function formatNamespaceParameter(namespace: number | number[]): string {
	return Array.isArray(namespace)
		? namespace.join("_")
		: namespace.toString();
}

function getOrCreateChangeTagCollector(ctx: StatisticsQueryBuildingContext, changeTagFilter: ChangeTagFilterDefinition): ChangeTagStatisticsRequiredColumns {
	const serializedChangeTagFilter = formatChangeTagFilterDefinitionCollection(changeTagFilter);

	let existingCollector = ctx.columns.requiredChangeTagStatisticsColumns
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
		ctx.columns.requiredChangeTagStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function formatChangeTagFilterDefinitionCollection(changeTagFilter: ChangeTagFilterDefinition | ChangeTagFilterDefinition[]): string {
	return Array.isArray(changeTagFilter)
		? changeTagFilter.map(x => serializeChangeTagFilterDefinition(x)).join("_")
		: serializeChangeTagFilterDefinition(changeTagFilter).toString();
}

function serializeChangeTagFilterDefinition(changeTagFilter: ChangeTagFilterDefinition) {
	return sanitizeNameForSql(`${changeTagFilter.namespace ?? "any"}_${changeTagFilter.changeTagId}`);
}

function getOrCreateLogTypeCollector(ctx: StatisticsQueryBuildingContext, logFilter: LogFilterDefinition): LogTypeStatisticsRequiredColumns {
	const serializedLogFilter = formatLogFilterDefinitionCollection(logFilter);

	let existingCollector = ctx.columns.requiredLogTypeStatisticsColumns
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
			needsFirstLogEntryDate: false,
			needsLastEntryDate: false
		};
		ctx.columns.requiredLogTypeStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}

function formatLogFilterDefinitionCollection(logFilter: LogFilterDefinition | LogFilterDefinition[]): string {
	return Array.isArray(logFilter)
		? logFilter.map(x => serializeLogFilterDefinition(x)).join("_")
		: serializeLogFilterDefinition(logFilter).toString();
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
	type: JoinedTableType,
	subject: JoinedTableSubject,
	prefix: string = ""
): string {
	const formattedDate = date?.format("YYYYMMDD") ?? "??";
	const prefixWithUnderscore = prefix && prefix.length > 0 ? `_${prefix}` : "";

	switch (type) {
		case "beforePeriodStart":
			return subject === "actor"
				? `actorBefore${prefixWithUnderscore}_${formattedDate}`
				: `wikiBefore${prefixWithUnderscore}_${formattedDate}`;
		case "atPeriodEnd":
			return subject === "actor"
				? `actorEnd${prefixWithUnderscore}_${formattedDate}`
				: `wikiEnd${prefixWithUnderscore}_${formattedDate}`;
	}
}
