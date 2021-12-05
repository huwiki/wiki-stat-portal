import { UserRequirements } from "../commonConfiguration";

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
	name: string;
	itemCount: number;
	userRequirements: UserRequirements;
	isTimeless: boolean;
}

export function isNonLocalizedTopListConfiguration(obj: unknown): obj is NonLocalizedTopListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["name"] === "string";
}


export interface LocalizedTopListConfiguration {
	id: string;
	i18nKey: string;
	itemCount: number;
	isTimeless: boolean;
	userRequirements: UserRequirements;
}

export function isLocalizedTopListConfiguration(obj: unknown): obj is LocalizedTopListConfiguration {
	return typeof obj === "object"
		&& obj != null
		&& typeof obj["i18nKey"] === "string";
}
