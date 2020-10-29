import { Connection, createConnection, getConnectionOptions } from "typeorm";
import { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { User } from "../../server/database/entities/mediawiki/user";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { moduleManager } from "../../server/modules/moduleManager";

const mm = moduleManager;
for (const module of mm.getModules()) {
	console.log(module.identifier);
}

const createConnectionToUserDatabase = async (databaseName: string): Promise<Connection> => {
	const connectionOptions = await getConnectionOptions() as MysqlConnectionOptions;

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
		],
	});
};

const createConnectionToMediaWikiReplica = async (databaseName: string): Promise<Connection> => {
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

const fun = async () => {
	const toolsConnection = await createConnectionToUserDatabase("u27333__userstatistics");
	const mwConnection = await createConnectionToMediaWikiReplica("skwiki_p");

	try {
		const wikiEntry = await toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: "huwiki" } });

		const wikiEntry2 = await toolsConnection.getRepository(WikiProcessedRevisions)
			.findOne({ where: { wiki: "skwiki" } });

		console.log(wikiEntry, "wikiEntry");
		console.log(wikiEntry2, "wikiEntry2");

		console.log(await toolsConnection.createQueryBuilder()
			.insert()
			.into(WikiProcessedRevisions)
			.values({
				wiki: "huwiki",
				lastProcessedRevisionId: 4
			})
			.execute());

		const ret = await mwConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("rev.comment", "comm")
			.leftJoinAndSelect("act.user", "usr")
			.orderBy("rev.id", "DESC")
			.limit(10)
			.getMany();

		const revs = await mwConnection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.parentRevision", "p")
			.offset(10)
			.limit(1)
			.getMany();

		const users = await mwConnection.getRepository(User)
			.createQueryBuilder("usr")
			.leftJoinAndSelect("usr.userGroups", "ug")
			.offset(10)
			.limit(1)
			.getMany();

		for (const ele of ret) {
			console.log(ele);
		}

		for (const ele of revs) {
			console.log(ele);
		}

		for (const usr of users) {
			console.log(usr);
		}
	}
	catch (err) {
		console.log(err, "baj van");
	}

	mwConnection.close();
	toolsConnection.close();
};

fun();
