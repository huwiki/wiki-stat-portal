import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
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
	public firstEditTimestamp: Date;
	public lastEditTimestamp: Date;
	public firstLogEntryTimestamp: Date;
	public lastLogEntryTimestamp: Date;
	public actorGroups: ActorGroupTypeModel[];
}

export class ActorGroupTypeModel {
	public actorId: number;
	public actor: ActorTypeModel;
	public groupName: string;
}

export class ActorEditStatisticsTypeModel {
	public actorId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
	public dailyThanks: number;
	public thanksToDate: number;
}

export class ActorEditStatisticsByNamespaceTypeModel {
	public actorId: number;
	public namespace: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
}

export class ActorLogStatisticsTypeModel {
	public actorId: number;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorLogStatisticsByNamespaceAndChangeTagTypeModel {
	public actorId: number;
	public namespace: number;
	public logType: string;
	public logAction: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export interface WikiStatisticsTypesResult {
	/**
	 * Entity representing an actor of a wiki (anonymus or registered user)
	 */
	actor: typeof ActorTypeModel,
	/**
	 *
	 */
	actorGroup: typeof ActorGroupTypeModel,
	/**
	 * Entity representing a daily edit statistics of an actor on a wiki.
	 */
	actorEditStatistics: typeof ActorEditStatisticsTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given namespace of an actor on a wiki.
	 */
	actorEditStatisticsByNamespace: typeof ActorEditStatisticsByNamespaceTypeModel,
	/**
	 * Entity representing a daily log statistics of an actor on a wiki.
	 */
	actorLogStatistics: typeof ActorLogStatisticsTypeModel,
	/**
	 * Entity representing a daily log statistics for a given namespace and change tag of an actor on a wiki.
	 */
	actorLogStatisticsByNamespaceAndChangeTag: typeof ActorLogStatisticsByNamespaceAndChangeTagTypeModel,
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

	const actorTableName = `${wikiId}_actor_v2`;
	const actorGroupTableName = `${wikiId}_actor_groups_v2`;
	const actorEditStatisticsTableName = `${wikiId}_actor_edit_stats_v2`;
	const actorEditStatisticsByNamespaceTableName = `${wikiId}_actor_edit_stats_by_ns_v2`;
	const actorLogStatisticsTableName = `${wikiId}_actor_log_stats_v2`;
	const actorLogStatisticsByNamespaceAndChangeTagTableName = `${wikiId}_actor_log_stats_by_nsct_v2`;

	@Entity({ name: actorTableName })
	class Actor {
		@PrimaryColumn({ name: "actor_id", type: "bigint", unsigned: true })
		public actorId: number;

		@Column({ name: "actor_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public actorName: string;

		@Column({ name: "is_registered", type: "tinyint", transformer: intToBooleanTransformer })
		public isRegistered: boolean;

		@Column({ name: "registration_timestamp", type: "datetime" })
		public registrationTimestamp: Date | null;

		@Column({ name: "is_registration_timestamp_from_first_edit", type: "boolean", transformer: intToBooleanTransformer })
		public isRegistrationTimestampFromFirstEdit: boolean | null;

		@Column({ name: "first_edit_timestamp", type: "datetime" })
		public firstEditTimestamp: Date;

		@Column({ name: "last_edit_timestamp", type: "datetime" })
		public lastEditTimestamp: Date;

		@Column({ name: "first_log_entry_timestamp", type: "datetime" })
		public firstLogEntryTimestamp: Date;

		@Column({ name: "last_log_entry_timestamp", type: "datetime" })
		public lastLogEntryTimestamp: Date;

		@OneToMany(() => ActorGroup, actorGroup => actorGroup.actor)
		public actorGroups: ActorGroup[];
	}

	@Entity({ name: actorGroupTableName })
	class ActorGroup {
		@PrimaryColumn({ name: "actor_id", type: "bigint", unsigned: true })
		public actorId: number;

		@ManyToOne(() => Actor, actor => actor.actorGroups)
		@JoinColumn({ name: "actor_id" })
		public actor: Actor;

		@PrimaryColumn({ name: "group_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public groupName: string;
	}

	@Entity({ name: actorEditStatisticsTableName })
	class ActorEditStatistics {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;

		@Column({ name: "daily_thanks", type: "int" })
		public dailyThanks: number;

		@Column({ name: "thanks_to_date", type: "int" })
		public thanksToDate: number;
	}

	@Entity({ name: actorEditStatisticsByNamespaceTableName })
	class ActorEditStatisticsByNamespace {
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

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;
	}

	@Entity({ name: actorLogStatisticsTableName })
	class ActorLogStatistics {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorLogStatisticsByNamespaceAndChangeTagTableName })
	class ActorLogStatisticsByNamespaceAndChangeTag {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@PrimaryColumn({ name: "log_type", type: "varbinary", length: 32, transformer: bufferToStringTransformer })
		public logType: string;

		@PrimaryColumn({ name: "log_action", type: "varbinary", length: 32, transformer: bufferToStringTransformer })
		public logAction: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	const ret: WikiStatisticsTypesResult = {
		actor: Actor,
		actorGroup: ActorGroup,
		actorEditStatistics: ActorEditStatistics,
		actorEditStatisticsByNamespace: ActorEditStatisticsByNamespace,
		actorLogStatistics: ActorLogStatistics,
		actorLogStatisticsByNamespaceAndChangeTag: ActorLogStatisticsByNamespaceAndChangeTag,
	};

	ENTITY_CACHE_BY_WIKI[wikiId] = ret;
	return ret;
};
