import { Connection, createConnection, getConnectionOptions } from "typeorm";
import { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import { createActorEntitiesForWiki } from "./entities/toolsDatabase/actorByWiki";

export const createConnectionToUserDatabase = async (databaseName: string, wikis: string[]): Promise<Connection> => {
	const connectionOptions = await getConnectionOptions() as MysqlConnectionOptions;

	// eslint-disable-next-line @typescript-eslint/ban-types
	const items: Function[] = [];
	for (const wikiId of wikis) {
		const entities = createActorEntitiesForWiki(wikiId);
		items.push(entities.actor, entities.actorStatistics, entities.actorStatisticsByNamespace);
	}

	return await createConnection({
		...connectionOptions,
		type: "mysql",
		name: "toolsDb",
		// TODO: move to config
		port: 4712,
		database: databaseName,
		synchronize: false,
		logging: false,
		entities: [
			"server/database/entities/toolsDatabase/**/*.js",
			...items
		],
	});
};

export const createConnectionToMediaWikiReplica = async (databaseName: string): Promise<Connection> => {
	const connectionOptions = await getConnectionOptions() as MysqlConnectionOptions;

	return await createConnection({
		...connectionOptions,
		name: "mwReplicas",
		type: "mysql",
		// TODO: move to config
		port: 4711,
		database: databaseName,
		synchronize: false,
		logging: false,
		entities: [
			"server/database/entities/mediawiki/**/*.js"
		],
	});
};
