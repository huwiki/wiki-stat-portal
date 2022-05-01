import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
import { intToBooleanTransformer } from "../../transformers";

/**
 * Type models for these classes are required so we can type the return value of `createActorEntitiesForWiki` method
 * and type `ENTITY_CACHE_BY_WIKI` (the cache for generated types). If a new property is added to a dynamically generated
 * class, it must be added to the type models too, so consumers of the `createActorEntitiesForWiki` will be able
 * to use proper typing for these classes.
 */

export class CacheEntryTypeModel {
	public key: string;
	public cacheTimestamp: Date;
	public startDate: Date;
	public endDate: Date;
	public content: string;
}

export class TemplateTypeModel {
	public templatePageId: number;
	public templateName: string;
}

export class ChangeTagDefinitionTypeModel {
	public changeTagDefinitionId: number;
	public changeTagDefinitionName: string;
}

export class ActorTypeModel {
	public actorId: number;
	public actorName: string;
	public isRegistered: boolean;
	public registrationTimestamp: Date | null;
	public isRegistrationTimestampFromFirstEdit: boolean | null;
	public firstEditTimestamp: Date | null;
	public lastEditTimestamp: Date | null;
	public firstLogEntryTimestamp: Date | null;
	public lastLogEntryTimestamp: Date | null;
	public actorGroups: ActorGroupTypeModel[];
}

export class ActorGroupTypeModel {
	public actorId: number;
	public actor: ActorTypeModel;
	public groupName: string;
}

export class ActorUserPageTemplateTypeModel {
	public actorId: number;
	public templatePageId: number;
}

