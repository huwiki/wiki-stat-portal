import { ServiceAwardLevelDefinition } from "./serviceAwardLevelDefinition";

export interface KnownWiki {
	id: string;
	domain: string;
	replicaDatabaseName: string;
	languageCode: string;
	timeZone: string;
	flaglessBots: string[];
	serviceAwardLevels: ServiceAwardLevelDefinition[];

	hasServiceAwards: boolean;
	serviceAwardPageName: string;
	botUserName?: string;
	botPassword?: string;
}
