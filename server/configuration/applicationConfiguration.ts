export interface ApplicationConfiguration {
	toolForgeUserName: string;
	toolForgePassword: string;

	replicaDbHost: string;
	replicaDbPort: number;

	toolsDbHost: string;
	toolsDbPort: number;

	dataCacher: {
		revisionsProcessedAtOnce: number,
		logEntriesProcessedAtOnce: number,
		maxRevisionsProcessedInASingleRun: number;
		maxLogEntriesProcessedInASingleRun: number;
		maxActorsProcessedInASingleRun: number;
	}
}
