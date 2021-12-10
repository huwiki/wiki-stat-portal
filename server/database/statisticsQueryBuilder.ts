import { addDays, subDays } from "date-fns";
import { Connection, SelectQueryBuilder } from "typeorm";
import { UserRequirements } from "../../common/modules/commonConfiguration";
import { ListColumn, ListOrderBy } from "../../common/modules/lists/listsConfiguration";
import { AppRunningContext } from "../appRunningContext";
import { ActorTypeModel, WikiStatisticsTypesResult } from "./entities/toolsDatabase/actorByWiki";

export interface ActorLike {
	aId: number;
}

export async function createStatisticsQuery({ appCtx, toolsDbConnection, wikiEntities, userRequirements, columns, orderBy, startDate, endDate }: {
	appCtx: AppRunningContext,
	toolsDbConnection: Connection,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements,
	columns?: ListColumn[],
	orderBy?: ListOrderBy[],
	startDate?: Date,
	endDate: Date
}): Promise<ActorLike[]> {

	let query = toolsDbConnection.getRepository(wikiEntities.actor)
		.createQueryBuilder("actor")
		.select("actor.actorId", "aId");

	// Manage required joins
	query = addUserRequirementJoins(query, wikiEntities, userRequirements, endDate);
	query = addColumnJoins(query, wikiEntities, startDate, endDate, columns);

	// Manage required filterings
	query = addUserRequirementFilters(query, wikiEntities, userRequirements, endDate);

	query = addOrderBy(query, wikiEntities, orderBy);

	appCtx.logger.info(`[createStatisticsQuery] SQL: ${query.getSql()}`);

	if (columns && columns.length > 0) {
		return [];
	} else {
		return await query.getRawMany<{ aId: number }>();
	}
}

function addUserRequirementJoins(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements,
	endDate: Date
) {
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

function addColumnJoins(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	startDate: Date | undefined,
	endDate: Date,
	columns?: ListColumn[]
) {
	if (!columns || columns.length == 0)
		return query;

	return query;
}

function addUserRequirementFilters(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	userRequirements: UserRequirements,
	endDate: Date
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
				.select("MAX(iats.date)")
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
				.select("MAX(iats.date)")
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

function addOrderBy(
	query: SelectQueryBuilder<ActorTypeModel>,
	wikiEntities: WikiStatisticsTypesResult,
	orderBy?: ListOrderBy[]
) {
	if (!orderBy || orderBy.length == 0)
		return query;

	return query;
}