export class DailyStatisticsTypeModel {
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyRevertedEdits: number;
	public revertedEditsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
	public dailyReceivedThanks: number;
	public receivedThanksToDate: number;
	public dailySentThanks: number;
	public sentThanksToDate: number;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorDailyStatisticsTypeModel {
	public actorId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyRevertedEdits: number;
	public revertedEditsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
	public dailyReceivedThanks: number;
	public receivedThanksToDate: number;
	public dailySentThanks: number;
	public sentThanksToDate: number;
	public dailyLogEvents: number;
	public logEventsToDate: number;
	public dailyServiceAwardLogEvents: number;
	public serviceAwardLogEventsToDate: number;
	public dailyActiveDay: number;
	public activeDaysToDate: number;
}

export class DailyStatisticsByNamespaceTypeModel {
	public namespace: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyRevertedEdits: number;
	public revertedEditsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorDailyStatisticsByNamespaceTypeModel {
	public actorId: number;
	public namespace: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyRevertedEdits: number;
	public revertedEditsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class EditStatisticsByChangeTagTypeModel {
	public changeTagId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
}

export class ActorEditStatisticsByChangeTagTypeModel {
	public actorId: number;
	public changeTagId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
}

export class EditStatisticsByNamespaceAndChangeTagTypeModel {
	public namespace: number;
	public changeTagId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
}

export class ActorEditStatisticsByNamespaceAndChangeTagTypeModel {
	public actorId: number;
	public namespace: number;
	public changeTagId: number;
	public date: Date;
	public dailyEdits: number;
	public editsToDate: number;
	public dailyCharacterChanges: number;
	public characterChangesToDate: number;
}

export class LogStatisticsByLogTypeTypeModel {
	public logType: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorLogStatisticsByLogTypeTypeModel {
	public actorId: number;
	public logType: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class LogStatisticsByLogActionTypeModel {
	public logAction: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorLogStatisticsByLogActionTypeModel {
	public actorId: number;
	public logAction: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class LogStatisticsByLogTypeAndLogActionTypeModel {
	public logType: string;
	public logAction: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export class ActorLogStatisticsByLogTypeAndLogActionTypeModel {
	public actorId: number;
	public logType: string;
	public logAction: string;
	public date: Date;
	public dailyLogEvents: number;
	public logEventsToDate: number;
}

export interface WikiStatisticsTypesResult {
	/**
	 * Entity representing a cache entry for the wiki
	 */
	cacheEntry: typeof CacheEntryTypeModel,
	/**
	 * Entity representing a template in the wiki
	 */
	template: typeof TemplateTypeModel,
	/**
	 * Entity representing a change tag definition in the wiki
	 */
	changeTagDefinition: typeof ChangeTagDefinitionTypeModel,
	/**
	 * Entity representing an actor of a wiki (anonymus or registered user)
	 */
	actor: typeof ActorTypeModel,
	/**
	 * Entity representing a group of an actor in the wiki
	 */
	actorGroup: typeof ActorGroupTypeModel,
	/**
	 * Entity representing a template referenced on the talk page of an user in the wiki
	 */
	actorUserPageTemplate: typeof ActorUserPageTemplateTypeModel,
	/**
	 * Entity representing a daily edit statistics for a wiki.
	 */
	dailyStatistics: typeof DailyStatisticsTypeModel,
	/**
	 * Entity representing a daily edit statistics of an actor on a wiki.
	 */
	actorDailyStatistics: typeof ActorDailyStatisticsTypeModel,
	/**
	 * Entity representing daily edit statistics for a given namespace on a wiki.
	 */
	dailyStatisticsByNamespace: typeof DailyStatisticsByNamespaceTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given namespace of an actor on a wiki.
	 */
	actorDailyStatisticsByNamespace: typeof ActorDailyStatisticsByNamespaceTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given change tag on a wiki.
	 */
	editStatisticsByChangeTag: typeof EditStatisticsByChangeTagTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given change tag of an actor on a wiki.
	 */
	actorEditStatisticsByChangeTag: typeof ActorEditStatisticsByChangeTagTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given namespace and change tag on a wiki.
	 */
	editStatisticsByNamespaceAndChangeTag: typeof EditStatisticsByNamespaceAndChangeTagTypeModel,
	/**
	 * Entity representing a daily edit statistics for a given namespace and change tag of an actor on a wiki.
	 */
	actorEditStatisticsByNamespaceAndChangeTag: typeof ActorEditStatisticsByNamespaceAndChangeTagTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log type on a wiki.
	 */
	logStatisticsByLogType: typeof LogStatisticsByLogTypeTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log type of an actor on a wiki.
	 */
	actorLogStatisticsByLogType: typeof ActorLogStatisticsByLogTypeTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log action on a wiki.
	 */
	logStatisticsByLogAction: typeof LogStatisticsByLogActionTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log action of an actor on a wiki.
	 */
	actorLogStatisticsByLogAction: typeof ActorLogStatisticsByLogActionTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log type and log action on a wiki.
	 */
	logStatisticsByLogTypeAndLogAction: typeof LogStatisticsByLogTypeAndLogActionTypeModel,
	/**
	 * Entity representing a daily log statistics for a given log type and log action of an actor on a wiki.
	 */
	actorLogStatisticsByLogTypeAndLogAction: typeof ActorLogStatisticsByLogTypeAndLogActionTypeModel,
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

	const cacheEntryTableName = `${wikiId}_cache_entry`;

	const templateTableName = `${wikiId}_template`;
	const changeTagDefTableName = `${wikiId}_change_tag_def`;

	const actorTableName = `${wikiId}_actor`;
	const actorGroupTableName = `${wikiId}_actor_groups`;
	const actorUserPageTemplatesTableName = `${wikiId}_actor_userpage_templates`;

	const dailyStatisticsTableName = `${wikiId}_daily_stats`;
	const actorDailyStatisticsTableName = `${wikiId}_actor_daily_stats`;

	const dailyStatisticsByNamespaceTableName = `${wikiId}_daily_stats_by_ns`;
	const actorDailyStatisticsByNamespaceTableName = `${wikiId}_actor_daily_stats_by_ns`;

	const editStatisticsByChangeTagTableName = `${wikiId}_edit_stats_by_tag`;
	const actorEditStatisticsByChangeTagTableName = `${wikiId}_actor_edit_stats_by_tag`;

	const editStatisticsByNamespaceAndChangeTagTableName = `${wikiId}_edit_stats_by_ns_tag`;
	const actorEditStatisticsByNamespaceAndChangeTagTableName = `${wikiId}_actor_edit_stats_by_ns_tag`;

	const logStatisticsByLogTypeTableName = `${wikiId}_log_stats_by_type`;
	const actorLogStatisticsByLogTypeTableName = `${wikiId}_actor_log_stats_by_type`;

	const logStatisticsByLogActionTableName = `${wikiId}_log_stats_by_action`;
	const actorLogStatisticsByLogActionTableName = `${wikiId}_actor_log_stats_by_action`;

	const logStatisticsByLogTypeAndLogActionTableName = `${wikiId}_log_stats_by_type_action`;
	const actorLogStatisticsByLogTypeAndLogActionTableName = `${wikiId}_actor_log_stats_by_type_action`;

	@Entity({ name: cacheEntryTableName })
	class CacheEntry {
		@PrimaryColumn({ name: "cache_entry_key", type: "bigint", unsigned: true })
		public key: string;

		@Column({ name: "cache_entry_cache_timestamp", type: "datetime" })
		public cacheTimestamp: Date;

		@Column({ name: "cache_entry_start_date", type: "date" })
		public startDate: Date;

		@Column({ name: "cache_entry_end_date", type: "date" })
		public endDate: Date;

		@Column({ name: "cache_entry_content", type: "varchar", length: 255, charset: "utf8" })
		public content: string;
	}

	@Entity({ name: templateTableName })
	class Template {
		@PrimaryColumn({ name: "template_page_id", type: "bigint", unsigned: true })
		public templatePageId: number;

		@Column({ name: "template_name", type: "varchar", length: 255, charset: "utf8" })
		public templateName: string;
	}

	@Entity({ name: changeTagDefTableName })
	class ChangeTagDefinition {
		@PrimaryColumn({ name: "change_tag_def_id", type: "bigint", unsigned: true })
		public changeTagDefinitionId: number;

		@Column({ name: "change_tag_def_name", type: "varchar", length: 255, charset: "utf8" })
		public changeTagDefinitionName: string;
	}

	@Entity({ name: actorTableName })
	class Actor {
		@PrimaryColumn({ name: "actor_id", type: "bigint", unsigned: true })
		public actorId: number;

		@Column({ name: "actor_name", type: "varchar", length: 255, charset: "utf8" })
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

		@PrimaryColumn({ name: "group_name", type: "varchar", length: 255, charset: "utf8" })
		public groupName: string;
	}

	@Entity({ name: actorUserPageTemplatesTableName })
	class ActorUserPageTemplate {
		@PrimaryColumn({ name: "actor_id", type: "bigint", unsigned: true })
		public actorId: number;

		@PrimaryColumn({ name: "template_page_id", type: "bigint", unsigned: true })
		public templatePageId: number;
	}

	@Entity({ name: dailyStatisticsTableName })
	class DailyStatistics {
		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;

		@Column({ name: "daily_reverted_edits", type: "int" })
		public dailyRevertedEdits: number;

		@Column({ name: "reverted_edits_to_date", type: "int" })
		public revertedEditsToDate: number;

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;

		@Column({ name: "daily_received_thanks", type: "int" })
		public dailyReceivedThanks: number;

		@Column({ name: "received_thanks_to_date", type: "int" })
		public receivedThanksToDate: number;

		@Column({ name: "daily_sent_thanks", type: "int" })
		public dailySentThanks: number;

		@Column({ name: "sent_thanks_to_date", type: "int" })
		public sentThanksToDate: number;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorDailyStatisticsTableName })
	class ActorDailyStatistics {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;

		@Column({ name: "daily_reverted_edits", type: "int" })
		public dailyRevertedEdits: number;

		@Column({ name: "reverted_edits_to_date", type: "int" })
		public revertedEditsToDate: number;

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;

		@Column({ name: "daily_received_thanks", type: "int" })
		public dailyReceivedThanks: number;

		@Column({ name: "received_thanks_to_date", type: "int" })
		public receivedThanksToDate: number;

		@Column({ name: "daily_sent_thanks", type: "int" })
		public dailySentThanks: number;

		@Column({ name: "sent_thanks_to_date", type: "int" })
		public sentThanksToDate: number;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;

		@Column({ name: "daily_saward_log_events", type: "int" })
		public dailyServiceAwardLogEvents: number;

		@Column({ name: "saward_log_events_to_date", type: "int" })
		public serviceAwardLogEventsToDate: number;

		@Column({ name: "daily_active_day", type: "int" })
		public dailyActiveDay: number;

		@Column({ name: "active_days_to_date", type: "int" })
		public activeDaysToDate: number;
	}

	@Entity({ name: dailyStatisticsByNamespaceTableName })
	class DailyStatisticsByNamespace {
		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;

		@Column({ name: "daily_reverted_edits", type: "int" })
		public dailyRevertedEdits: number;

		@Column({ name: "reverted_edits_to_date", type: "int" })
		public revertedEditsToDate: number;

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorDailyStatisticsByNamespaceTableName })
	class ActorDailyStatisticsByNamespace {
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

		@Column({ name: "daily_reverted_edits", type: "int" })
		public dailyRevertedEdits: number;

		@Column({ name: "reverted_edits_to_date", type: "int" })
		public revertedEditsToDate: number;

		@Column({ name: "daily_character_changes", type: "int" })
		public dailyCharacterChanges: number;

		@Column({ name: "character_changes_to_date", type: "int" })
		public characterChangesToDate: number;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: editStatisticsByChangeTagTableName })
	class EditStatisticsByChangeTag {
		@PrimaryColumn({ name: "change_tag_id", type: "int" })
		public changeTagId: number;

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

	@Entity({ name: actorEditStatisticsByChangeTagTableName })
	class ActorEditStatisticsByChangeTag {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ name: "change_tag_id", type: "int" })
		public changeTagId: number;

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

	@Entity({ name: editStatisticsByNamespaceAndChangeTagTableName })
	class EditStatisticsByNamespaceAndChangeTag {
		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@PrimaryColumn({ name: "change_tag_id", type: "int" })
		public changeTagId: number;

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

	@Entity({ name: actorEditStatisticsByNamespaceAndChangeTagTableName })
	class ActorEditStatisticsByNamespaceAndChangeTag {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@PrimaryColumn({ name: "change_tag_id", type: "int" })
		public changeTagId: number;

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

	@Entity({ name: logStatisticsByLogTypeTableName })
	class LogStatisticsByLogType {
		@Column({ name: "log_type", type: "varchar", length: 32, charset: "utf8" })
		public logType: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorLogStatisticsByLogTypeTableName })
	class ActorLogStatisticsByLogType {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@Column({ name: "log_type", type: "varchar", length: 32, charset: "utf8" })
		public logType: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: logStatisticsByLogActionTableName })
	class LogStatisticsByLogAction {
		@PrimaryColumn({ name: "log_action", type: "varchar", length: 32, charset: "utf8" })
		public logAction: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorLogStatisticsByLogActionTableName })
	class ActorLogStatisticsByLogAction {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ name: "log_action", type: "varchar", length: 32, charset: "utf8" })
		public logAction: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: logStatisticsByLogTypeAndLogActionTableName })
	class LogStatisticsByLogTypeAndLogAction {
		@PrimaryColumn({ name: "log_type", type: "varchar", length: 32, charset: "utf8" })
		public logType: string;

