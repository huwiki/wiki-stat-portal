import { Connection, createConnection } from "typeorm";
import { ApplicationConfiguration } from "../configuration/applicationConfiguration";
import { Actor, Comment, Page, Revision, User, UserGroup } from "./entities/mediawiki";
import { LogEntry } from "./entities/mediawiki/logEntry";
import { createActorEntitiesForWiki } from "./entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "./entities/toolsDatabase/wikiProcessedRevisions";

const TOOLS_DB_CONNECTION_NAME: string = "toolsDb";
const MW_REPLICAS_DB_CONNECTION_NAME: string = "toolsDb";
let connectionCounter = 0;

export const createConnectionToUserDatabase = async (appConfig: ApplicationConfiguration, databaseName: string, wikis: string[]): Promise<Connection> => {
	connectionCounter++;

	// eslint-disable-next-line @typescript-eslint/ban-types
	const items: Function[] = [];
	for (const wikiId of wikis) {
		const entities = createActorEntitiesForWiki(wikiId);
		items.push(entities.actor, entities.actorGroup, entities.actorEditStatistics, entities.actorEditStatisticsByNamespace, entities.actorLogStatistics, entities.actorLogStatisticsByNamespaceAndLogType);
	}

	return await createConnection({
		type: "mysql",
		name: TOOLS_DB_CONNECTION_NAME + connectionCounter.toString(),
		host: appConfig.toolsDbHost,
		port: appConfig.toolsDbPort,
		username: appConfig.toolForgeUserName,
		password: appConfig.toolForgePassword,
		database: databaseName,
		synchronize: false,
		logging: false,
		entities: [
			WikiProcessedRevisions,
			...items
		],
	});
};

export const createConnectionToMediaWikiReplica = async (appConfig: ApplicationConfiguration, databaseName: string): Promise<Connection> => {
	connectionCounter++;

	return await createConnection({
		name: MW_REPLICAS_DB_CONNECTION_NAME + connectionCounter.toString(),
		type: "mysql",
		host: appConfig.replicaDbHost,
		port: appConfig.replicaDbPort,
		username: appConfig.toolForgeUserName,
		password: appConfig.toolForgePassword,
		database: databaseName,
		synchronize: false,
		logging: false,
		extra: {
			connectionLimit: 1
		},
		entities: [
			Actor,
			Comment,
			LogEntry,
			Page,
			Revision,
			User,
			UserGroup
		],
	});
};
