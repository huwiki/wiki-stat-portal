
export interface TopListConfigurationFile {
	use: string;
	topLists?: TopListConfiguration[];
}

export type WikiTopListConfigurations =
	{
		wiki: string;
		valid: false;
		validationError: string;
	} | {
		wiki: string;
		valid: true;
		topLists: TopListConfiguration[];
	};

export type TopListConfiguration =
	NonLocalizedTopListConfiguration
	| LocalizedTopListConfiguration;

export interface NonLocalizedTopListConfiguration {
	id: string;
	isTimeless: boolean;
	name: string;
	userRequirements: TopListUserRequirements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNonLocalizedTopListConfiguration(obj: any): obj is NonLocalizedTopListConfiguration {
	return typeof obj.name === "string";
}


export interface LocalizedTopListConfiguration {
	id: string;
	isTimeless: boolean;
	showIntersectionWithPreviousGroup?: boolean;
	i18nKey: string;
	userRequirements: TopListUserRequirements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLocalizedTopListConfiguration(obj: any): obj is LocalizedTopListConfiguration {
	return typeof obj.i18nKey === "string";
}

export interface TopListUserRequirements {
	registrationStatus?: "registered" | "anon",
	registrationAgeAtLeast?: number;
	registrationAgeAtMost?: number;
	userGroups?: ("bot" | "bureaucrat" | "checkuser"
		| "editor" | "flow-bot" | "interface-admin"
		| "interface-editor" | "sysop"
		| "templateeditor" | "trusted")[];
	totalEditsAtLeast?: number | UserEditsInTimeRequirement;
	totalEditsAtMost?: number | UserEditsInTimeRequirement;
	inPeriodEditsAtLeast?: UserEditsInPeriodRequirement;
	inPeriodEditsAtMost?: UserEditsInPeriodRequirement;
}

export interface UserEditsInTimeRequirement {
	edits: number;
	epoch: number;
}

export interface UserEditsInPeriodRequirement {
	edits: number;
	period: number;
	epoch?: number;
}
