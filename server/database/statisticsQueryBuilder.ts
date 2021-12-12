import { addDays, subDays } from "date-fns";
import { Connection, SelectQueryBuilder } from "typeorm";
import { UserRequirements } from "../../common/modules/commonConfiguration";
import { AllColumnTypes, ListColumn, ListOrderBy } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { arrayHasAny } from "../helpers/collectionUtils";
import { ActorTypeModel, DailyStatisticsTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

type RequiredColumns = {
	requiredColumnsForSelectedPeriodActorStatistics: AllColumnTypes[];
	requiredColumnsForSelectedPeriodWikiStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredActorStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredWikiStatistics: AllColumnTypes[];
}


type NamespaceRequiredColumns = RequiredColumns & {
	namespace: number;
};

type LogTypeStatisticsRequiredColumns = RequiredColumns & {
	logType: string | null;
	logAction: string | null;
};

interface StatisticsQueryBuildingContext {
	columns: RequiredColumns & {
		requiredNamespaceStatisticsColumns: NamespaceRequiredColumns[];
		requiredLogTypeStatisticsColumns: LogTypeStatisticsRequiredColumns[];
	};
}

export interface ActorLike {
	aId: number;
}

export async function createStatisticsQuery({ appCtx, toolsDbConnection, wikiEntities, userRequirements, columns, orderBy, itemCount: itemCount, startDate, endDate }: {
	appCtx: AppRunningContext,
	toolsDbConnection: Connection,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	columns?: ListColumn[],
	orderBy?: ListOrderBy[],
	itemCount?: number;
	startDate?: Date,
	endDate: Date
}): Promise<ActorLike[]> {

	const ctx: StatisticsQueryBuildingContext = {
		columns: {
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: [],
			requiredNamespaceStatisticsColumns: [],
			requiredLogTypeStatisticsColumns: [],
		}
	};



	let query = toolsDbConnection.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "aId");
	// .leftJoinAndSelect("actor.actorGroups", "groups");

	// Manage selects from column definitions
	query = addColumSelects(ctx, query, columns);

	// Manage required joins
	query = addUserRequirementJoins(query, wikiEntities, userRequirements, endDate);
	query = addColumnJoins(ctx, query, wikiEntities, columns, startDate, endDate);

	// Manage required filterings
	query = addUserRequirementFilters(query, wikiEntities, userRequirements, endDate);
	query = addColumnFilters(ctx, query, wikiEntities, columns, startDate, endDate);

	query = addOrderBy(query, columns, orderBy);

	if (typeof itemCount != "undefined")
		query.limit(itemCount);

	appCtx.logger.info(`[createStatisticsQuery] SQL: ${query.getSql()}`);

	if (columns && columns.length > 0) {
		return await query.getRawMany();
	} else {
		return await query.getRawMany<{ aId: number }>();
	}
}

function addUserRequirementJoins(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	endDate: Date
) {
	if (!userRequirements) {
		return query;
	}

	if (typeof userRequirements.totalEditsAtLeast !== "undefined") {
		query = query.leftJoin(wikiEntities.actorDailyStatistics, "totalEditsAtLeast", "totalEditsAtLeast.actorId = actor.actorId");
	}

	if (typeof userRequirements.totalEditsAtMost !== "undefined") {
		query = query.leftJoin(wikiEntities.actorDailyStatistics, "totalEditsAtMost", "totalEditsAtMost.actorId = actor.actorId");
	}

	if (typeof userRequirements.inPeriodEditsAtLeast !== "undefined") {
		const periodEditsCalculationStartDate = typeof userRequirements.inPeriodEditsAtLeast.epoch === "number"
			? subDays(endDate, userRequirements.inPeriodEditsAtLeast.period + userRequirements.inPeriodEditsAtLeast.epoch * -1)
			: subDays(endDate, userRequirements.inPeriodEditsAtLeast.period);
		const periodEditsCalculationEndDate = typeof userRequirements.inPeriodEditsAtLeast.epoch === "number"
			? subDays(endDate, userRequirements.inPeriodEditsAtLeast.epoch * -1)
			: endDate;

		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("peal.actorId", "actorId")
				.addSelect("SUM(peal.dailyEdits)", "periodEdits")
				.from(wikiEntities.actorDailyStatistics, "peal")
				.where(
					"peal.date >= :startDate AND peal.date <= :endDate",
					{ startDate: periodEditsCalculationStartDate, endDate: periodEditsCalculationEndDate }
				)
				.groupBy("peal.actorId");
		}, "periodEditsAtLeast", "periodEditsAtLeast.actorId = actor.actorId");
	}

	if (typeof userRequirements.inPeriodEditsAtMost !== "undefined") {
		const periodEditsCalculationStartDate = typeof userRequirements.inPeriodEditsAtMost.epoch === "number"
			? subDays(endDate, userRequirements.inPeriodEditsAtMost.period + userRequirements.inPeriodEditsAtMost.epoch * -1)
			: subDays(endDate, userRequirements.inPeriodEditsAtMost.period);
		const periodEditsCalculationEndDate = typeof userRequirements.inPeriodEditsAtMost.epoch === "number"
			? subDays(endDate, userRequirements.inPeriodEditsAtMost.epoch * -1)
			: endDate;

		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("peam.actorId", "actorId")
				.addSelect("SUM(peam.dailyEdits)", "periodEdits")
				.from(wikiEntities.actorDailyStatistics, "peam")
				.where(
					"peam.date >= :startDate AND peam.date <= :endDate",
					{ startDate: periodEditsCalculationStartDate, endDate: periodEditsCalculationEndDate }
				)
				.groupBy("peam.actorId");
		}, "periodEditsAtMost", "periodEditsAtMost.actorId = actor.actorId");
	}

	return query;
}

