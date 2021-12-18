import { addDays, subDays } from "date-fns";
import { Connection, SelectQueryBuilder } from "typeorm";
import { UserRequirements } from "../../common/modules/commonConfiguration";
import { AllColumnTypes, ChangeTagFilterDefinition, ListColumn, ListOrderBy, LogFilterDefinition } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { arrayHasAny, sequenceEqual } from "../helpers/collectionUtils";
import { ActorTypeModel, DailyStatisticsByNamespaceTypeModel, DailyStatisticsTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

type RequiredColumns = {
	requiredColumnsForSelectedPeriodActorStatistics: AllColumnTypes[];
	requiredColumnsForSelectedPeriodWikiStatistics: AllColumnTypes[];
	requiredColumnsForAtPeriodStartActorStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredActorStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredWikiStatistics: AllColumnTypes[];
}


type NamespaceRequiredColumns = RequiredColumns & {
	namespace: number | number[];
};

type LogTypeStatisticsRequiredColumns = RequiredColumns & {
	serializedLogFilter: string;
	logFilter: LogFilterDefinition | LogFilterDefinition[];
};

type ChangeTagStatisticsRequiredColumns = RequiredColumns & {
	serializedChangeTagFilter: string;
	changeTagFilter: ChangeTagFilterDefinition | ChangeTagFilterDefinition[];
};

interface StatisticsQueryBuildingContext {
	columns: RequiredColumns & {
		requiredNamespaceStatisticsColumns: NamespaceRequiredColumns[];
		requiredLogTypeStatisticsColumns: LogTypeStatisticsRequiredColumns[];
		requiredChangeTagStatisticsColumns: ChangeTagStatisticsRequiredColumns[];
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
			requiredColumnsForAtPeriodStartActorStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: [],
			requiredNamespaceStatisticsColumns: [],
			requiredLogTypeStatisticsColumns: [],
			requiredChangeTagStatisticsColumns: [],
		}
	};

	let query = toolsDbConnection.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "aId");

	// Manage selects from column definitions
	query = addColumSelects(ctx, query, columns);

	// Manage required joins
	query = addUserRequirementJoins(query, wikiEntities, userRequirements, endDate);
	query = addColumnJoins(ctx, query, wikiEntities, columns, startDate, endDate);

	// Manage required filterings
	query = addUserRequirementFilters(query, wikiEntities, userRequirements, endDate);

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
			query = query.addSelect("IFNULL(periodActorStatistics.actorEditsInPeriod / periodWikiStatistics.wikiEditsInPeriod * 100, 0.0)", selectedColumnName);
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
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorEditsInPeriod, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorEditsInPeriod`
				+ ` / ns${formatNamespaceParameter(column.namespace)}PeriodWikiStatistics.wikiEditsInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalEdits, 0)`, selectedColumnName);
			break;
		case "editsInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalEdits)`
				+ " / "
				+ `(ns${formatNamespaceParameter(column.namespace)}SinceStartWikiStatistics.totalEdits) * 100, 0)`, selectedColumnName);
			break;

		case "editsInPeriodByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}PeriodActorStatistics.editsInPeriod, 0)`, selectedColumnName);
			break;
		case "editsSinceRegistrationByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}SinceRegistrationActorStatistics.totalEdits, 0)`, selectedColumnName);
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
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorRevertedEditsInPeriod, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorRevertedEditsInPeriod / ns${formatNamespaceParameter(column.namespace)}PeriodWikiStatistics.wikiRevertedEditsInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalRevertedEdits, 0)`, selectedColumnName);
			break;
		case "revertedEditsInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalRevertedEdits)`
				+ " / "
				+ `(ns${formatNamespaceParameter(column.namespace)}SinceStartWikiStatistics.totalRevertedEdits) * 100, 0)`, selectedColumnName);
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
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorCharacterChangesInPeriod, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceInPeriodPercentage":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorCharacterChangesInPeriod / ns${formatNamespaceParameter(column.namespace)}PeriodWikiStatistics.wikiCharacterChangesInPeriod * 100, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceSinceRegistration":
			query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`, selectedColumnName);
			break;
		case "characterChangesInNamespaceSinceRegistrationPercentage":
			query = query.addSelect(
				`IFNULL((ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalCharacterChanges)`
				+ " / "
				+ `(ns${formatNamespaceParameter(column.namespace)}SinceStartWikiStatistics.totalCharacterChanges) * 100, 0)`, selectedColumnName);
			break;

		case "characterChangesInPeriodByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}PeriodActorStatistics.characterChangesInPeriod, 0)`, selectedColumnName);
			break;
		case "characterChangesSinceRegistrationByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`, selectedColumnName);
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

		case "logEventsInPeriodByType":
			query = query.addSelect(`IFNULL(log${formatLogFilterDefinitionCollection(column.logFilter)}PeriodActorStatistics.logEventsInPeriod, 0)`, selectedColumnName);
			break;
		case "logEventsSinceRegistrationByType":
			query = query.addSelect(`IFNULL(log${formatLogFilterDefinitionCollection(column.logFilter)}SinceRegistrationActorStatistics.totalLogEvents, 0)`, selectedColumnName);
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

		case "levelAtPeriodStart":
			query = addStartLevelColumnSelects(query, selectedColumnName);
			break;
		case "levelAtPeriodEnd":
			query = addStartLevelColumnSelects(query, selectedColumnName);
			query = addEndLevelColumnSelects(query, selectedColumnName);
			break;
		case "levelAtPeriodEndWithChange":
			query = addEndLevelColumnSelects(query, selectedColumnName);
			break;
	}

	return query;
}

