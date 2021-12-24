import { addDays, subDays } from "date-fns";
import { Connection, SelectQueryBuilder } from "typeorm";
import { UserRequirements } from "../../common/modules/commonConfiguration";
import { AllColumnTypes, ChangeTagFilterDefinition, ListColumn, ListOrderBy, LogFilterDefinition } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { ActorTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

type RequiredColumns = {
	requiredColumnsForSelectedPeriodActorStatistics: AllColumnTypes[];
	requiredColumnsForSelectedPeriodWikiStatistics: AllColumnTypes[];
	//requiredColumnsForAtPeriodStartActorStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredActorStatistics: AllColumnTypes[];
	requiredColumnsForSinceRegisteredWikiStatistics: AllColumnTypes[];
}


type NamespaceRequiredColumns = RequiredColumns & {
	namespace: number;
};

type LogTypeStatisticsRequiredColumns = RequiredColumns & {
	serializedLogFilter: string;
	logFilter: LogFilterDefinition;
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
			requiredChangeTagStatisticsColumns: [],
		}
	};

	let query = toolsDbConnection.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "actorId")
		.addSelect("actor.actorName", "actorName");

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
		return await query.getRawMany<{ actorId: number }>();
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
		const userGroups = userRequirements.userGroups;

		query = query.andWhere(qb => {
			const whereParameters = {};
			const whereClause = userGroups
				.map((group: string): string => {
					whereParameters[`group_${group}`] = group;
					return `gr.group_name = :group_${group}`;
				})
				.join(" OR ");

			const subQuery = qb.subQuery()
				.select("1")
				.from(wikiEntities.actorGroup, "gr")
				.where("gr.actor_id = actor.actorId")
				.andWhere(`(${whereClause})`, whereParameters)
				.getQuery();

			return `EXISTS(${subQuery})`;
		});
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
		// OK
		case "editsInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.editsToDate + atPeriodStartActorStatistics.dailyEdits, 0)", selectedColumnName);
			break;
		// OK
		case "editsInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.editsToDate + atPeriodStartActorStatistics.dailyEdits, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.editsToDate + sinceStartWikiStatistics.dailyEdits, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.editsToDate + atPeriodStartWikiStatistics.dailyEdits, 0))", selectedColumnName);
			break;
		// OK
		case "editsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0)", selectedColumnName);
			break;
		// OK
		case "editsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits)"
				+ " / "
				+ "(sinceStartWikiStatistics.editsToDate + sinceStartWikiStatistics.dailyEdits), 0)", selectedColumnName);
			break;

		case "editsInNamespaceInPeriod": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				return `(IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.dailyEdits, 0) `
					+ `- IFNULL(ns${formatNamespaceParameter(columnPart)}AtPeriodStartActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}AtPeriodStartActorStatistics.dailyEdits, 0))`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceInPeriodPercentage": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					return `(IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.dailyEdits, 0) `
						+ `- IFNULL(ns${formatNamespaceParameter(columnPart)}AtPeriodStartActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}AtPeriodStartActorStatistics.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					return `(IFNULL(ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.dailyEdits, 0) `
						+ `- IFNULL(ns${formatNamespaceParameter(columnPart)}AtPeriodStartWikiStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}AtPeriodStartWikiStatistics.dailyEdits, 0))`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);
			break;
		}
		case "editsInNamespaceSinceRegistration": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(namespaces.map(columnPart => {
				return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.dailyEdits, 0)`;
			}).join(" + "), selectedColumnName);

			break;
		}
		case "editsInNamespaceSinceRegistrationPercentage": {
			const namespaces = Array.isArray(column.namespace) ? column.namespace : [column.namespace];

			query = query.addSelect(
				"IFNULL((" + namespaces.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ " / "
				+ "(" + namespaces.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.editsToDate + ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.dailyEdits, 0)`;
				}).join(" + ") + ")"
				+ ", 0)", selectedColumnName);

			break;
		}
		case "editsInPeriodByChangeTag":
			if (Array.isArray(column.changeTag)) {
				query = query.addSelect(column.changeTag.map(changeTagPart => {
					return `IFNULL(ct${formatChangeTagFilterDefinitionCollection(changeTagPart)}PeriodActorStatistics.editsInPeriod, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}PeriodActorStatistics.editsInPeriod, 0)`, selectedColumnName);
			}
			break;
		case "editsSinceRegistrationByChangeTag":
			if (Array.isArray(column.changeTag)) {
				query = query.addSelect(column.changeTag.map(changeTagPart => {
					return `IFNULL(ct${formatChangeTagFilterDefinitionCollection(changeTagPart)}SinceRegistrationActorStatistics.totalEdits, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}SinceRegistrationActorStatistics.totalEdits, 0)`, selectedColumnName);
			}
			break;

		// OK
		case "revertedEditsInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.revertedEditsToDate + atPeriodStartActorStatistics.dailyRevertedEdits, 0)", selectedColumnName);
			break;
		// OK
		case "revertedEditsInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.revertedEditsToDate + atPeriodStartActorStatistics.dailyRevertedEdits, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.revertedEditsToDate + sinceStartWikiStatistics.dailyRevertedEdits, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.revertedEditsToDate + atPeriodStartWikiStatistics.dailyRevertedEdits, 0))", selectedColumnName);
			break;
		// OK
		case "revertedEditsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits, 0)", selectedColumnName);
			break;
		// OK
		case "revertedEditsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.revertedEditsToDate + sinceRegistrationActorStatistics.dailyRevertedEdits)"
				+ " / "
				+ "(sinceStartWikiStatistics.revertedEditsToDate + sinceStartWikiStatistics.dailyRevertedEdits), 0)", selectedColumnName);
			break;

		case "revertedEditsInNamespaceInPeriod":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(column.namespace.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodActorStatistics.actorRevertedEditsInPeriod, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorRevertedEditsInPeriod, 0)`, selectedColumnName);
			}
			break;
		case "revertedEditsInNamespaceInPeriodPercentage":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(
					"IFNULL((" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodActorStatistics.actorRevertedEditsInPeriod, 0)`;
					}).join(" + ") + ")"
					+ " / "
					+ "(" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodWikiStatistics.totalRevertedEdits, 0)`;
					}).join(" + ") + ")"
					+ " * 100, 0)", selectedColumnName);
			} else {
				query = query.addSelect(
					`IFNULL((ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorRevertedEditsInPeriod)`
					+ " / "
					+ `(ns${formatNamespaceParameter(column.namespace)}PeriodWikiStatistics.totalRevertedEdits) * 100, 0)`, selectedColumnName);
			}
			break;
		case "revertedEditsInNamespaceSinceRegistration":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(column.namespace.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.totalRevertedEdits, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalRevertedEdits, 0)`, selectedColumnName);
			}
			break;
		case "revertedEditsInNamespaceSinceRegistrationPercentage":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(
					"IFNULL((" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.totalRevertedEdits, 0)`;
					}).join(" + ") + ")"
					+ " / "
					+ "(" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.totalRevertedEdits, 0)`;
					}).join(" + ") + ")"
					+ " * 100, 0)", selectedColumnName);
			} else {
				query = query.addSelect(
					`IFNULL((ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalRevertedEdits)`
					+ " / "
					+ `(ns${formatNamespaceParameter(column.namespace)}SinceStartWikiStatistics.totalRevertedEdits) * 100, 0)`, selectedColumnName);
			}
			break;

		// OK
		case "characterChangesInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.characterChangesToDate + atPeriodStartActorStatistics.dailyCharacterChanges, 0)", selectedColumnName);
			break;
		// OK
		case "characterChangesInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.characterChangesToDate + atPeriodStartActorStatistics.dailyCharacterChanges, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.characterChangesToDate + sinceStartWikiStatistics.dailyCharacterChanges, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.characterChangesToDate + atPeriodStartWikiStatistics.dailyCharacterChanges, 0))", selectedColumnName);
			break;
		// OK
		case "characterChangesSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges, 0)", selectedColumnName);
			break;
		// OK
		case "characterChangesSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.characterChangesToDate + sinceRegistrationActorStatistics.dailyCharacterChanges)"
				+ " / "
				+ "(sinceStartWikiStatistics.characterChangesToDate + sinceStartWikiStatistics.dailyCharacterChanges), 0)", selectedColumnName);
			break;

		case "characterChangesInNamespaceInPeriod":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(column.namespace.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodActorStatistics.actorCharacterChangesInPeriod, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorCharacterChangesInPeriod, 0)`, selectedColumnName);
			}
			break;
		case "characterChangesInNamespaceInPeriodPercentage":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(
					"IFNULL((" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodActorStatistics.actorCharacterChangesInPeriod, 0)`;
					}).join(" + ") + ")"
					+ " / "
					+ "(" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}PeriodWikiStatistics.wikiCharacterChangesInPeriod, 0)`;
					}).join(" + ") + ")"
					+ " * 100, 0)", selectedColumnName);
			} else {
				query = query.addSelect(
					`IFNULL((ns${formatNamespaceParameter(column.namespace)}PeriodActorStatistics.actorCharacterChangesInPeriod)`
					+ " / "
					+ `(ns${formatNamespaceParameter(column.namespace)}PeriodWikiStatistics.wikiCharacterChangesInPeriod) * 100, 0)`, selectedColumnName);
			}
			break;
		case "characterChangesInNamespaceSinceRegistration":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(column.namespace.map(columnPart => {
					return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`, selectedColumnName);
			}
			break;
		case "characterChangesInNamespaceSinceRegistrationPercentage":
			if (Array.isArray(column.namespace)) {
				query = query.addSelect(
					"IFNULL((" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`;
					}).join(" + ") + ")"
					+ " / "
					+ "(" + column.namespace.map(columnPart => {
						return `IFNULL(ns${formatNamespaceParameter(columnPart)}SinceStartWikiStatistics.totalCharacterChanges, 0)`;
					}).join(" + ") + ")"
					+ " * 100, 0)", selectedColumnName);
			} else {
				query = query.addSelect(
					`IFNULL((ns${formatNamespaceParameter(column.namespace)}SinceRegistrationActorStatistics.totalCharacterChanges)`
					+ " / "
					+ `(ns${formatNamespaceParameter(column.namespace)}SinceStartWikiStatistics.totalCharacterChanges) * 100, 0)`, selectedColumnName);
			}
			break;

		case "characterChangesInPeriodByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}PeriodActorStatistics.characterChangesInPeriod, 0)`, selectedColumnName);
			break;
		case "characterChangesSinceRegistrationByChangeTag":
			query = query.addSelect(`IFNULL(ct${formatChangeTagFilterDefinitionCollection(column.changeTag)}SinceRegistrationActorStatistics.totalCharacterChanges, 0)`, selectedColumnName);
			break;

		// OK
		case "receivedThanksInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.receivedThanksToDate + sinceRegistrationActorStatistics.dailyReceivedThanks, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.receivedThanksToDate + atPeriodStartActorStatistics.dailyReceivedThanks, 0)", selectedColumnName);
			break;
		// OK
		case "receivedThanksInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.receivedThanksToDate + sinceRegistrationActorStatistics.dailyReceivedThanks, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.receivedThanksToDate + atPeriodStartActorStatistics.dailyReceivedThanks, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.receivedThanksToDate + sinceStartWikiStatistics.dailyReceivedThanks, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.receivedThanksToDate + atPeriodStartWikiStatistics.dailyReceivedThanks, 0))", selectedColumnName);
			break;
		// OK
		case "receivedThanksSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.receivedThanksToDate + sinceRegistrationActorStatistics.dailyReceivedThanks, 0)", selectedColumnName);
			break;
		// OK
		case "receivedThanksSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.receivedThanksToDate + sinceRegistrationActorStatistics.dailyReceivedThanks)"
				+ " / "
				+ "(sinceStartWikiStatistics.receivedThanksToDate + sinceStartWikiStatistics.dailyReceivedThanks), 0)", selectedColumnName);
			break;

		// OK
		case "sentThanksInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.sentThanksToDate + sinceRegistrationActorStatistics.dailySentThanks, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.sentThanksToDate + atPeriodStartActorStatistics.dailySentThanks, 0)", selectedColumnName);
			break;
		// OK
		case "sentThanksInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.sentThanksToDate + sinceRegistrationActorStatistics.dailySentThanks, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.sentThanksToDate + atPeriodStartActorStatistics.dailySentThanks, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.sentThanksToDate + sinceStartWikiStatistics.dailySentThanks, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.sentThanksToDate + atPeriodStartWikiStatistics.dailySentThanks, 0))", selectedColumnName);
			break;
		// OK
		case "sentThanksSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.sentThanksToDate + sinceRegistrationActorStatistics.dailySentThanks, 0)", selectedColumnName);
			break;
		// OK
		case "sentThanksSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.sentThanksToDate + sinceRegistrationActorStatistics.dailySentThanks)"
				+ " / "
				+ "(sinceStartWikiStatistics.sentThanksToDate + sinceStartWikiStatistics.dailySentThanks), 0)", selectedColumnName);
			break;

		// OK
		case "logEventsInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.logEventsToDate + atPeriodStartActorStatistics.dailyLogEvents, 0)", selectedColumnName);
			break;
		// OK
		case "logEventsInPeriodPercentage":
			query = query.addSelect("(IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.logEventsToDate + atPeriodStartActorStatistics.dailyLogEvents, 0))"
				+ " / "
				+ "(IFNULL(sinceStartWikiStatistics.logEventsToDate + sinceStartWikiStatistics.dailyLogEvents, 0) "
				+ "- IFNULL(atPeriodStartWikiStatistics.logEventsToDate + atPeriodStartWikiStatistics.dailyLogEvents, 0))", selectedColumnName);
			break;
		// OK
		case "logEventsSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0)", selectedColumnName);
			break;
		// OK
		case "logEventsSinceRegistrationPercentage":
			query = query.addSelect(
				"IFNULL((sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents)"
				+ " / "
				+ "(sinceStartWikiStatistics.logEventsToDate + sinceStartWikiStatistics.dailyLogEvents), 0)", selectedColumnName);
			break;

		case "logEventsInPeriodByType":
			if (Array.isArray(column.logFilter)) {
				query = query.addSelect(column.logFilter.map(logFilterPart => {
					return `IFNULL(log${formatLogFilterDefinitionCollection(logFilterPart)}PeriodActorStatistics.logEventsInPeriod, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(log${formatLogFilterDefinitionCollection(column.logFilter)}PeriodActorStatistics.logEventsInPeriod, 0)`, selectedColumnName);
			}
			break;
		case "logEventsSinceRegistrationByType":
			if (Array.isArray(column.logFilter)) {
				query = query.addSelect(column.logFilter.map(logFilterPart => {
					return `IFNULL(log${formatLogFilterDefinitionCollection(logFilterPart)}SinceRegistrationActorStatistics.totalLogEvents, 0)`;
				}).join(" + "), selectedColumnName);
			} else {
				query = query.addSelect(`IFNULL(log${formatLogFilterDefinitionCollection(column.logFilter)}SinceRegistrationActorStatistics.totalLogEvents, 0)`, selectedColumnName);
			}
			break;


		// OK
		case "firstEditDate":
			query = query.addSelect("editDates.firstEditDate", selectedColumnName);
			break;
		// OK
		case "lastEditDate":
			query = query.addSelect("editDates.lastEditDate", selectedColumnName);
			break;
		// OK
		case "daysBetweenFirstAndLastEdit":
			query = query.addSelect("DATEDIFF(editDates.lastEditDate, editDates.firstEditDate)", selectedColumnName);
			break;
		// OK
		case "averageEditsPerDayInPeriod":
			query = query.addSelect(
				"(IFNULL(sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.editsToDate + atPeriodStartActorStatistics.dailyEdits, 0))"
				+ " / "
				+ "(IFNULL(sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.activeDaysToDate + atPeriodStartActorStatistics.dailyActiveDay, 0))", selectedColumnName);
			break;
		// OK
		case "averageEditsPerDaySinceRegistration":
			query = query.addSelect("IFNULL((sinceRegistrationActorStatistics.editsToDate + sinceRegistrationActorStatistics.dailyEdits)"
				+ " / (sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay), 0)", selectedColumnName);
			break;

		// OK
		case "firstLogEventDate":
			query = query.addSelect("logEventDates.firstLogEventDate", selectedColumnName);
			break;
		// OK
		case "lastLogEventDate":
			query = query.addSelect("logEventDates.lastLogEventDate", selectedColumnName);
			break;
		// OK
		case "averageLogEventsPerDayInPeriod":
			query = query.addSelect(
				"(IFNULL(sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.logEventsToDate + atPeriodStartActorStatistics.dailyLogEvents, 0))"
				+ " / "
				+ "(IFNULL(sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.activeDaysToDate + atPeriodStartActorStatistics.dailyActiveDay, 0))", selectedColumnName);
			break;
		// OK
		case "averageLogEventsPerDaySinceRegistration":
			query = query.addSelect("IFNULL((sinceRegistrationActorStatistics.logEventsToDate + sinceRegistrationActorStatistics.dailyLogEvents)"
				+ " / (sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay), 0)", selectedColumnName);
			break;
		// OK
		case "daysBetweenFirstAndLastLogEvent":
			query = query.addSelect("DATEDIFF(logEventDates.lastLogEventDate, logEventDates.firstLogEventDate)", selectedColumnName);
			break;
		// OK
		case "registrationDate":
			query = query.addSelect("DATE(actor.registrationTimestamp)", selectedColumnName);
			break;
		// OK
		case "daysSinceRegistration":
			query = query.addSelect("DATEDIFF(:endDate, DATE(actor.registrationTimestamp))", selectedColumnName);
			break;

		// OK
		case "activeDaysInPeriod":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay, 0) "
				+ "- IFNULL(atPeriodStartActorStatistics.activeDaysToDate + atPeriodStartActorStatistics.dailyActiveDay, 0)", selectedColumnName);
			break;
		// OK
		case "activeDaysSinceRegistration":
			query = query.addSelect("IFNULL(sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay, 0)", selectedColumnName);
			break;

		// OK
		case "levelAtPeriodStart":
			query = addStartLevelColumnSelects(query, selectedColumnName);
			break;
		// OK
		case "levelAtPeriodEnd":
			query = addEndLevelColumnSelects(query, selectedColumnName);
			break;
		// OK
		case "levelAtPeriodEndWithChange":
			query = addStartLevelColumnSelects(query, selectedColumnName);
			query = addEndLevelColumnSelects(query, selectedColumnName);
			break;
	}

	return query;
}

