import { isArray } from "lodash";
import { UserRequirements } from "../commonConfiguration";

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

export function isNonLocalizedUserPyramidConfiguration(obj: unknown): obj is NonLocalizedUserPyramidConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["name"] === "string"
		&& isArray(obj["groups"]) === true;
}


export interface LocalizedUserPyramidConfiguration {
	id: string;
	isTimeless: boolean;
	showIntersectionWithPreviousGroup?: boolean;
	i18nKey: string;
	groups: LocalizedUserPyramidGroup[];
}

export function isLocalizedUserPyramidConfiguration(obj: unknown): obj is LocalizedUserPyramidConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["i18nKey"] === "string"
		&& isArray(obj["groups"]) === true;
}

export type UserPyramidGroup =
	NonLocalizedUserPyramidGroup
	| LocalizedUserPyramidGroup;

export interface NonLocalizedUserPyramidGroup {
	name: string;
	requirements: UserRequirements;
}

export function isNonLocalizedUserPyramidGroup(obj: unknown): obj is NonLocalizedUserPyramidGroup {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["name"] === "string"
		&& typeof obj["requirements"] === "object";
}

export interface LocalizedUserPyramidGroup {
	i18nKey: string;
	requirements: UserRequirements;
}

export function isLocalizedUserPyramidGroup(obj: unknown): obj is LocalizedUserPyramidGroup {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["i18nKey"] === "string"
		&& typeof obj["requirements"] === "object";
}
