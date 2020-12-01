import { isArray } from "lodash";

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

export type UserPyramidConfiguration =
	NonLocalizedUserPyramidConfiguration
	| LocalizedUserPyramidConfiguration;

export interface NonLocalizedUserPyramidConfiguration {
	id: string;
	isTimeless: boolean;
	showIntersectionWithPreviousGroup?: boolean;
	name: string;
	groups: NonLocalizedUserPyramidGroup[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNonLocalizedUserPyramidConfiguration(obj: any): obj is NonLocalizedUserPyramidConfiguration {
	return typeof obj.name === "string"
		&& isArray(obj.groups) === true;
}


export interface LocalizedUserPyramidConfiguration {
	id: string;
	isTimeless: boolean;
	showIntersectionWithPreviousGroup?: boolean;
	i18nKey: string;
	groups: LocalizedUserPyramidGroup[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLocalizedUserPyramidConfiguration(obj: any): obj is LocalizedUserPyramidConfiguration {
	return typeof obj.i18nKey === "string"
		&& isArray(obj.groups) === true;
}

export type UserPyramidGroup =
	NonLocalizedUserPyramidGroup
	| LocalizedUserPyramidGroup;

export interface NonLocalizedUserPyramidGroup {
	name: string;
	requirements: UserPyramidRequirements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNonLocalizedUserPyramidGroup(obj: any): obj is NonLocalizedUserPyramidGroup {
	return typeof obj.name === "string"
		&& typeof obj.requirements === "object";
}

export interface LocalizedUserPyramidGroup {
	i18nKey: string;
	requirements: UserPyramidRequirements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isLocalizedUserPyramidGroup(obj: any): obj is LocalizedUserPyramidGroup {
	return typeof obj.i18nKey === "string"
		&& typeof obj.requirements === "object";
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
