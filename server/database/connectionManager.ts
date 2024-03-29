import { Connection, createConnection } from "typeorm";
import { ApplicationConfiguration } from "../configuration/applicationConfiguration";
import { Actor, Comment, Page, Revision, User, UserGroup } from "./entities/mediawiki";
import { ChangeTag } from "./entities/mediawiki/changeTag";
import { ChangeTagDefinition } from "./entities/mediawiki/changeTagDefinition";
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
		items.push(
			entities.cacheEntry,

			entities.template,
			entities.changeTagDefinition,

			entities.actor,
			entities.actorGroup,
			entities.actorUserPageTemplate,

			entities.dailyStatistics,
			entities.actorDailyStatistics,
			entities.dailyStatisticsByNamespace,
			entities.actorDailyStatisticsByNamespace,
			entities.editStatisticsByChangeTag,
			entities.actorEditStatisticsByChangeTag,
			entities.editStatisticsByNamespaceAndChangeTag,
			entities.actorEditStatisticsByNamespaceAndChangeTag,

			entities.logStatisticsByLogType,
			entities.actorLogStatisticsByLogType,
			entities.logStatisticsByLogAction,
			entities.actorLogStatisticsByLogAction,
			entities.logStatisticsByLogTypeAndLogAction,
			entities.actorLogStatisticsByLogTypeAndLogAction
		);
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
		bigNumberStrings: false,
		charset: "utf8mb4",
		timezone: "Z",
		entities: [
			WikiProcessedRevisions,
			...items
		],
	});
};

export const createConnectionToMediaWikiReplica = async (
	appConfig: ApplicationConfiguration,
	wikiId: string,
	databaseName: string
): Promise<Connection> => {
	connectionCounter++;

	return await createConnection({
		name: MW_REPLICAS_DB_CONNECTION_NAME + connectionCounter.toString(),
		type: "mysql",
		host: appConfig.replicaDbHost.replace("{wikiId}", wikiId),
		port: appConfig.replicaDbPort,
		username: appConfig.toolForgeUserName,
		password: appConfig.toolForgePassword,
		database: databaseName,
		synchronize: false,
		logging: false,
		bigNumberStrings: false,
		timezone: "Z",
		extra: {
			connectionLimit: 1
		},
		entities: [
			Actor,
			ChangeTag,
			ChangeTagDefinition,
			Comment,
			LogEntry,
			Page,
			Revision,
			User,
			UserGroup
		],
	});
};