function addStartLevelColumnSelects(query: SelectQueryBuilder<ActorTypeModel>, selectedColumnName: string) {
	query = query.addSelect(
		"IFNULL(atPeriodStartActorStatistics.editsToDate, 0)",
		`${selectedColumnName}_startEdits`
	);
	query = query.addSelect(
		"IFNULL(atPeriodStartActorStatistics.logEventsToDate, 0)",
		`${selectedColumnName}_startLogEvents`
	);
	query = query.addSelect(
		"IFNULL(activeDaysSinceRegistrationAtPeriodStart.activeDays, 0)",
		`${selectedColumnName}_startActiveDays`
	);
	return query;
}

function addEndLevelColumnSelects(query: SelectQueryBuilder<ActorTypeModel>, selectedColumnName: string) {
	query = query.addSelect(
		"IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0)",
		`${selectedColumnName}_endEdits`
	);
	query = query.addSelect(
		"IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0)",
		`${selectedColumnName}_endLogEvents`
	);
	query = query.addSelect(
		"IFNULL(activeDaysSinceRegistration.activeDays, 0)",
		`${selectedColumnName}_endActiveDays`
	);
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

			case "editsInPeriodByChangeTag": {
				const namespaceCollector = getOrCreateChangeTagCollector(ctx, column.changeTag);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}

			case "editsSinceRegistrationByChangeTag": {
				const namespaceCollector = getOrCreateChangeTagCollector(ctx, column.changeTag);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
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

			case "characterChangesInPeriodByChangeTag": {
				const namespaceCollector = getOrCreateChangeTagCollector(ctx, column.changeTag);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}

			case "characterChangesSinceRegistrationByChangeTag": {
				const namespaceCollector = getOrCreateChangeTagCollector(ctx, column.changeTag);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
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
				const namespaceCollector = getOrCreateLogTypeCollector(ctx, column.logFilter);
				namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;
			}
			case "logEventsSinceRegistrationByType": {
				const namespaceCollector = getOrCreateLogTypeCollector(ctx, column.logFilter);
				namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;
			}

			case "activeDaysInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;

			case "levelAtPeriodStart":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(
					"editsSinceRegistration",
					"logEventsSinceRegistration"
				);
				break;

			case "levelAtPeriodEnd":
				ctx.columns.requiredColumnsForAtPeriodStartActorStatistics.push(
					"editsAtPeriodStart",
					"logEventsAtPeriodStart"
				);
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(
					"editsSinceRegistration",
					"logEventsSinceRegistration"
				);
				break;

			case "levelAtPeriodEndWithChange":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(
					"editsSinceRegistration",
					"logEventsSinceRegistration"
				);
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

	if (ctx.columns.requiredColumnsForAtPeriodStartActorStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("lads.actorId", "actorId")
				.addSelect("MIN(lads.date)", "lastDate")
				.from(wikiEntities.actorDailyStatistics, "lads")
				.where("lads.date >= :startDate AND lads.date <= :endDate", { startDate: startDate, endDate: endDate })
				.groupBy("lads.actorId");
		}, "firstKnownDailyPeriodStatisticsDateByActor", "firstKnownDailyPeriodStatisticsDateByActor.actorId = actor.actorId");

		query = query.leftJoin(
			wikiEntities.actorDailyStatistics,
			"atPeriodStartActorStatistics",
			"atPeriodStartActorStatistics.actorId = actor.actorId AND atPeriodStartActorStatistics.date = firstKnownDailyPeriodStatisticsDateByActor.lastDate"
		);
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

	if (columns.find(x => x.type === "levelAtPeriodStart" || x.type === "levelAtPeriodEndWithChange")) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("adsr.actorId", "actorId")
				.addSelect("SUM(CASE WHEN adsr.dailyEdits > 0 OR adsr.dailyLogEvents > 0 THEN 1 ELSE 0 END)", "activeDays")
				.from(wikiEntities.actorDailyStatistics, "adsr")
				.where(
					"adsr.date < :startDate",
					{ startDate: startDate }
				)
				.groupBy("adsr.actorId");
		}, "activeDaysSinceRegistrationAtPeriodStart", "activeDaysSinceRegistrationAtPeriodStart.actorId = actor.actorId");
	}

	if (columns.find(x => x.type === "activeDaysSinceRegistration"
		|| x.type === "levelAtPeriodEnd"
		|| x.type === "levelAtPeriodEndWithChange")
	) {
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
		const namespaceKey = formatNamespaceParameter(namespaceCollection.namespace);

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

				subQuery = subQuery
					.from(wikiEntities.actorDailyStatisticsByNamespace, "pas")
					.where(
						"pas.date >= :startDate AND pas.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					);

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "pas");

				return subQuery.groupBy("pas.actorId");
			}, `ns${namespaceKey}PeriodActorStatistics`, `ns${namespaceKey}PeriodActorStatistics.actorId = actor.actorId`);
		}

		if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery: SelectQueryBuilder<DailyStatisticsByNamespaceTypeModel> = qb.subQuery();

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("editsInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyEdits)", "wikiEditsInPeriod");
				}

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("revertedEditsInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyRevertedEdits)", "wikiRevertedEditsInPeriod");
				}

				if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.indexOf("characterChangesInNamespaceInPeriodPercentage") !== -1) {
					subQuery = subQuery.addSelect("SUM(pws.dailyCharacterChanges)", "wikiCharacterChangesInPeriod");
				}

				subQuery = subQuery
					.from(wikiEntities.dailyStatisticsByNamespace, "pws")
					.where(
						"pws.date >= :startDate AND pws.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					);

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "pws");

				return subQuery;
			}, `ns${namespaceKey}PeriodWikiStatistics`, "true");
		}

		if (namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("adsn.actorId", "actorId");

				if (arrayHasAny(namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"editsInNamespaceSinceRegistration",
					"editsInNamespaceSinceRegistrationPercentage")) {
					subQuery = subQuery.addSelect("SUM(adsn.editsToDate + adsn.dailyEdits)", "totalEdits");
				}

				if (arrayHasAny(namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"revertedEditsInNamespaceSinceRegistration",
					"revertedEditsInNamespaceSinceRegistrationPercentage")) {
					subQuery = subQuery.addSelect("SUM(adsn.revertedEditsToDate + adsn.dailyRevertedEdits)", "totalRevertedEdits");
				}

				if (arrayHasAny(namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"characterChangesInNamespaceSinceRegistration",
					"characterChangesInNamespaceSinceRegistrationPercentage")) {
					subQuery = subQuery.addSelect("SUM(adsn.characterChangesToDate + adsn.dailyCharacterChanges)", "totalCharacterChanges");
				}

				subQuery = subQuery
					.from(wikiEntities.actorDailyStatisticsByNamespace, "adsn");

				subQuery = subQuery.andWhere(qb => {
					let lastDateSubQuery = qb.subQuery()
						.select("MAX(adsnLastDate.date)", "lastDate")
						.from(wikiEntities.actorDailyStatisticsByNamespace, "adsnLastDate")
						.where("adsnLastDate.actorId = adsn.actorId")
						.andWhere("adsnLastDate.date <= :date", { date: endDate });

					lastDateSubQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, lastDateSubQuery, "adsnLastDate");

					return "adsn.date = " + lastDateSubQuery.getQuery();
				});

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "adsn");

				subQuery.groupBy("adsn.actorId");

				return subQuery;
			}, `ns${namespaceKey}SinceRegistrationActorStatistics`, `ns${namespaceKey}SinceRegistrationActorStatistics.actorId = actor.actorId`);
		}

		if (namespaceCollection.requiredColumnsForSinceRegisteredWikiStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery();

				if (arrayHasAny(
					namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"editsInNamespaceSinceRegistration",
					"editsInNamespaceSinceRegistrationPercentage")
				) {
					subQuery = subQuery.addSelect("SUM(dsn.editsToDate + dsn.dailyEdits)", "totalEdits");
				}

				if (arrayHasAny(
					namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"revertedEditsInNamespaceSinceRegistration",
					"revertedEditsInNamespaceSinceRegistrationPercentage")
				) {
					subQuery = subQuery.addSelect("SUM(dsn.revertedEditsToDate + dsn.dailyRevertedEdits)", "totalRevertedEdits");
				}

				if (arrayHasAny(
					namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics,
					"characterChangesInNamespaceSinceRegistration",
					"characterChangesInNamespaceSinceRegistrationPercentage")
				) {
					subQuery = subQuery.addSelect("SUM(dsn.characterChangesToDate + dsn.dailyCharacterChanges)", "totalCharacterChanges");
				}

				subQuery = subQuery
					.from(wikiEntities.dailyStatisticsByNamespace, "dsn");

				subQuery = subQuery.andWhere(qb => {
					let lastDateSubQuery = qb.subQuery()
						.select("MAX(dsnLastDate.date)", "lastDate")
						.from(wikiEntities.dailyStatisticsByNamespace, "dsnLastDate")
						.where("dsnLastDate.date <= :date", { date: endDate });

					lastDateSubQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, lastDateSubQuery, "dsnLastDate");

					return "dsn.date = " + lastDateSubQuery.getQuery();
				});

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "dsn");

				return subQuery;
			}, `ns${namespaceKey}SinceStartWikiStatistics`, "true");
		}
	}

	for (const changeTagCollection of ctx.columns.requiredChangeTagStatisticsColumns) {
		const normalizedCtKey = changeTagCollection.serializedChangeTagFilter;

		if (changeTagCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("pas.actorId", "actorId");

				if (changeTagCollection.requiredColumnsForSelectedPeriodActorStatistics.indexOf("editsInPeriodByChangeTag") !== -1) {
					subQuery = subQuery.addSelect("SUM(pas.dailyEdits)", "editsInPeriod");
				}

				if (changeTagCollection.requiredColumnsForSelectedPeriodActorStatistics.indexOf("characterChangesInPeriodByChangeTag") !== -1) {
					subQuery = subQuery.addSelect("SUM(pas.dailyCharacterChanges)", "characterChangesInPeriod");
				}

				subQuery = subQuery
					.from(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag, "pas")
					.where(
						"pas.date >= :startDate AND pas.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					);

				subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "pas");

				return subQuery.groupBy("pas.actorId");
			}, `ct${normalizedCtKey}PeriodActorStatistics`, `ct${normalizedCtKey}PeriodActorStatistics.actorId = actor.actorId`);
		}

		if (changeTagCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("adsn.actorId", "actorId");

				if (changeTagCollection.requiredColumnsForSinceRegisteredActorStatistics.indexOf("editsSinceRegistrationByChangeTag") !== -1) {
					subQuery = subQuery.addSelect("SUM(adsn.editsToDate + adsn.dailyEdits)", "totalEdits");
				}

				if (changeTagCollection.requiredColumnsForSinceRegisteredActorStatistics.indexOf("characterChangesSinceRegistrationByChangeTag") !== -1) {
					subQuery = subQuery.addSelect("SUM(adsn.characterChangesToDate + adsn.dailyCharacterChanges)", "totalCharacterChanges");
				}

				subQuery = subQuery
					.from(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag, "adsn");

				subQuery = subQuery.andWhere(qb => {
					let lastDateSubQuery = qb.subQuery()
						.select("MAX(adsnLastDate.date)", "lastDate")
						.from(wikiEntities.actorEditStatisticsByNamespaceAndChangeTag, "adsnLastDate")
						.where("adsnLastDate.actorId = adsn.actorId")
						.andWhere("adsnLastDate.date <= :date", { date: endDate });

					lastDateSubQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, lastDateSubQuery, "adsnLastDate");

					return "adsn.date = " + lastDateSubQuery.getQuery();
				});

				subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "adsn");

				subQuery.groupBy("adsn.actorId");

				return subQuery;
			}, `ct${normalizedCtKey}SinceRegistrationActorStatistics`, `ct${normalizedCtKey}SinceRegistrationActorStatistics.actorId = actor.actorId`);
		}
	}

	for (const logTypeCollection of ctx.columns.requiredLogTypeStatisticsColumns) {
		const normalizedLogKey = logTypeCollection.serializedLogFilter;

		if (logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			if (!startDate) {
				// TODO: error out
			}

			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("pas.actorId", "actorId");

				if (logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics.indexOf("logEventsInPeriodByType") !== -1) {
					subQuery = subQuery.addSelect("SUM(pas.dailyLogEvents)", "logEventsInPeriod");
				}

				subQuery = subQuery
					.from(wikiEntities.actorLogStatisticsByNamespaceAndLogType, "pas")
					.where(
						"pas.date >= :startDate AND pas.date <= :endDate",
						{ startDate: startDate, endDate: endDate }
					);

				subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "pas");

				return subQuery.groupBy("pas.actorId");
			}, `log${normalizedLogKey}PeriodActorStatistics`, `log${normalizedLogKey}PeriodActorStatistics.actorId = actor.actorId`);
		}

		if (logTypeCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("adsn.actorId", "actorId");

				if (logTypeCollection.requiredColumnsForSinceRegisteredActorStatistics.indexOf("logEventsSinceRegistrationByType") !== -1) {
					subQuery = subQuery.addSelect("SUM(adsn.logEventsToDate + adsn.dailyLogEvents)", "totalLogEvents");
				}

				subQuery = subQuery
					.from(wikiEntities.actorLogStatisticsByNamespaceAndLogType, "adsn");

				subQuery = subQuery.andWhere(qb => {
					let lastDateSubQuery = qb.subQuery()
						.select("MAX(adsnLastDate.date)", "lastDate")
						.from(wikiEntities.actorLogStatisticsByNamespaceAndLogType, "adsnLastDate")
						.where("adsnLastDate.actorId = adsn.actorId")
						.andWhere("adsnLastDate.date <= :date", { date: endDate });

					lastDateSubQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, lastDateSubQuery, "adsnLastDate");

					return "adsn.date = " + lastDateSubQuery.getQuery();
				});

				subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "adsn");

				subQuery.groupBy("adsn.actorId");

				return subQuery;
			}, `log${normalizedLogKey}SinceRegistrationActorStatistics`, `log${normalizedLogKey}SinceRegistrationActorStatistics.actorId = actor.actorId`);
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
	if (typeof namespaceCollection.namespace === "number") {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.namespace = :namespace${namespaceCollection.namespace}`,
			{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
		);
	} else {
		const whereParameters = {};
		const whereClause = namespaceCollection.namespace
			.map((ele: number): string => {
				whereParameters[`namespace${ele}`] = ele;
				return `${tableAlias}.namespace = :namespace${ele}`;
			})
			.join(" OR ");

		queryBuilder = queryBuilder.andWhere(
			`(${whereClause})`,
			whereParameters
		);
	}
	return queryBuilder;
}

function createChangeTagWhereClauseFromFilterDefinition(
	namespaceCollection: ChangeTagStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	if (Array.isArray(namespaceCollection.changeTagFilter)) {
		const whereParameters = {};
		const whereClause = namespaceCollection.changeTagFilter
			.map((ele: ChangeTagFilterDefinition): string => {
				let ret = `${tableAlias}.changeTagId = :changeTagId${ele.changeTagId}`;
				whereParameters[`changeTagId${ele.changeTagId}`] = ele.changeTagId;

				if (typeof ele.namespace === "number") {
					ret = `(${ret} OR ${tableAlias}.namespace = :namespace${ele.namespace})`;
					whereParameters[`namespace${ele.changeTagId}`] = ele.changeTagId;
				}

				return ret;
			})
			.join(" OR ");

		queryBuilder = queryBuilder.andWhere(
			`(${whereClause})`,
			whereParameters
		);

	} else {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.changeTagId = :changeTagId${namespaceCollection.changeTagFilter.changeTagId}`,
			{ [`changeTagId${namespaceCollection.changeTagFilter.changeTagId}`]: namespaceCollection.changeTagFilter.changeTagId }
		);

		if (typeof namespaceCollection.changeTagFilter.namespace === "number") {
			queryBuilder = queryBuilder.andWhere(
				`${tableAlias}.namespace = :namespace${namespaceCollection.changeTagFilter.namespace}`,
				{ [`namespace${namespaceCollection.changeTagFilter.namespace}`]: namespaceCollection.changeTagFilter.namespace }
			);
		}
	}
	return queryBuilder;
}

