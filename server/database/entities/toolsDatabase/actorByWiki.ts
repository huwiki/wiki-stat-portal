import { Column, Entity, PrimaryColumn } from "typeorm";
import { bufferToStringTransformer, intToBooleanTransformer } from "../../transformers";

/**
 * Type models for these classes are required so we can type the return value of `createActorEntitiesForWiki` method
 * and type `ENTITY_CACHE_BY_WIKI` (the cache for generated types). If a new property is added to a dynamically generated
 * class, it must be added to the type models too, so consumers of the `createActorEntitiesForWiki` will be able
 * to use proper typing for these classes.
 */

export class ActorTypeModel {
	public actorId: number;
	public actorName: string;
	public isRegistered: boolean;
	public registrationTimestamp: Date | null;
	public isRegistrationTimestampFromFirstEdit: boolean | null;
	public userGroups: string;
}

export class ActorStatisticsTypeModel {
	public actorId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
}

export class ActorStatisticsByNamespaceTypeModel {
	public actorId: number;
	public namespace: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
}

export interface WikiStatisticsTypesResult {
	/**
	 * Entity representing an actor of a wiki (anonymus or registered user)
	 */
	actor: typeof ActorTypeModel,
	/**
	 * Entity representing a daily edit statistics of an actor on a wiki.
	 */
	actorStatistics: typeof ActorStatisticsTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given namespace of an actor on a wiki.
	 */
	actorStatisticsByNamespace: typeof ActorStatisticsByNamespaceTypeModel,
}

const ENTITY_CACHE_BY_WIKI: { [index: string]: WikiStatisticsTypesResult } = {};

/**
 * Generates dynamic entity classes for a given wiki. As table names are static in TypeORM,
 * the classes must be manually created for each wiki or generated dynamically (as we do
 * with this method)
 * @param wikiId Identifier of the wiki as defined in `knownWikis.json`
 */
export const createActorEntitiesForWiki = (wikiId: string): WikiStatisticsTypesResult => {
	if (ENTITY_CACHE_BY_WIKI[wikiId])
		return ENTITY_CACHE_BY_WIKI[wikiId];

	const actorTableName = `${wikiId}_actor`;
	const actorStatisticsTableName = `${wikiId}_actor_stats`;
	const actorStatisticsByNamespaceTableName = `${wikiId}_actor_stats_by_ns`;

	@Entity({ name: actorTableName })
	class Actor {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ name: "actor_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public actorName: string;

		@Column({ name: "is_registered", type: "tinyint", transformer: intToBooleanTransformer })
		public isRegistered: boolean;

		@Column({ name: "registration_timestamp", type: "datetime" })
		public registrationTimestamp: Date | null;

		@Column({ name: "is_registration_timestamp_from_first_edit", type: "boolean", transformer: intToBooleanTransformer })
		public isRegistrationTimestampFromFirstEdit: boolean | null;

		@Column({ name: "user_groups", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public userGroups: string;
	}

	@Entity({ name: actorStatisticsTableName })
	class ActorStatistics {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;
	}

	@Entity({ name: actorStatisticsByNamespaceTableName })
	class ActorStatisticsByNamespace {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;
	}

	const ret: WikiStatisticsTypesResult = {
		actor: Actor,
		actorStatistics: ActorStatistics,
		actorStatisticsByNamespace: ActorStatisticsByNamespace,
	};

	ENTITY_CACHE_BY_WIKI[wikiId] = ret;
	return ret;
};
