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
	groups: UserPyramidGroup[];
}

export interface UserPyramidGroup {
	name: string;
	requirements: UserPyramidRequirement[];
}

export interface UserPyramidRequirement {
	registrationStatus?: ("registered" | "anon")[],
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;
	userGroups?: ("bot" | "bureaucrat" | "checkuser"
		| "editor" | "flow-bot" | "interface-admin"
		| "interface-editor" | "sysop"
		| "templateeditor" | "trusted")[];
	totalEditsAtLeast?: number;
	totalEditsAtMost?: number;
	inPeriodEditsAtLeast?: UserEditsInPeriod;
	inPeriodEditsAtMost?: UserEditsInPeriod;
}

export interface UserEditsInPeriod {
	edits: number;
	period: number;
	epoch?: number;
}