function createLogWhereClauseFromFilterDefinition(
	namespaceCollection: LogTypeStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	if (Array.isArray(namespaceCollection.logFilter)) {
		const whereParameters = {};
		const whereClause = namespaceCollection.logFilter
			.map((ele: LogFilterDefinition): string => {
				let logActionClause: string | null = null;
				let logTypeClause: string | null = null;

				if (ele.logType) {
					logTypeClause = `${tableAlias}.logType = :logType${ele.logType}`;
					whereParameters[`logType${ele.logType}`] = ele.logType;
				}

				if (ele.logAction) {
					logActionClause = `${tableAlias}.logAction = :logAction${ele.logAction}`;
					whereParameters[`logAction${ele.logAction}`] = ele.logAction;
				}

				if (ele.logType && ele.logAction) {
					return `(${logTypeClause} AND ${logActionClause})`;
				}

				return logTypeClause ?? logActionClause ?? "Should not happen";
			})
			.join(" OR ");

		queryBuilder = queryBuilder.andWhere(
			`(${whereClause})`,
			whereParameters
		);

	} else {
		if (namespaceCollection.logFilter.logType) {
			queryBuilder = queryBuilder.andWhere(
				`${tableAlias}.logType = :logType${namespaceCollection.logFilter.logType}`,
				{ [`logType${namespaceCollection.logFilter.logType}`]: namespaceCollection.logFilter.logType }
			);
		}

		if (namespaceCollection.logFilter.logAction) {
			queryBuilder = queryBuilder.andWhere(
				`${tableAlias}.logAction = :logAction${namespaceCollection.logFilter.logAction}`,
				{ [`logAction${namespaceCollection.logFilter.logAction}`]: namespaceCollection.logFilter.logAction }
			);
		}
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

		query = query.addOrderBy(
			`column${referencedColumnIndex} `,
			orderBy.direction === "descending" ? "DESC" : "ASC"
		);
	}

	return query;
}