function addStartLevelColumnSelects(query: SelectQueryBuilder<ActorTypeModel>, selectedColumnName: string) {
	query = query.addSelect(
		"IFNULL(atPeriodStartActorStatistics.editsToDate + atPeriodStartActorStatistics.dailyEdits, 0)",
		`${selectedColumnName}_startEdits`
	);
	query = query.addSelect(
		"IFNULL(atPeriodStartActorStatistics.logEventsToDate + atPeriodStartActorStatistics.dailyLogEvents, 0)",
		`${selectedColumnName}_startLogEvents`
	);
	query = query.addSelect(
		"IFNULL(atPeriodStartActorStatistics.activeDaysToDate + atPeriodStartActorStatistics.dailyActiveDay, 0)",
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
		"IFNULL(sinceRegistrationActorStatistics.activeDaysToDate + sinceRegistrationActorStatistics.dailyActiveDay, 0)",
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
			case "revertedEditsInPeriod":
			case "characterChangesInPeriod":
			case "receivedThanksInPeriod":
			case "sentThanksInPeriod":
			case "logEventsInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;

			case "editsInPeriodPercentage":
			case "revertedEditsInPeriodPercentage":
			case "characterChangesInPeriodPercentage":
			case "receivedThanksInPeriodPercentage":
			case "sentThanksInPeriodPercentage":
			case "logEventsInPeriodPercentage":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				break;

			case "editsSinceRegistration":
			case "revertedEditsSinceRegistration":
			case "characterChangesSinceRegistration":
			case "receivedThanksSinceRegistration":
			case "sentThanksSinceRegistration":
			case "logEventsSinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				break;

			case "editsSinceRegistrationPercentage":
			case "revertedEditsSinceRegistrationPercentage":
			case "characterChangesSinceRegistrationPercentage":
			case "receivedThanksSinceRegistrationPercentage":
			case "sentThanksSinceRegistrationPercentage":
			case "logEventsSinceRegistrationPercentage":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				break;

			case "editsInNamespaceInPeriod":
			case "revertedEditsInNamespaceInPeriod":
			case "characterChangesInNamespaceInPeriod": {
				for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
					const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
					namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				}
				break;
			}
			case "editsInNamespaceInPeriodPercentage":
			case "revertedEditsInNamespaceInPeriodPercentage":
			case "characterChangesInNamespaceInPeriodPercentage": {
				for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
					const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
					namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
					namespaceCollector.requiredColumnsForSelectedPeriodWikiStatistics.push(column.type);
				}
				break;
			}
			case "editsInNamespaceSinceRegistration":
			case "revertedEditsInNamespaceSinceRegistration":
			case "characterChangesInNamespaceSinceRegistration": {
				for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
					const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
					namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				}
				break;
			}
			case "editsInNamespaceSinceRegistrationPercentage":
			case "revertedEditsInNamespaceSinceRegistrationPercentage":
			case "characterChangesInNamespaceSinceRegistrationPercentage": {
				for (const ns of Array.isArray(column.namespace) ? column.namespace : [column.namespace]) {
					const namespaceCollector = getOrCreateNamespaceCollector(ctx, ns);
					namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
					namespaceCollector.requiredColumnsForSinceRegisteredWikiStatistics.push(column.type);
				}
				break;
			}

			case "editsInPeriodByChangeTag":
			case "characterChangesInPeriodByChangeTag": {
				for (const ct of Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag]) {
					const namespaceCollector = getOrCreateChangeTagCollector(ctx, ct);
					namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				}
				break;
			}

			case "editsSinceRegistrationByChangeTag":
			case "characterChangesSinceRegistrationByChangeTag": {
				for (const ct of Array.isArray(column.changeTag) ? column.changeTag : [column.changeTag]) {
					const namespaceCollector = getOrCreateChangeTagCollector(ctx, ct);
					namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				}
				break;
			}

			case "averageEditsPerDayInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push("editsInPeriod");
				break;
			case "averageEditsPerDaySinceRegistration":
				ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.push("editsSinceRegistration");
				break;

			case "logEventsInPeriodByType": {
				for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
					const namespaceCollector = getOrCreateLogTypeCollector(ctx, logFilter);
					namespaceCollector.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				}
				break;
			}
			case "logEventsSinceRegistrationByType": {
				for (const logFilter of Array.isArray(column.logFilter) ? column.logFilter : [column.logFilter]) {
					const namespaceCollector = getOrCreateLogTypeCollector(ctx, logFilter);
					namespaceCollector.requiredColumnsForSinceRegisteredActorStatistics.push(column.type);
				}
				break;
			}

			case "activeDaysInPeriod":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(column.type);
				break;

			case "levelAtPeriodStart":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(
					"editsInPeriod",
					"logEventsInPeriod",
				);
				break;

			case "levelAtPeriodEnd":
				ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.push(
					"editsInPeriod",
					"logEventsInPeriod"
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
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("lads.actorId", "actorId")
				.addSelect("MAX(lads.date)", "lastDate")
				.from(wikiEntities.actorDailyStatistics, "lads")
				.where("lads.date < :startDate", { startDate: startDate })
				.groupBy("lads.actorId");
		}, "lastStatisticsBeforePeriodStart", "lastStatisticsBeforePeriodStart.actorId = actor.actorId");

		query = query.innerJoin(
			wikiEntities.actorDailyStatistics,
			"atPeriodStartActorStatistics",
			"atPeriodStartActorStatistics.actorId = actor.actorId AND atPeriodStartActorStatistics.date = lastStatisticsBeforePeriodStart.lastDate"
		);
	}

	if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("MAX(lwds.date)", "lastDate")
				.from(wikiEntities.dailyStatistics, "lwds")
				.where("lwds.date < :startDate", { startDate: startDate });
		}, "atPeriodStartWikiStatisticsDate", "true");

		query = query.leftJoin(
			wikiEntities.dailyStatistics,
			"atPeriodStartWikiStatistics",
			"atPeriodStartWikiStatistics.date = atPeriodStartWikiStatisticsDate.lastDate"
		);
	}

	if (ctx.columns.requiredColumnsForSinceRegisteredActorStatistics.length > 0
		|| ctx.columns.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("lads.actorId", "actorId")
				.addSelect("MAX(lads.date)", "lastDate")
				.from(wikiEntities.actorDailyStatistics, "lads")
				.where("lads.date <= :endDate", { endDate: endDate })
				.groupBy("lads.actorId");
		}, "lastActorStatisticsAtPeriodEnd", "lastActorStatisticsAtPeriodEnd.actorId = actor.actorId");

		query = query.innerJoin(
			wikiEntities.actorDailyStatistics,
			"sinceRegistrationActorStatistics",
			"sinceRegistrationActorStatistics.actorId = actor.actorId AND sinceRegistrationActorStatistics.date = lastActorStatisticsAtPeriodEnd.lastDate"
		);
	}

	if (ctx.columns.requiredColumnsForSelectedPeriodWikiStatistics.length > 0
		|| ctx.columns.requiredColumnsForSinceRegisteredWikiStatistics.length > 0) {
		query = query.leftJoin(qb => {
			return qb.subQuery()
				.select("MAX(lwds.date)", "lastDate")
				.from(wikiEntities.dailyStatistics, "lwds")
				.where("lwds.date <= :endDate", { endDate: endDate });
		}, "lastWikiStatisticsAtPeriodEnd", "true");

		query = query.leftJoin(
			wikiEntities.dailyStatistics,
			"sinceStartWikiStatistics",
			"sinceStartWikiStatistics.date = lastWikiStatisticsAtPeriodEnd.lastDate"
		);
	}

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
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.dailyEdits > 0")
				.groupBy("ads.actorId");
		}, "editDates", "editDates.actorId = actor.actorId");
	}

	const needsDaysBetweenFirstAndLastLogEvent = columns.findIndex(x => x.type === "daysBetweenFirstAndLastLogEvent") !== -1;
	const needsFirstLogEventDate = needsDaysBetweenFirstAndLastLogEvent || columns.findIndex(x => x.type === "firstLogEventDate") !== -1;
	const needsLastLogEventDate = needsDaysBetweenFirstAndLastLogEvent || columns.findIndex(x => x.type === "lastLogEventDate") !== -1;

	if (needsDaysBetweenFirstAndLastLogEvent || needsFirstLogEventDate || needsLastLogEventDate) {
		query = query.innerJoin(qb => {
			let subQuery = qb.subQuery()
				.select("ads.actorId", "actorId");

			if (needsFirstEditDate) {
				subQuery = subQuery.addSelect("MIN(date)", "firstLogEventDate");
			}

			if (needsLastEditDate) {
				subQuery = subQuery.addSelect("MAX(date)", "lastLogEventDate");
			}

			return subQuery
				.from(wikiEntities.actorDailyStatistics, "ads")
				.where(
					"ads.date <= :endDate", { endDate: endDate }
				)
				.andWhere("ads.dailyLogEvents > 0")
				.groupBy("ads.actorId");
		}, "logEventDates", "logEntryDates.actorId = actor.actorId");
	}

	for (const namespaceCollection of ctx.columns.requiredNamespaceStatisticsColumns) {
		const namespaceKey = formatNamespaceParameter(namespaceCollection.namespace);

		if (namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
					.where("lads.date < :startDate", { startDate: startDate });

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lads");

				return subQuery.groupBy("lads.actorId");
			}, `ns${namespaceKey}LastStatisticsBeforePeriodStart`, `ns${namespaceKey}LastStatisticsBeforePeriodStart.actorId = actor.actorId`);

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				`ns${namespaceKey}AtPeriodStartActorStatistics`,
				`ns${namespaceKey}AtPeriodStartActorStatistics.actorId = actor.actorId`
				+ ` AND ns${namespaceKey}AtPeriodStartActorStatistics.namespace = :namespace${namespaceCollection.namespace}`
				+ ` AND ns${namespaceKey}AtPeriodStartActorStatistics.date = ns${namespaceKey}LastStatisticsBeforePeriodStart.lastDate`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}

		if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.length > 0) {
			query = query.leftJoin(qb => {
				const subQuery = qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatisticsByNamespace, "lwds")
					.where("lwds.date < :startDate", { startDate: startDate });

				return createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lwds");
			}, `ns${namespaceKey}AtPeriodStartWikiStatisticsDate`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				`ns${namespaceKey}AtPeriodStartWikiStatistics`,
				`ns${namespaceKey}AtPeriodStartWikiStatistics.date = ns${namespaceKey}AtPeriodStartWikiStatisticsDate.lastDate`
				+ ` AND ns${namespaceKey}AtPeriodStartWikiStatistics.namespace = :namespace${namespaceCollection.namespace}`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}

		if (namespaceCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0
			|| namespaceCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
			query = query.leftJoin(qb => {
				let subQuery = qb.subQuery()
					.select("lads.actorId", "actorId")
					.addSelect("MAX(lads.date)", "lastDate")
					.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
					.where("lads.date <= :endDate", { endDate: endDate })
					.groupBy("lads.actorId");

				subQuery = createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lads");

				return subQuery.groupBy("lads.actorId");
			}, `ns${namespaceKey}LastActorStatisticsAtPeriodEnd`, `ns${namespaceKey}LastActorStatisticsAtPeriodEnd.actorId = actor.actorId`);

			query = query.leftJoin(
				wikiEntities.actorDailyStatisticsByNamespace,
				`ns${namespaceKey}SinceRegistrationActorStatistics`,
				`ns${namespaceKey}SinceRegistrationActorStatistics.actorId = actor.actorId `
				+ ` AND ns${namespaceKey}SinceRegistrationActorStatistics.namespace = :namespace${namespaceCollection.namespace}`
				+ ` AND ns${namespaceKey}SinceRegistrationActorStatistics.date = ns${namespaceKey}LastActorStatisticsAtPeriodEnd.lastDate`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}

		if (namespaceCollection.requiredColumnsForSelectedPeriodWikiStatistics.length > 0
			|| namespaceCollection.requiredColumnsForSinceRegisteredWikiStatistics.length > 0) {
			query = query.leftJoin(qb => {
				const subQuery = qb.subQuery()
					.select("MAX(lwds.date)", "lastDate")
					.from(wikiEntities.dailyStatisticsByNamespace, "lwds")
					.where("lwds.date <= :endDate", { endDate: endDate });

				return createNamespaceWhereClauseFromNamespaceDefinition(namespaceCollection, subQuery, "lwds");
			}, `ns${namespaceKey}LastWikiStatisticsAtPeriodEnd`, "true");

			query = query.leftJoin(
				wikiEntities.dailyStatisticsByNamespace,
				`ns${namespaceKey}SinceStartWikiStatistics`,
				`ns${namespaceKey}SinceStartWikiStatistics.date = ns${namespaceKey}LastWikiStatisticsAtPeriodEnd.lastDate`
				+ ` AND ns${namespaceKey}SinceStartWikiStatistics.namespace = :namespace${namespaceCollection.namespace}`,
				{ [`namespace${namespaceCollection.namespace}`]: namespaceCollection.namespace }
			);
		}
	}

	// for (const changeTagCollection of ctx.columns.requiredChangeTagStatisticsColumns) {
	// 	const normalizedCtKey = changeTagCollection.serializedChangeTagFilter;

	// 	if (changeTagCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
	// 		query = query.leftJoin(qb => {
	// 			let subQuery = qb.subQuery()
	// 				.select("lads.actorId", "actorId")
	// 				.addSelect("MAX(lads.date)", "lastDate")
	// 				.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
	// 				.where("lads.date < :startDate", { startDate: startDate });

	// 			subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

	// 			return subQuery.groupBy("lads.actorId");
	// 		}, `ct${normalizedCtKey}LastStatisticsBeforePeriodStart`, `ct${normalizedCtKey}LastStatisticsBeforePeriodStart.actorId = actor.actorId`);

	// 		query = query.leftJoin(
	// 			wikiEntities.actorDailyStatisticsByNamespace,
	// 			`ct${normalizedCtKey}AtPeriodStartActorStatistics`,
	// 			`ct${normalizedCtKey}AtPeriodStartActorStatistics.actorId = actor.actorId`
	// 			+ ` AND ct${normalizedCtKey}AtPeriodStartActorStatistics.namespace = :namespace${changeTagCollection.changeTagFilter}`
	// 			+ ` AND ct${normalizedCtKey}AtPeriodStartActorStatistics.date = ct${normalizedCtKey}LastStatisticsBeforePeriodStart.lastDate`,
	// 			{ [`namespace${normalizedCtKey.namespace}`]: changeTagCollection.namespace }
	// 		);
	// 	}

	// 	if (changeTagCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0
	// 		|| changeTagCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
	// 		query = query.leftJoin(qb => {
	// 			let subQuery = qb.subQuery()
	// 				.select("lads.actorId", "actorId")
	// 				.addSelect("MAX(lads.date)", "lastDate")
	// 				.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
	// 				.where("lads.date <= :endDate", { endDate: endDate })
	// 				.groupBy("lads.actorId");

	// 			subQuery = createChangeTagWhereClauseFromFilterDefinition(changeTagCollection, subQuery, "lads");

	// 			return subQuery.groupBy("lads.actorId");
	// 		}, `ct${normalizedCtKey}LastActorStatisticsAtPeriodEnd`, `ct${normalizedCtKey}LastActorStatisticsAtPeriodEnd.actorId = actor.actorId`);

	// 		query = query.leftJoin(
	// 			wikiEntities.actorDailyStatisticsByNamespace,
	// 			`ct${normalizedCtKey}SinceRegistrationActorStatistics`,
	// 			`ct${normalizedCtKey}SinceRegistrationActorStatistics.actorId = actor.actorId `
	// 			+ ` AND ct${normalizedCtKey}SinceRegistrationActorStatistics.namespace = :namespace${changeTagCollection.namespace}`
	// 			+ ` AND ct${normalizedCtKey}SinceRegistrationActorStatistics.date = ct${normalizedCtKey}LastActorStatisticsAtPeriodEnd.lastDate`,
	// 			{ [`namespace${changeTagCollection.namespace}`]: changeTagCollection.namespace }
	// 		);
	// 	}
	// }

	// for (const logTypeCollection of ctx.columns.requiredLogTypeStatisticsColumns) {
	// 	const normalizedLogKey = logTypeCollection.serializedLogFilter;

	// 	if (logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
	// 		query = query.leftJoin(qb => {
	// 			let subQuery = qb.subQuery()
	// 				.select("lads.actorId", "actorId")
	// 				.addSelect("MAX(lads.date)", "lastDate")
	// 				.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
	// 				.where("lads.date < :startDate", { startDate: startDate });

	// 			subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

	// 			return subQuery.groupBy("lads.actorId");
	// 		}, `ns${normalizedLogKey}LastStatisticsBeforePeriodStart`, `ns${normalizedLogKey}LastStatisticsBeforePeriodStart.actorId = actor.actorId`);

	// 		query = query.leftJoin(
	// 			wikiEntities.actorDailyStatisticsByNamespace,
	// 			`ns${normalizedLogKey}AtPeriodStartActorStatistics`,
	// 			`ns${normalizedLogKey}AtPeriodStartActorStatistics.actorId = actor.actorId`
	// 			+ ` AND ns${normalizedLogKey}AtPeriodStartActorStatistics.namespace = :namespace${logTypeCollection.namespace}`
	// 			+ ` AND ns${normalizedLogKey}AtPeriodStartActorStatistics.date = ns${normalizedLogKey}LastStatisticsBeforePeriodStart.lastDate`,
	// 			{ [`namespace${logTypeCollection.namespace}`]: logTypeCollection.namespace }
	// 		);
	// 	}

	// 	if (logTypeCollection.requiredColumnsForSinceRegisteredActorStatistics.length > 0
	// 		|| logTypeCollection.requiredColumnsForSelectedPeriodActorStatistics.length > 0) {
	// 		query = query.leftJoin(qb => {
	// 			let subQuery = qb.subQuery()
	// 				.select("lads.actorId", "actorId")
	// 				.addSelect("MAX(lads.date)", "lastDate")
	// 				.from(wikiEntities.actorDailyStatisticsByNamespace, "lads")
	// 				.where("lads.date <= :endDate", { endDate: endDate })
	// 				.groupBy("lads.actorId");

	// 			subQuery = createLogWhereClauseFromFilterDefinition(logTypeCollection, subQuery, "lads");

	// 			return subQuery.groupBy("lads.actorId");
	// 		}, `ns${normalizedLogKey}LastActorStatisticsAtPeriodEnd`, `ns${normalizedLogKey}LastActorStatisticsAtPeriodEnd.actorId = actor.actorId`);

	// 		query = query.leftJoin(
	// 			wikiEntities.actorDailyStatisticsByNamespace,
	// 			`ns${normalizedLogKey}SinceRegistrationActorStatistics`,
	// 			`ns${normalizedLogKey}SinceRegistrationActorStatistics.actorId = actor.actorId `
	// 			+ ` AND ns${normalizedLogKey}SinceRegistrationActorStatistics.namespace = :namespace${logTypeCollection.namespace}`
	// 			+ ` AND ns${normalizedLogKey}SinceRegistrationActorStatistics.date = ns${normalizedLogKey}LastActorStatisticsAtPeriodEnd.lastDate`,
	// 			{ [`namespace${logTypeCollection.namespace}`]: logTypeCollection.namespace }
	// 		);
	// 	}
	// }

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
	namespaceCollection: ChangeTagStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	queryBuilder = queryBuilder.andWhere(
		`${tableAlias}.changeTagId = :changeTagId${namespaceCollection.changeTagFilter.changeTagId}`,
		{ [`changeTagId${namespaceCollection.changeTagFilter.changeTagId}`]: namespaceCollection.changeTagFilter.changeTagId }
	);

	return queryBuilder;
}

