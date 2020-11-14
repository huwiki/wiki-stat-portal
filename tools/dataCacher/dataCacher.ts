import { AppRunningContext } from "../../server/appRunningContext";
import { WikiEditCacher } from "./wikiEditCacher";

const runTool = async (): Promise<void> => {
	const appCtx = new AppRunningContext("dataCacher");

	const toolsConnection = await appCtx.getToolsDbConnection();

	for (const wiki of appCtx.knownWikisConfiguration) {
		// TODO: remove after stabilization
		if (wiki.id !== "huwiki")
			continue;

		const cachr = new WikiEditCacher({
			appCtx: appCtx,
			toolsConnection: toolsConnection,
			wiki: wiki
		});

		await cachr.run();
	}

	toolsConnection.close();
};

runTool();