function addUserRequirementFilters(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements | undefined,
	endDate: Date
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
			"DATEDIFF(:epoch, actor.registrationTimestamp) >= :registrationAgeAtLeast",
			{ epoch: endDate, registrationAgeAtLeast: userRequirements.registrationAgeAtLeast }
		);
		needsRegDateFilter = true;
	}

	// Registration age at most
	if (typeof userRequirements.registrationAgeAtMost === "number") {
		query = query.andWhere(
			"DATEDIFF(:epoch, actor.registrationTimestamp) <= :registrationAgeAtMost",
			{ epoch: endDate, registrationAgeAtMost: userRequirements.registrationAgeAtMost }
		);
		needsRegDateFilter = true;
	}

	if (needsRegDateFilter) {
		query = query.andWhere("actor.registrationTimestamp < :nextDate", { nextDate: addDays(endDate, 1) });
	}

	// User groups
	if (typeof userRequirements.userGroups !== "undefined") {
		for (const groupName of userRequirements.userGroups) {
			query = query.andWhere(qb => {
				const subQuery = qb.subQuery()
					.select("1")
					.from(wikiEntities.actorGroup, "gr")
					.where("gr.actor_id = actor.actorId")
					.andWhere("gr.group_name = :groupName", { groupName: groupName })
					.getQuery();

				return `EXISTS(${subQuery})`;
			});
		}
	}

	// Total edits at least
	if (typeof userRequirements.totalEditsAtLeast !== "undefined") {
		const totalEditsEpochDate = typeof userRequirements.totalEditsAtLeast === "number"
			? endDate
			: subDays(endDate, userRequirements.totalEditsAtLeast.epoch * -1);

		query = query.andWhere(qb => {
			const subQuery = qb.subQuery()
				.select("MAX(iats.date)", "date")
				.from(wikiEntities.actorDailyStatistics, "iats")
				.where("iats.date <= :date", { date: totalEditsEpochDate })
				.andWhere("iats.actorId = actor.actorId")
				.getQuery();

			return "totalEditsAtLeast.date = " + subQuery;
		});

		const editsAtLeast = typeof userRequirements.totalEditsAtLeast === "number"
			? userRequirements.totalEditsAtLeast
			: userRequirements.totalEditsAtLeast.edits;

		query = query.andWhere("totalEditsAtLeast.editsToDate + totalEditsAtLeast.dailyEdits >= :edits", { edits: editsAtLeast });
	}

	// Total edits at most
	if (typeof userRequirements.totalEditsAtMost !== "undefined") {
		const totalEditsEpochDate = typeof userRequirements.totalEditsAtMost === "number"
			? endDate
			: subDays(endDate, userRequirements.totalEditsAtMost.epoch * -1);

		query = query.andWhere(qb => {
			const subQuery = qb.subQuery()
				.select("MAX(iats.date)", "date")
				.from(wikiEntities.actorDailyStatistics, "iats")
				.where("iats.date <= :date", { date: totalEditsEpochDate })
				.andWhere("iats.actorId = actor.actorId")
				.getQuery();

			return "totalEditsAtMost.date = " + subQuery;
		});

		const editsAtLeast = typeof userRequirements.totalEditsAtMost === "number"
			? userRequirements.totalEditsAtMost
			: userRequirements.totalEditsAtMost.edits;

		query = query.andWhere("totalEditsAtMost.editsToDate + totalEditsAtMost.dailyEdits <= :edits", { edits: editsAtLeast });
	}

	// Period edits at least
	if (typeof userRequirements.inPeriodEditsAtLeast !== "undefined") {
		query = query.andWhere("periodEditsAtLeast.periodEdits >= :editsAtLeast", { editsAtLeast: userRequirements.inPeriodEditsAtLeast.edits });
	}

	// Period edits at most
	if (typeof userRequirements.inPeriodEditsAtMost !== "undefined") {
		query = query.andWhere("periodEditsAtMost.periodEdits >= :editsAtMost", { editsAtMost: userRequirements.inPeriodEditsAtMost.edits });
	}
	return query;
}

