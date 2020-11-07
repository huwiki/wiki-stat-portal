import { Connection, createConnection } from "typeorm";
import { ApplicationConfiguration } from "../configuration/applicationConfiguration";
import { Actor, Comment, Page, Revision, User, UserGroup } from "./entities/mediawiki";
import { createActorEntitiesForWiki } from "./entities/toolsDatabase/actorByWiki";
import { WikiProcessedRevisions } from "./entities/toolsDatabase/wikiProcessedRevisions";

export const createConnectionToUserDatabase = async (appConfig: ApplicationConfiguration, databaseName: string, wikis: string[]): Promise<Connection> => {
	// eslint-disable-next-line @typescript-eslint/ban-types
	const items: Function[] = [];
	for (const wikiId of wikis) {
		const entities = createActorEntitiesForWiki(wikiId);
		items.push(entities.actor, entities.actorStatistics, entities.actorStatisticsByNamespace);
	}

	return await createConnection({
		type: "mysql",
		name: "toolsDb",
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
	return await createConnection({
		name: "mwReplicas",
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
			Page,
			Revision,
			User,
			UserGroup
		],
	});
};
