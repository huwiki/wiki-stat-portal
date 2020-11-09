import { readApplicationConfiguration } from "../../server/configuration/configurationReader";
import { createConnectionToMediaWikiReplica, createConnectionToUserDatabase } from "../../server/database/connectionManager";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { User } from "../../server/database/entities/mediawiki/user";
import { WikiProcessedRevisions } from "../../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { createWikiStatLogger } from "../../server/loggingHelper";
import { moduleManager } from "../../server/modules/moduleManager";

const mm = moduleManager;
for (const module of mm.getModules()) {
	console.log(module.identifier);
}

const fun = async () => {
	const logger = createWikiStatLogger("dbStuffTest");

	const appConfig = readApplicationConfiguration();
	if (typeof appConfig === "string") {
		logger.error(`[runTool] Failed to start due to invalid application configuration: ${appConfig}`);
		return;
	}

	const toolsConnection = await createConnectionToUserDatabase(appConfig, `${appConfig.toolForgeUserName}__userstatistics`, ["huwiki"]);
	const mwConnection = await createConnectionToMediaWikiReplica(appConfig, "skwiki_p");

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
