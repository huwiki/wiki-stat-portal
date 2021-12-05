import { Logger } from "winston";
import { AppRunningContext } from "../../server/appRunningContext";
import { WikiEditCacher } from "./wikiEditCacher";

const runTool = async (): Promise<void> => {
	let logger: Logger | null = null;
	try {
		const appCtx = AppRunningContext.getInstance("dataCacher");
		logger = appCtx.logger;

		const toolsConnection = await appCtx.getToolsDbConnection();

		for (const wiki of appCtx.getKnownWikis()) {
			const cachr = new WikiEditCacher({
				appCtx: appCtx,
				toolsConnection: toolsConnection,
				wiki: wiki
			});

			await cachr.run();
		}

		toolsConnection.close();
	}
	catch (err) {
		if (logger) {
			logger.error(err);
		} else {
			console.log(err, "error");
		}
		process.exit(1);
	}
};

runTool();
