export interface UserPyramidConfigurationFile {
	use: string;
	userPyramids?: UserPyramidConfiguration[];
}

export type WikiUserPyramidConfigurations =
	{
		wiki: string;
		valid: false;
		validationError: string;
	} | {
		wiki: string;
		valid: true;
		userPyramids: UserPyramidConfiguration[];
	};

export interface UserPyramidConfiguration {
	id: string;
	name: string;
	showIntersectionWithPreviousGroup?: boolean;
	groups: UserPyramidGroup[];
}

export interface UserPyramidGroup {
	name: string;
	requirements: UserPyramidRequirements;
}

export interface UserPyramidRequirements {
	registrationStatus?: "registered" | "anon",
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;
	userGroups?: ("bot" | "bureaucrat" | "checkuser"
		| "editor" | "flow-bot" | "interface-admin"
		| "interface-editor" | "sysop"
		| "templateeditor" | "trusted")[];
	totalEditsAtLeast?: number | UserEditsInTime;
	totalEditsAtMost?: number | UserEditsInTime;
	inPeriodEditsAtLeast?: UserEditsInPeriod;
	inPeriodEditsAtMost?: UserEditsInPeriod;
}

export interface UserEditsInTime {
	edits: number;
	epoch: number;
}

export interface UserEditsInPeriod {
	edits: number;
	period: number;
	epoch?: number;
}
