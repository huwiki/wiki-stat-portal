import { readApplicationConfiguration, readKnownWikisConfiguration } from "../../server/configuration/configurationReader";
import { createConnectionToUserDatabase } from "../../server/database/connectionManager";
import { createWikiStatLogger } from "../../server/loggingHelper";
import { WikiEditCacher } from "./wikiEditCacher";

const runTool = async (): Promise<void> => {
	const logger = createWikiStatLogger("dataCacher");

	const appConfig = await readApplicationConfiguration();
	if (typeof appConfig === "string") {
		logger.error(`[runTool] Failed to start due to invalid application configuration: ${appConfig}`);
		return;
	}

	const knownWikisConfiguration = await readKnownWikisConfiguration();
	if (typeof knownWikisConfiguration === "string" || knownWikisConfiguration.length === 0) {
		logger.error(`[runTool] Failed to start tool due to invalid knownWikis.json: ${knownWikisConfiguration}`);
		return;
	}

	const toolsConnection = await createConnectionToUserDatabase(appConfig, `${appConfig.toolForgeUserName}__userstatistics`,
		knownWikisConfiguration.map(x => x.id));

	for (const wiki of knownWikisConfiguration) {
		// TODO: remove after stabilization
		if (wiki.id !== "huwiki")
			continue;

		const cachr = new WikiEditCacher({
			appConfig: appConfig,
			logger: logger,
			toolsConnection: toolsConnection,
			wiki: wiki
		});

		await cachr.run();
	}

	toolsConnection.close();
};

runTool();