function createLogWhereClauseFromFilterDefinition(
	namespaceCollection: LogTypeStatisticsRequiredColumns,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryBuilder: SelectQueryBuilder<any>,
	tableAlias: string
) {
	if (namespaceCollection.logFilter.logType) {
		queryBuilder = queryBuilder.andWhere(
			`${tableAlias}.logType = :logType${namespaceCollection.logFilter.logType.replace("-", "_")}`,
			{ [`logType${namespaceCollection.logFilter.logType.replace("-", "_")}`]: namespaceCollection.logFilter.logType.replace("-", "_") }
		);
	}

	if (namespaceCollection.logFilter.logAction) {
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

		query = query.addOrderBy(
			`column${referencedColumnIndex} `,
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
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
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

function getOrCreateChangeTagCollector(ctx: StatisticsQueryBuildingContext, changeTagFilter: ChangeTagFilterDefinition): ChangeTagStatisticsRequiredColumns {
	const serializedChangeTagFilter = formatChangeTagFilterDefinitionCollection(changeTagFilter);

	let existingCollector = ctx.columns.requiredChangeTagStatisticsColumns
		.find(x => x.serializedChangeTagFilter === serializedChangeTagFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedChangeTagFilter: serializedChangeTagFilter,
			changeTagFilter: changeTagFilter,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
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
	return `${changeTagFilter.namespace ?? "any"}_${changeTagFilter.changeTagId}`.replace(/-/g, "_");
}

function getOrCreateLogTypeCollector(ctx: StatisticsQueryBuildingContext, logFilter: LogFilterDefinition): LogTypeStatisticsRequiredColumns {
	const serializedLogFilter = formatLogFilterDefinitionCollection(logFilter);

	let existingCollector = ctx.columns.requiredLogTypeStatisticsColumns
		.find(x => x.serializedLogFilter === serializedLogFilter);

	if (!existingCollector) {
		existingCollector = {
			serializedLogFilter: serializedLogFilter,
			logFilter: logFilter,
			requiredColumnsForSelectedPeriodActorStatistics: [],
			requiredColumnsForSelectedPeriodWikiStatistics: [],
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
	return `${logFilter.logType ?? "any"}_${logFilter.logAction ?? "any"}`.replace(/-/g, "_");
}
