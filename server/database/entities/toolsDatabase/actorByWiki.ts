import { Column, Entity, PrimaryColumn } from "typeorm";
import { bufferToStringTransformer, intToBooleanTransformer } from "../../transformers";

// const ENTITY_CACHE_BY_WIKI: { [index: string]: unknown } = {};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createActorEntitiesForWiki = (wikiId: string) => {
	// if (ENTITY_CACHE_BY_WIKI[wikiId])
	// 	return ENTITY_CACHE_BY_WIKI[wikiId];

	const actorTableName = `${wikiId}_actor`;
	const actorStatisticsTableName = `${wikiId}_actor_stats`;
	const actorStatisticsByNamespaceTableName = `${wikiId}_actor_stats_by_ns`;

	@Entity({ database: actorTableName })
	class Actor {
		public static tableName = actorTableName;

		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ name: "actor_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public actorName: string;

		@Column({ name: "is_registered", type: "tinyint", transformer: intToBooleanTransformer })
		public isRegistered: boolean;

		@Column({ name: "user_groups", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
		public userGroups: string;
	}

	@Entity({ database: actorStatisticsTableName })
	class ActorStatistics {
		public static tableName = actorStatisticsTableName;

		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;
	}

	@Entity({ database: actorStatisticsByNamespaceTableName })
	class ActorStatisticsByNamespace {
		public static tableName = actorStatisticsByNamespaceTableName;

		@PrimaryColumn({ name: "actor_id", type: "bigint" })
		public actorId: number;

		@PrimaryColumn({ type: "date" })
		public date: Date;

		@PrimaryColumn({ type: "int" })
		public namespace: number;

		@Column({ name: "daily_edits", type: "int" })
		public dailyEdits: number;

		@Column({ name: "edits_to_date", type: "int" })
		public editsToDate: number;
	}

	const ret = {
		actor: Actor,
		actorStatistics: ActorStatistics,
		actorStatisticsByNamespace: ActorStatisticsByNamespace,
	};

	// ENTITY_CACHE_BY_WIKI[wikiId] = ret;
	return ret;
};
