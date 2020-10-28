import { Connection, createConnection, getConnectionOptions } from "typeorm";
import { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import { Revision } from "../../server/database/entities/mediawiki/revision";
import { User } from "../../server/database/entities/mediawiki/user";
import { moduleManager } from "../../server/modules/moduleManager";

const mm = moduleManager;
for (const module of mm.getModules()) {
	console.log(module.identifier);
}

const createConnectionToWikiDatabase = async (databaseName: string): Promise<Connection> => {
	const connectionOptions = await getConnectionOptions() as MysqlConnectionOptions;

	return await createConnection({
		...connectionOptions,
		type: "mysql",
		database: databaseName,
		synchronize: false,
		logging: false,
		entities: [
			"server/database/entities/mediawiki/**/*.js"
		],
	});
};

const fun = async () => {
	const connection = await createConnectionToWikiDatabase("skwiki_p");

	try {

		const ret = await connection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.page", "page")
			.leftJoinAndSelect("rev.actor", "act")
			.leftJoinAndSelect("rev.comment", "comm")
			.leftJoinAndSelect("act.user", "usr")
			.orderBy("rev.id", "DESC")
			.limit(10)
			.getMany();

		const revs = await connection.getRepository(Revision)
			.createQueryBuilder("rev")
			.leftJoinAndSelect("rev.parentRevision", "p")
			.offset(10)
			.limit(1)
			.getMany();

		const users = await connection.getRepository(User)
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

	connection.close();
};

fun();