function getOrCreateNamespaceCollector(ctx: StatisticsQueryBuildingContext, namespace: number | number[]): NamespaceRequiredColumns {
	let existingCollector = ctx.columns.requiredNamespaceStatisticsColumns.find(x =>
		typeof (x.namespace) === "object"
			? sequenceEqual(x.namespace, namespace)
			: x.namespace === namespace);

	if (!existingCollector) {
		existingCollector = {
			namespace: namespace,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForAtPeriodStartActorStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: []
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

function getOrCreateChangeTagCollector(ctx: StatisticsQueryBuildingContext, changeTagFilter: ChangeTagFilterDefinition | ChangeTagFilterDefinition[]): ChangeTagStatisticsRequiredColumns {
	const serializedChangeTagFilter = formatChangeTagFilterDefinitionCollection(changeTagFilter);

	let existingCollector = ctx.columns.requiredChangeTagStatisticsColumns
		.find(x => x.serializedChangeTagFilter === serializedChangeTagFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedChangeTagFilter: serializedChangeTagFilter,
			changeTagFilter: changeTagFilter,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForAtPeriodStartActorStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: []
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
	return `${changeTagFilter.namespace ?? "any"}_${changeTagFilter.changeTagId}`;
}

function getOrCreateLogTypeCollector(ctx: StatisticsQueryBuildingContext, logFilter: LogFilterDefinition | LogFilterDefinition[]): LogTypeStatisticsRequiredColumns {
	const serializedLogFilter = formatLogFilterDefinitionCollection(logFilter);

	let existingCollector = ctx.columns.requiredLogTypeStatisticsColumns
		.find(x => x.serializedLogFilter === serializedLogFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedLogFilter: serializedLogFilter,
			logFilter: logFilter,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
			requiredColumnsForAtPeriodStartActorStatistics: [],
			requiredColumnsForSinceRegisteredActorStatistics: [],
			requiredColumnsForSinceRegisteredWikiStatistics: []
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
	return `${logFilter.logType ?? "any"}_${logFilter.logAction ?? "any"}`;
}
