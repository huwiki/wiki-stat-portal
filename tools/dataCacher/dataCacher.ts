import { AppRunningContext } from "../../server/appRunningContext";
import { WikiEditCacher } from "./wikiEditCacher";

const runTool = async (): Promise<void> => {
	const appCtx = AppRunningContext.getInstance("dataCacher");

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
};

runTool();
