import { Connection } from "typeorm";
import { Logger } from "winston";
import { ApplicationConfiguration } from "./configuration/applicationConfiguration";
import { readApplicationConfiguration, readKnownWikisConfiguration } from "./configuration/configurationReader";
import { createConnectionToUserDatabase } from "./database/connectionManager";
import { KnownWiki } from "./interfaces/knownWiki";
import { createWikiStatLogger } from "./loggingHelper";


export class AppRunningContext {
	public readonly isValid: boolean = false;
	public readonly logger: Logger;
	public readonly appConfig: ApplicationConfiguration;
	public readonly knownWikisConfiguration: KnownWiki[];

	private constructor(appName: string) {
		this.logger = createWikiStatLogger(appName);

		const appConfig = readApplicationConfiguration();
		if (typeof appConfig === "string") {
			this.logger.error(`[AppRunningContext.initialize] Failed to start due to invalid application configuration: ${appConfig}`);
			return;
		}
		this.appConfig = appConfig;

		const knownWikisConfiguration = readKnownWikisConfiguration();
		if (typeof knownWikisConfiguration === "string" || knownWikisConfiguration.length === 0) {
			this.logger.error(`[AppRunningContext.initialize] Failed to start tool due to invalid knownWikis.json: ${knownWikisConfiguration}`);
			return;
		}
		this.knownWikisConfiguration = knownWikisConfiguration;

		this.isValid = true;
	}

	public async getToolsDbConnection(): Promise<Connection> {
		return await createConnectionToUserDatabase(
			this.appConfig,
			`${this.appConfig.toolForgeUserName}__userstatistics`,
			this.knownWikisConfiguration.map(x => x.id)
		);
	}


	private static instances: { [index: string]: AppRunningContext } = {};
	public static getInstance(appName: string): AppRunningContext {
		if (!this.instances[appName]) {
			this.instances[appName] = new AppRunningContext(appName);
		}

		return this.instances[appName];
	}
}
