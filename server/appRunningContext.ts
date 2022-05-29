import { Connection } from "typeorm";
import { Logger } from "winston";
import { ApplicationConfiguration } from "./configuration/applicationConfiguration";
import { readApplicationConfiguration, readFlaglessBotList } from "./configuration/configurationReader";
import { readKnownWikisConfiguration, readKnownWikisSecretsConfiguration } from "./configuration/knownWikisConfigurationReader";
import { readServiceAwardLevelsConfiguration } from "./configuration/serviceAwardLevelsConfigurationReader";
import { createConnectionToUserDatabase } from "./database/connectionManager";
import { initializeI18nData } from "./helpers/i18nServer";
import { KnownWiki } from "./interfaces/knownWiki";
import { createWikiStatLogger } from "./loggingHelper";

export class AppRunningContext {
	public readonly isValid: boolean = false;
	public readonly logger: Logger;
	public readonly appConfig: ApplicationConfiguration;
	private readonly knownWikisConfiguration: KnownWiki[];

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

		const knownWikisSecretsConfiguration = readKnownWikisSecretsConfiguration();
		if (typeof knownWikisSecretsConfiguration === "string" || knownWikisSecretsConfiguration.length === 0) {
			this.logger.error(`[AppRunningContext.initialize] Failed to start tool due to invalid knownWikis.secrets.json: ${knownWikisSecretsConfiguration}`);
			return;
		}

		this.knownWikisConfiguration = knownWikisConfiguration;

		for (const wiki of knownWikisConfiguration) {
			const secrets = knownWikisSecretsConfiguration.find(x => x.id === wiki.id);
			wiki.botUserName = secrets?.botUserName;
			wiki.botPassword = secrets?.botPassword;

			wiki.flaglessBots = readFlaglessBotList(wiki);

			const serviceAwardLevels = readServiceAwardLevelsConfiguration(wiki);
			if (typeof serviceAwardLevels === "string") {
				this.logger.error(`[AppRunningContext.initialize/${wiki.id}] Failed to start tool due to invalid serviceAwardLevel.json: ${serviceAwardLevels}`);
				return;
			}
			wiki.serviceAwardLevels = serviceAwardLevels ?? [];
		}

		initializeI18nData();

		this.isValid = true;
	}

	public getKnownWikis(): KnownWiki[] {
		return this.knownWikisConfiguration.map(knownWiki => ({ ...knownWiki }));
	}

	public getKnownWikiById(wikiId?: string): KnownWiki | null {
		if (!wikiId)
			return null;

		const knownWiki = this.knownWikisConfiguration.find(x => x.id === wikiId);
		if (!knownWiki)
			return null;

		return { ...knownWiki };
	}

	public async getToolsDbConnection(): Promise<Connection> {
		return await createConnectionToUserDatabase(
			this.appConfig,
			`${this.appConfig.toolForgeUserName}__userstatistics2`,
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