		@PrimaryColumn({ name: "log_action", type: "varchar", length: 32, charset: "utf8" })
		public logAction: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	@Entity({ name: actorLogStatisticsByLogTypeAndLogActionTableName })
	class ActorLogStatisticsByLogTypeAndLogAction {
		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ name: "log_type", type: "varchar", length: 32, charset: "utf8" })
		public logType: string;

		@PrimaryColumn({ name: "log_action", type: "varchar", length: 32, charset: "utf8" })
		public logAction: string;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_log_events", type: "int" })
		public dailyLogEvents: number;

		@Column({ name: "log_events_to_date", type: "int" })
		public logEventsToDate: number;
	}

	const ret: WikiStatisticsTypesResult = {
		cacheEntry: CacheEntry,
		template: Template,
		changeTagDefinition: ChangeTagDefinition,
		actor: Actor,
		actorGroup: ActorGroup,
		actorUserPageTemplate: ActorUserPageTemplate,
		dailyStatistics: DailyStatistics,
		actorDailyStatistics: ActorDailyStatistics,
		dailyStatisticsByNamespace: DailyStatisticsByNamespace,
		actorDailyStatisticsByNamespace: ActorDailyStatisticsByNamespace,
		editStatisticsByChangeTag: EditStatisticsByChangeTag,
		actorEditStatisticsByChangeTag: ActorEditStatisticsByChangeTag,
		editStatisticsByNamespaceAndChangeTag: EditStatisticsByNamespaceAndChangeTag,
		actorEditStatisticsByNamespaceAndChangeTag: ActorEditStatisticsByNamespaceAndChangeTag,
		logStatisticsByLogType: LogStatisticsByLogType,
		actorLogStatisticsByLogType: ActorLogStatisticsByLogType,
		logStatisticsByLogAction: LogStatisticsByLogAction,
		actorLogStatisticsByLogAction: ActorLogStatisticsByLogAction,
		logStatisticsByLogTypeAndLogAction: LogStatisticsByLogTypeAndLogAction,
		actorLogStatisticsByLogTypeAndLogAction: ActorLogStatisticsByLogTypeAndLogAction,
	};

	ENTITY_CACHE_BY_WIKI[wikiId] = ret;
	return ret;
};
