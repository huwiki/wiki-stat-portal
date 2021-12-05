import { ServiceAwardLevelDefinition } from "./serviceAwardLevelDefinition";

export interface KnownWiki {
	id: string;
	domain: string;
	replicaDatabaseName: string;
	timeZone: string;
	flaglessBots: string[];
	serviceAwardLevels: ServiceAwardLevelDefinition[] | null;
}