function addColumSelects(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	columns: ListColumn[] | undefined
): SelectQueryBuilder<ActorTypeModel> {
	if (!columns || columns.length === 0)
		return query;

	let columnIndex = 0;
	for (const column of columns) {
		query = addSingleColumSelect(ctx, query, column, columnIndex);

		columnIndex++;
	}

	return query;
}

function addSingleColumSelect(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	column: ListColumn,
	columnIndex: number
): SelectQueryBuilder<ActorTypeModel> {
	const selectedColumnName = `column${columnIndex}`;

	switch (column.type) {
		case "userName":
			query = query.addSelect("actor.actorName", selectedColumnName);
			break;

		case "editsInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorEditsInPeriod, 0)", selectedColumnName);
			break;
		case "editsInPeriodPercentage":
			query = query.addSelect("IFNULL(periodActorStatistics.actorEditsInPeriod / periodWikiStatistics.wikiEditsInPeriod * 100, 0)", selectedColumnName);
			break;
		case "editsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0)", selectedColumnName);
			break;
		case "editsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits)"
				+ " / "
				+ "(sinceStartWikiStatistics.editsToDate + sinceStartWikiStatistics.dailyEdits) * 100, 0)", selectedColumnName);
			break;

		case "editsInNamespaceInPeriod":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorEditsInPeriod, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorEditsInPeriod / ns${column.namespace}PeriodWikiStatistics.wikiEditsInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${column.namespace}SinceRegistrationActorStatistics.editsToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyEdits, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${column.namespace}SinceRegistrationActorStatistics.editsToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyEdits)`
				+ " / "
				+ `(ns${column.namespace}SinceStartWikiStatistics.editsToDate + ns${column.namespace}SinceStartWikiStatistics.dailyEdits) * 100, 0)`, selectedColumnName);
			break;

		case "revertedEditsInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorRevertedEditsInPeriod, 0)", selectedColumnName);
			break;
		case "revertedEditsInPeriodPercentage":
			query = query.addSelect("IFNULL(periodActorStatistics.actorRevertedEditsInPeriod / periodWikiStatistics.wikiRevertedEditsInPeriod * 100, 0)", selectedColumnName);
			break;
		case "revertedEditsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits, 0)", selectedColumnName);
			break;
		case "revertedEditsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits)"
				+ " / "
				+ "(sinceStartWikiStatistics.revertedEditsToDate + sinceStartWikiStatistics.dailyRevertedEdits) * 100, 0)", selectedColumnName);
			break;

		case "revertedEditsInNamespaceInPeriod":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorRevertedEditsInPeriod, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorRevertedEditsInPeriod / ns${column.namespace}PeriodWikiStatistics.wikiRevertedEditsInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${column.namespace}SinceRegistrationActorStatistics.revertedEditsToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyRevertedEdits, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${column.namespace}SinceRegistrationActorStatistics.revertedEditsToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyRevertedEdits)`
				+ " / "
				+ `(ns${column.namespace}SinceStartWikiStatistics.revertedEditsToDate + ns${column.namespace}SinceStartWikiStatistics.dailyRevertedEdits) * 100, 0)`, selectedColumnName);
			break;

		case "firstEditDate":
			query = query.addSelect("firstEditDate.date", selectedColumnName);
			break;
		case "lastEditDate":
			query = query.addSelect("lastEditDate.date", selectedColumnName);
			break;
		case "daysBetweenFirstAndLastEdit":
			query = query.addSelect("DATEDIFF(lastEditDate.date, firstEditDate.date)", selectedColumnName);
			break;

		case "averageEditsPerDayInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorEditsInPeriod / DATEDIFF(:endDate, :startDate), 0)", selectedColumnName);
			break;

		case "averageEditsPerDaySinceRegistration":
			query = query.addSelect("IFNULL((sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits)"
				+ " / DATEDIFF(:endDate, DATE(actor.registrationTimestamp)), 0)", selectedColumnName);
			break;

		case "characterChangesInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorCharacterChangesInPeriod, 0)", selectedColumnName);
			break;
		case "characterChangesInPeriodPercentage":
			query = query.addSelect("IFNULL(periodActorStatistics.actorCharacterChangesInPeriod / periodWikiStatistics.wikiCharacterChangesInPeriod * 100, 0)", selectedColumnName);
			break;
		case "characterChangesSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges, 0)", selectedColumnName);
			break;
		case "characterChangesSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges)"
				+ " / "
				+ "(sinceStartWikiStatistics.characterChangesToDate + sinceStartWikiStatistics.dailyCharacterChanges) * 100, 0)", selectedColumnName);
			break;

		case "characterChangesInNamespaceInPeriod":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorCharacterChangesInPeriod, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${column.namespace}PeriodActorStatistics.actorCharacterChangesInPeriod / ns${column.namespace}PeriodWikiStatistics.wikiCharacterChangesInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${column.namespace}SinceRegistrationActorStatistics.characterChangesToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyCharacterChanges, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${column.namespace}SinceRegistrationActorStatistics.characterChangesToDate + ns${column.namespace}SinceRegistrationActorStatistics.dailyCharacterChanges)`
				+ " / "
				+ `(ns${column.namespace}SinceStartWikiStatistics.characterChangesToDate + ns${column.namespace}SinceStartWikiStatistics.dailyCharacterChanges) * 100, 0)`, selectedColumnName);
			break;

		case "thanksInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorThanksInPeriod, 0)", selectedColumnName);
			break;
		case "thanksInPeriodPercentage":
			query = query.addSelect("IFNULL(periodActorStatistics.actorThanksInPeriod / periodWikiStatistics.wikiThanksInPeriod * 100, 0)", selectedColumnName);
			break;
		case "thanksSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.thanksToDate + sinceRegistrationActorStatistics.dailyThanks, 0)", selectedColumnName);
			break;
		case "thanksSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.thanksToDate + sinceRegistrationActorStatistics.dailyThanks)"
				+ " / "
				+ "(sinceStartWikiStatistics.thanksToDate + sinceStartWikiStatistics.dailyThanks) * 100, 0)", selectedColumnName);
			break;

		case "logEventsInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorLogEventsInPeriod, 0)", selectedColumnName);
			break;
		case "logEventsInPeriodPercentage":
			query = query.addSelect("IFNULL(periodActorStatistics.actorLogEventsInPeriod / periodWikiStatistics.wikiLogEventsInPeriod * 100, 0)", selectedColumnName);
			break;
		case "logEventsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0)", selectedColumnName);
			break;
		case "logEventsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents)"
				+ " / "
				+ "(sinceStartWikiStatistics.logEventsToDate + sinceStartWikiStatistics.dailyLogEvents) * 100, 0)", selectedColumnName);
			break;

		case "averageLogEventsPerDayInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.actorLogEventsInPeriod / DATEDIFF(:endDate, :startDate), 0)", selectedColumnName);
			break;

		case "averageLogEventsPerDaySinceRegistration":
			query = query.addSelect("IFNULL((sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents)"
				+ " / DATEDIFF(:endDate, DATE(actor.registrationTimestamp)), 0)", selectedColumnName);
			break;

		case "firstLogEventDate":
			query = query.addSelect("firstLogEventDate.date", selectedColumnName);
			break;
		case "lastLogEventDate":
			query = query.addSelect("lastLogEventDate.date", selectedColumnName);
			break;
		case "daysBetweenFirstAndLastLogEvent":
			query = query.addSelect("DATEDIFF(lastLogEventDate.date, firstLogEventDate.date)", selectedColumnName);
			break;

		case "registrationDate":
			query = query.addSelect("DATE(actor.registrationTimestamp)", selectedColumnName);
			break;

		case "daysSinceRegistration":
			query = query.addSelect("DATEDIFF(:endDate, DATE(actor.registrationTimestamp))", selectedColumnName);
			break;

		case "activeDaysInPeriod":
			query = query.addSelect("IFNULL(periodActorStatistics.activeDays, 0)", selectedColumnName);
			break;
		case "activeDaysSinceRegistration":
			query = query.addSelect("IFNULL(activeDaysSinceRegistration.activeDays, 0)", selectedColumnName);
			break;
	}

	return query;
}


function addColumnJoins(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	columns: ListColumn[] | undefined,
	startDate: Date | undefined,
	endDate: Date,
) {
	if (!columns || columns.length == 0)
		return query;

	for (const column of columns) {
		switch (column.type) {

			case "editsInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			case "editsInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			case "editsSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			case "editsSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "editsInNamespaceInPeriod": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}
			case "editsInNamespaceInPeriodPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			}
			case "editsInNamespaceSinceRegistration": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			}
			case "editsInNamespaceSinceRegistrationPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;
			}

			case "averageEditsPerDayInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push("editsInPeriod");
				break;
			case "averageEditsPerDaySinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push("editsSinceRegistration");
				break;

			case "revertedEditsInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			case "revertedEditsInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			case "revertedEditsSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			case "revertedEditsSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "revertedEditsInNamespaceInPeriod": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}
			case "revertedEditsInNamespaceInPeriodPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			}
			case "revertedEditsInNamespaceSinceRegistration": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			}
			case "revertedEditsInNamespaceSinceRegistrationPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;
			}

			case "characterChangesInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			case "characterChangesInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			case "characterChangesSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			case "characterChangesSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "characterChangesInNamespaceInPeriod": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}
			case "characterChangesInNamespaceInPeriodPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			}
			case "characterChangesInNamespaceSinceRegistration": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			}
			case "characterChangesInNamespaceSinceRegistrationPercentage": {
				const namespaceCollector = getOrCreateNamespaceCollector(ctx, column.namespace);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				namespaceCollector.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;
			}

			case "thanksInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			case "thanksInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			case "thanksSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			case "thanksSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "logEventsInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			case "logEventsInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;
			case "logEventsSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			case "logEventsSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "logEventsInPeriodByType": {
				const namespaceCollector = getOrCreateLogTypeCollector(ctx, column.logType, column.logAction);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}
			case "logEventsSinceRegistrationByType": {
				const namespaceCollector = getOrCreateLogTypeCollector(ctx, column.logType, column.logAction);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			}

			case "activeDaysInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
		}
	}

	if (ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
		if (!startDate) {
			// TODO: error out
		}

		query = query.leftJoin(qb => {
			let subQuery = qb.subQuery()
				.select("pas.actorId", "actorId");

			if (arrayHasAny(
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics,
				"editsInPeriod",
				"editsInPeriodPercentage"
			)) {
				subQuery = subQuery.addSelect("SUM(pas.dailyEdits)", "actorEditsInPeriod");
			}

			if (arrayHasAny(
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics,
				"revertedEditsInPeriod",
				"revertedEditsInPeriodPercentage"
			)) {
				subQuery = subQuery.addSelect("SUM(pas.dailyRevertedEdits)", "actorRevertedEditsInPeriod");
			}

			if (arrayHasAny(ctx.columns.requiredColumnsForSelectedPeriodActorStatistics,
				"characterChangesInPeriod",
				"characterChangesInPeriodPercentage"
			)) {
				subQuery = subQuery.addSelect("SUM(pas.dailyCharacterChanges)", "actorCharacterChangesInPeriod");
			}

			if (arrayHasAny(ctx.columns.requiredColumnsForSelectedPeriodActorStatistics,
				"thanksInPeriod",
				"thanksInPeriodPercentage"
			)) {
				subQuery = subQuery.addSelect("SUM(pas.dailyThanks)", "actorThanksInPeriod");
			}

			if (arrayHasAny(
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics,
				"logEventsInPeriod",
				"logEventsInPeriodPercentage"
			)) {
				subQuery = subQuery.addSelect("SUM(pas.dailyLogEvents)", "actorLogEventsInPeriod");
			}

			if (ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.indexOf("activeDaysInPeriod")) {
				subQuery = subQuery.addSelect("SUM(CASE WHEN pas.dailyEdits > 0 OR pas.dailyLogEvents > 0 THEN 1 ELSE 0 END)", "activeDays");
			}

			return subQuery
				.from(wikiEntities.actorDailyStatistics, "pas")
				.where(
					"pas.date >= :startDate AND pas.date <= :endDate",
					{ startDate: startDate, endDate: endDate }
				)
				.groupBy("pas.actorId");
		}, "periodActorStatistics", "periodActorStatistics.actorId = actor.actorId");
	}

	if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.length > 0) {
		if (!startDate) {
			// TODO: error out
		}



		query = query.leftJoin(qb => {
			let subQuery: SelectQueryBuilder<DailyStatisticsTypeModel> = qb.subQuery();

			if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("editsInPeriodPercentage") !== -1) {
				subQuery = subQuery.addSelect("SUM(pws.dailyEdits)", "wikiEditsInPeriod");
			}

			if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("revertedEditsInPeriodPercentage") !== -1) {
				subQuery = subQuery.addSelect("SUM(pws.dailyRevertedEdits)", "wikiRevertedEditsInPeriod");
			}

			if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("characterChangesInPeriodPercentage") !== -1) {
				subQuery = subQuery.addSelect("SUM(pws.dailyCharacterChanges)", "wikiCharacterChangesInPeriod");
			}

			if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("thanksInPeriodPercentage") !== -1) {
				subQuery = subQuery.addSelect("SUM(pws.dailyThanks)", "wikiThanksInPeriod");
			}

			if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("logEventsInPeriodPercentage") !== -1) {
				subQuery = subQuery.addSelect("SUM(pws.dailyLogEvents)", "wikiLogEventsInPeriod");
			}

			return subQuery
				.from(wikiEntities.dailyStatistics, "pws")
				.where(
					"pws.date >= :startDate AND pws.date <= :endDate",
					{ startDate: startDate, endDate: endDate }
				);
		}, "periodWikiStatistics", "true");
	}

	if (ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("lads.actorId", "actorId")
				.addSelect("MAX(lads.date)", "lastDate")
				.from(wikiEntities.actorDailyStatistics, "lads")
				.where("lads.date <= :date", { date: endDate })
				.groupBy("lads.actorId");
		}, "lastKnownDailyStatisticsDateByActor", "lastKnownDailyStatisticsDateByActor.actorId = actor.actorId");

		query = query.leftJoin(
			wikiEntities.actorDailyStatistics,
			"sinceRegistrationActorStatistics",
			"sinceRegistrationActorStatistics.actorId = actor.actorId AND sinceRegistrationActorStatistics.date = lastKnownDailyStatisticsDateByActor.lastDate"
		);
	}

	if (ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("MAX(lwds.date)", "lastDate")
				.from(wikiEntities.dailyStatistics, "lwds")
				.where("lwds.date <= :date", { date: endDate });
		}, "lastKnownDailyStatisticsDateByWiki", "true");

		query = query.leftJoin(
			wikiEntities.dailyStatistics,
			"sinceStartWikiStatistics",
			"sinceStartWikiStatistics.date = lastKnownDailyStatisticsDateByWiki.lastDate"
		);
	}

	if (columns.find(x => x.type === "firstEditDate" || x.type === "daysBetweenFirstAndLastEdit")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("ads.actorId", "actorId")
				.addSelect("MIN(date)", "date")
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.daily_edits > 0")
				.groupBy("ads.actorId");
		}, "firstEditDate", "firstEditDate.actorId = actor.actorId");
	}

	if (columns.find(x => x.type === "lastEditDate" || x.type === "daysBetweenFirstAndLastEdit")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("ads.actorId", "actorId")
				.addSelect("MAX(date)", "date")
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.daily_edits > 0")
				.groupBy("ads.actorId");
		}, "lastEditDate", "lastEditDate.actorId = actor.actorId");
	}

	if (columns.find(x => x.type === "firstLogEventDate" || x.type === "daysBetweenFirstAndLastLogEvent")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("ads.actorId", "actorId")
				.addSelect("MIN(date)", "date")
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.daily_log_events > 0")
				.groupBy("ads.actorId");
		}, "firstLogEventDate", "firstLogEventDate.actorId = actor.actorId");
	}

	if (columns.find(x => x.type === "lastLogEventDate" || x.type === "daysBetweenFirstAndLastLogEvent")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("ads.actorId", "actorId")
				.addSelect("MAX(date)", "date")
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.daily_log_events > 0")
				.groupBy("ads.actorId");
		}, "lastLogEventDate", "lastLogEventDate.actorId = actor.actorId");
	}

	if (columns.find(x => x.type === "activeDaysSinceRegistration")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("adsr.actorId", "actorId")
				.addSelect("SUM(CASE WHEN adsr.dailyEdits > 0 OR adsr.dailyLogEvents > 0 THEN 1 ELSE 0 END)", "activeDays")
				.from(wikiEntities.actorDailyStatistics, "adsr")
				.where(
					"adsr.date <= :endDate",
					{ endDate: endDate }
				)
				.groupBy("adsr.actorId");
		}, "activeDaysSinceRegistration", "activeDaysSinceRegistration.actorId = actor.actorId");
	}

	for (const namespaceCollection of ctx.columns.requiredNamespaceStatisticsColumns) {
		if (namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("pas.actorId", "actorId");

				if (arrayHasAny(
					namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics,
					"editsInNamespaceInPeriod",
					"editsInNamespaceInPeriodPercentage"
				)) {
					subQuery = subQuery.addSelect("SUM(pas.dailyEdits)", "actorEditsInPeriod");
				}

				if (arrayHasAny(
					namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics,
					"revertedEditsInNamespaceInPeriod",
					"revertedEditsInNamespaceInPeriodPercentage"
				)) {
					subQuery = subQuery.addSelect("SUM(pas.dailyRevertedEdits)", "actorRevertedEditsInPeriod");
				}

				if (arrayHasAny(namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics,
					"characterChangesInNamespaceInPeriod",
					"characterChangesInNamespaceInPeriodPercentage"
				)) {
					subQuery = subQuery.addSelect("SUM(pas.dailyCharacterChanges)", "actorCharacterChangesInPeriod");
				}

				return subQuery
					.from(wikiEntities.actorDailyStatisticsByNamespace, "pas")
					.where(
						"pas.date >= :startDate AND pas.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					)
					.andWhere(
						"pas.namespace = :namespace",
						{ namespace: namespaceCollection.namespace }
					)
					.groupBy("pas.actorId");
			}, `ns${namespaceCollection.namespace}PeriodActorStatistics`, `ns${namespaceCollection.namespace}PeriodActorStatistics.actorId = actor.actorId`);
		}

		if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery: SelectQueryBuilder<DailyStatisticsTypeModel> = qb.subQuery();

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("editsInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyEdits)", "wikiEditsInPeriod");
				}

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("revertedEditsInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyRevertedEdits)", "wikiRevertedEditsInPeriod");
				}

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("characterChangesInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyCharacterChanges)", "wikiCharacterChangesInPeriod");
				}

				return subQuery
					.from(wikiEntities.dailyStatisticsByNamespace, "pws")
					.where(
						"pws.date >= :startDate AND pws.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					)
					.andWhere(
						"pws.namespace = :namespace",
						{ namespace: namespaceCollection.namespace }
					);
			}, `ns${namespaceCollection.namespace}PeriodWikiStatistics`, "true");
		}

		if (namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
					.where("lads.date <= :date", { date: endDate })
					.andWhere("lads.namespace = :namespace", { namespace: namespaceCollection.namespace });
			}, `ns${namespaceCollection.namespace}LastKnownDailyStatisticsDateByActor`, `ns${namespaceCollection.namespace}LastKnownDailyStatisticsDateByActor.actorId = actor.actorId`);

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				`ns${namespaceCollection.namespace}SinceRegistrationActorStatistics`,
				`ns${namespaceCollection.namespace}SinceRegistrationActorStatistics.actorId = actor.actorId `
				+ ` AND ns${namespaceCollection.namespace}SinceRegistrationActorStatistics.namespace = :namespace `
				+ ` AND ns${namespaceCollection.namespace}SinceRegistrationActorStatistics.date = ns${namespaceCollection.namespace}LastKnownDailyStatisticsDateByActor.lastDate`,
				{ namespace: namespaceCollection.namespace }
			);
		}

		if (namespaceCollection.requiredColumnsForSinceRegisteredWikiStatistics.length > 0) {
			query = query.leftJoin(qb => {
				return qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatisticsByNamespace, "lwds")
					.where("lwds.date <= :date", { date: endDate })
					.andWhere("lwds.namespace = :namespace", { namespace: namespaceCollection.namespace });
			}, `ns${namespaceCollection.namespace}LastKnownDailyStatisticsDateByWiki`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				`ns${namespaceCollection.namespace}SinceStartWikiStatistics`,
				`ns${namespaceCollection.namespace}SinceStartWikiStatistics.date = ns${namespaceCollection.namespace}LastKnownDailyStatisticsDateByWiki.lastDate`
				+ ` AND ns${namespaceCollection.namespace}SinceStartWikiStatistics.namespace = :namespace `,
				{ namespace: namespaceCollection.namespace }
			);
		}
	}

	for (const logTypeCollection of ctx.columns.requiredLogTypeStatisticsColumns) {
		const normalizedLogKey = `${logTypeCollection.logType ?? "any"}_${logTypeCollection.logAction ?? "any"}`;

		if (logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("pas.actorId", "actorId");

				// TODO: add needed columns
				// if (arrayHasAny(
				// 	logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics,
				// 	"editsInNamespaceInPeriod",
				// 	"editsInNamespaceInPeriodPercentage"
				// )) {
				// 	subQuery = subQuery.addSelect("SUM(pas.dailyEdits)", "actorEditsInPeriod");
				// }

				subQuery = subQuery
					.from(wikiEntities.actorLogStatisticsByNamespaceAndLogType, "pas")
					.where(
						"pas.date >= :startDate AND pas.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					);

				if (logTypeCollection.logType) {
					subQuery = subQuery.andWhere("lads.logType = :logType", { logType: logTypeCollection.logType });
				}

				if (logTypeCollection.logAction) {
					subQuery = subQuery.andWhere("lads.logAction = :logAction", { logType: logTypeCollection.logAction });
				}

				return subQuery.groupBy("pas.actorId");
			}, `lt${normalizedLogKey}PeriodActorStatistics`, `lt${normalizedLogKey}PeriodActorStatistics.actorId = actor.actorId`);
		}

		if (logTypeCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let sq = qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorLogStatisticsByNamespaceAndLogType, "lads")
					.where("lads.date <= :date", { date: endDate });

				if (logTypeCollection.logType) {
					sq = sq.andWhere("lads.logType = :logType", { logType: logTypeCollection.logType });
				}

				if (logTypeCollection.logAction) {
					sq = sq.andWhere("lads.logAction = :logAction", { logType: logTypeCollection.logAction });
				}

				return sq;
			}, `ns${normalizedLogKey}LastKnownDailyStatisticsDateByActor`, `ns${normalizedLogKey}LastKnownDailyStatisticsDateByActor.actorId = actor.actorId`);

			// TODO: group by
			// query = query.leftJoin(
			// 	wikiEntities.actorLogStatisticsByNamespaceAndLogType,
			// 	`lt${normalizedLogKey}SinceRegistrationActorStatistics`,
			// 	`lt${normalizedLogKey}SinceRegistrationActorStatistics.actorId = actor.actorId `
			// 	+ ` AND lt${normalizedLogKey}SinceRegistrationActorStatistics.namespace = :namespace `
			// 	+ ` AND lt${normalizedLogKey}SinceRegistrationActorStatistics.date = ns${normalizedLogKey}LastKnownDailyStatisticsDateByActor.lastDate`,
			// 	{ namespace: logTypeCollection.namespace }
			// );
		}
	}

	return query;
}

function addColumnFilters(
	ctx: StatisticsQueryBuildingContext,
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	columns: ListColumn[] | undefined,
	startDate: Date | undefined,
	endDate: Date
): SelectQueryBuilder<ActorTypeModel> {
	if (!columns || columns.length == 0)
		return query;

	return query;
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

		query = query.addOrderBy(
			`column${referencedColumnIndex} `,
			orderBy.direction === "descending" ? "DESC" : "ASC"
		);
	}

	return query;
}

function getOrCreateNamespaceCollector(ctx: StatisticsQueryBuildingContext, namespace: number): NamespaceRequiredColumns {
	let existingCollector = ctx.columns.requiredNamespaceStatisticsColumns.find(x => x.namespace === namespace);
	if (!existingCollector) {
		existingCollector = {
			namespace: namespace,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: []
		};
		ctx.columns.requiredNamespaceStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}


function getOrCreateLogTypeCollector(ctx: StatisticsQueryBuildingContext, logType: string | null, logAction: string | null): LogTypeStatisticsRequiredColumns {
	const normalizedLogType = logType ?? null;
	const normalizedLogAction = logAction ?? null;

	let existingCollector = ctx.columns.requiredLogTypeStatisticsColumns.find(x => x.logType === normalizedLogType && x.logAction === normalizedLogAction);
	if (!existingCollector) {
		existingCollector = {
			logType: logType,
			logAction: logAction,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: []
		};
		ctx.columns.requiredLogTypeStatisticsColumns.push(existingCollector);
	}

	return existingCollector;
}
